/**
 * Segundo factor con reto: `startMfaOrComplete` decide tras la primera prueba de identidad
 * y `POST /mfa` cierra el acceso con un código TOTP o de respaldo.
 */
import { Router } from 'express';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { ClientFactory } from '../../core/tenant/ClientFactory';
import * as schema from '../../db/schema';
import { verifyTwoFactor } from '../twofa';
import {
  consumeChallenge,
  createChallenge,
  failChallenge,
  findChallenge,
  parseData,
  reserveAttempt,
} from '../../core/auth/challenges';
import { checkThrottle, recordAttempt, sendThrottled } from '../../core/auth/throttle';
import { clientInfo } from '../../core/auth/clientInfo';
import { completeLogin, loginPolicyBlock, rejectByPolicy } from './completeLogin';
import { recordAuthEvent } from '../../core/auth/authEvents';

const router = Router();

const MFA_TTL_MS = 5 * 60_000;
const MFA_MAX_ATTEMPTS = 5;

export interface StartMfaOpts {
  method: string;
  mfa?: string | null;
  tenantId?: string | null;
}

/** Tras la primera prueba de identidad: pide el segundo factor, o abre la sesión si no hace falta. */
export async function startMfaOrComplete(
  req: any,
  res: any,
  user: any,
  opts: StartMfaOpts,
): Promise<void> {
  // El acceso ya trae su propio segundo factor (passkey, proveedor...): no se pide otro.
  if (opts.mfa) {
    return completeLogin(req, res, user, {
      method: opts.method,
      mfa: opts.mfa,
      tenantId: opts.tenantId,
    });
  }
  // Una forma de entrar que la empresa no admite falla antes de pedir ningún código.
  const blocked = await loginPolicyBlock(user, opts.tenantId, opts.method);
  if (blocked) return rejectByPolicy(req, res, user, opts.method, blocked);
  const db = ClientFactory.getClient('public');
  const [passkey] = await db
    .select({ id: schema.userPasskeys.id })
    .from(schema.userPasskeys)
    .where(eq(schema.userPasskeys.userId, user.id))
    .limit(1);

  if (!user.totpEnabled && !passkey) {
    return completeLogin(req, res, user, {
      method: opts.method,
      mfa: null,
      tenantId: opts.tenantId,
    });
  }

  const { secret } = await createChallenge('mfa', {
    userId: user.id,
    ttlMs: MFA_TTL_MS,
    maxAttempts: MFA_MAX_ATTEMPTS,
    data: { method: opts.method, tenantId: opts.tenantId ?? null },
  });
  res.json({
    mfaRequired: true,
    // Compatibilidad con la web que aún pregunta por esta clave.
    twoFactorRequired: true,
    challenge: secret,
    methods: user.totpEnabled ? ['totp', 'backup'] : [],
    user: { name: user.username, email: user.email, avatarImageUrl: user.avatarImageUrl ?? null },
  });
}

/**
 * Comprueba un código de segundo factor del usuario y lo gasta. Un TOTP solo vale si su paso
 * es posterior al último aceptado (condición en el UPDATE, así dos peticiones a la vez no lo
 * usan las dos); un respaldo, si sigue en la lista.
 */
export async function consumeUserCode(
  user: any,
  code: string,
): Promise<{ ok: false } | { ok: true; mfa: 'totp' | 'backup' }> {
  const db = ClientFactory.getClient('public');
  const check = verifyTwoFactor(
    String(code),
    user.totpSecret,
    user.totpBackupCodes,
    user.totpLastStep ?? null,
  );
  if (!check.ok) return { ok: false };

  if (check.usedBackup) {
    const rows = await db
      .update(schema.globalUsers)
      .set({
        totpBackupCodes: JSON.stringify(check.remainingBackups || []),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.globalUsers.id, user.id),
          eq(schema.globalUsers.totpBackupCodes, user.totpBackupCodes),
        ),
      )
      .returning({ id: schema.globalUsers.id });
    return rows.length ? { ok: true, mfa: 'backup' } : { ok: false };
  }

  const rows = await db
    .update(schema.globalUsers)
    .set({ totpLastStep: check.step, updatedAt: new Date() })
    .where(
      and(
        eq(schema.globalUsers.id, user.id),
        or(
          isNull(schema.globalUsers.totpLastStep),
          lt(schema.globalUsers.totpLastStep, check.step!),
        ),
      ),
    )
    .returning({ id: schema.globalUsers.id });
  return rows.length ? { ok: true, mfa: 'totp' } : { ok: false };
}

const expired = (res: any) =>
  res.status(401).json({
    error: 'El paso de verificación ha caducado. Vuelve a entrar.',
    code: 'MFA_CHALLENGE_EXPIRED',
  });

/**
 * POST /api/auth/mfa { challenge, code?, passkey? }
 */
router.post('/mfa', async (req, res) => {
  const { challenge, code, passkey } = req.body || {};
  try {
    const row = typeof challenge === 'string' ? await findChallenge('mfa', challenge) : null;
    if (!row || !row.userId) return expired(res);

    if (passkey !== undefined) {
      return res.status(400).json({ error: 'Passkey no disponible todavía' });
    }
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Falta el código' });
    }

    // El intento se reserva antes de mirar el código: lo que acota los fallos es el reto.
    if (!(await reserveAttempt(row.id))) return expired(res);

    const keys = { account: row.userId, ip: clientInfo(req).ip };
    const gate = await checkThrottle('mfa', keys);
    if (gate.blocked) return sendThrottled(res, gate.retryAfter);

    const db = ClientFactory.getClient('public');
    const [user] = await db
      .select()
      .from(schema.globalUsers)
      .where(eq(schema.globalUsers.id, row.userId));
    if (!user) return expired(res);

    const used = await consumeUserCode(user, code);
    if (!used.ok) {
      await recordAttempt('mfa', keys, false);
      void recordAuthEvent({
        userId: user.id,
        kind: 'mfa',
        ok: false,
        method: 'totp',
        client: clientInfo(req),
      });
      // El intento ya está contado; si era el último, el reto se agota.
      await failChallenge(row.id);
      return res.status(401).json({ error: 'Código no válido', code: 'MFA_INVALID' });
    }

    // Un reto vale una vez: si otra petición se adelantó, no se abre otra sesión.
    if (!(await consumeChallenge(row.id))) return expired(res);
    await recordAttempt('mfa', keys, true);

    const data = parseData(row);
    await completeLogin(req, res, user, {
      method: data.method || 'password',
      mfa: used.mfa,
      tenantId: data.tenantId ?? null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
