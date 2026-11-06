/**
 * Passkeys: alta, lista, nombre y baja (con sesión) y entrada sin contraseña (sin sesión).
 * `/api/auth` se monta antes del contexto de empresa, así que la sesión se pide con `requireSession`.
 */
import { Router, type Request, type Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { ClientFactory } from '../../core/tenant/ClientFactory';
import * as schema from '../../db/schema';
import { requireSession } from './sessionRoutes';
import { completeLogin } from './completeLogin';
import { revokeAllForUser, setSessionTenant } from '../../core/auth/sessions';
import { recordAuthEvent } from '../../core/auth/authEvents';
import { clientInfo } from '../../core/auth/clientInfo';
import { findChallenge } from '../../core/auth/challenges';
import { mfaRequiredSomewhere } from '../../core/auth/policy';
import { checkThrottle, recordAttempt, sendThrottled } from '../../core/auth/throttle';
import {
  PasskeyError,
  authenticationOptions,
  registrationOptions,
  rpFor,
  verifyAuthentication,
  verifyRegistration,
} from '../../core/auth/passkeys';

const router = Router();

const db = () => ClientFactory.getClient('public');

/** El RP del origen de la petición, o responde 400 y devuelve `null`. */
function rpOrReject(req: Request, res: Response) {
  const rp = rpFor(req.headers.origin as string | undefined);
  if (!rp) {
    res.status(400).json({
      error: 'Este origen no admite passkeys',
      code: 'ORIGIN_NOT_ALLOWED',
    });
  }
  return rp;
}

function fail(res: Response, e: any) {
  if (e instanceof PasskeyError) {
    return res.status(e.status).json({ error: e.message, code: e.code });
  }
  console.error('[passkeys]', e?.message);
  return res.status(500).json({ error: 'Error interno' });
}

async function loadUser(id: string) {
  const [user] = await db().select().from(schema.globalUsers).where(eq(schema.globalUsers.id, id));
  return user ?? null;
}

/** POST /api/auth/passkeys/register/options — empieza el alta de una passkey. */
router.post('/passkeys/register/options', async (req, res) => {
  const session = await requireSession(req, res);
  if (!session) return;
  const rp = rpOrReject(req, res);
  if (!rp) return;
  try {
    const user = await loadUser(session.userId);
    if (!user) return res.status(401).json({ error: 'No autorizado', code: 'UNAUTHORIZED' });
    res.json(await registrationOptions(user, rp));
  } catch (e) {
    fail(res, e);
  }
});

/** POST /api/auth/passkeys/register/verify { response, name } */
router.post('/passkeys/register/verify', async (req, res) => {
  const session = await requireSession(req, res);
  if (!session) return;
  const rp = rpOrReject(req, res);
  if (!rp) return;
  const { response, name } = req.body || {};
  try {
    const row = await verifyRegistration({ id: session.userId }, rp, response, name);
    // Una sesión limitada a dar de alta su segundo factor queda libre con él.
    if (session.restricted === 'mfa_setup') {
      await setSessionTenant(session.id, session.tenantId, null);
    }
    await revokeAllForUser(session.userId, 'passkey_added', session.id);
    await recordAuthEvent({
      userId: session.userId,
      kind: 'passkey_add',
      ok: true,
      client: clientInfo(req),
      detail: { passkeyId: row.id, rpId: row.rpId },
    });
    res.status(201).json({ id: row.id, name: row.name, rpId: row.rpId, createdAt: row.createdAt });
  } catch (e) {
    fail(res, e);
  }
});

/** GET /api/auth/passkeys — las del usuario; `here` dice si sirven en este cliente. */
router.get('/passkeys', async (req, res) => {
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    const here = rpFor(req.headers.origin as string | undefined)?.rpId;
    const rows = await db()
      .select()
      .from(schema.userPasskeys)
      .where(eq(schema.userPasskeys.userId, session.userId));
    res.json(
      rows
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((p) => ({
          id: p.id,
          name: p.name,
          rpId: p.rpId,
          createdAt: p.createdAt,
          lastUsedAt: p.lastUsedAt,
          here: p.rpId === here,
        })),
    );
  } catch (e) {
    fail(res, e);
  }
});

/** PATCH /api/auth/passkeys/:id { name } */
router.patch('/passkeys/:id', async (req, res) => {
  const session = await requireSession(req, res);
  if (!session) return;
  const name = String(req.body?.name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'Falta el nombre' });
  try {
    const rows = await db()
      .update(schema.userPasskeys)
      .set({ name: name.slice(0, 80) })
      .where(
        and(
          eq(schema.userPasskeys.id, req.params.id),
          eq(schema.userPasskeys.userId, session.userId),
        ),
      )
      .returning({ id: schema.userPasskeys.id, name: schema.userPasskeys.name });
    if (!rows.length) return res.status(404).json({ error: 'Passkey no encontrada' });
    res.json(rows[0]);
  } catch (e) {
    fail(res, e);
  }
});

/** DELETE /api/auth/passkeys/:id */
router.delete('/passkeys/:id', async (req, res) => {
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    const mine = await db()
      .select()
      .from(schema.userPasskeys)
      .where(eq(schema.userPasskeys.userId, session.userId));
    const target = mine.find((p) => p.id === req.params.id);
    if (!target) return res.status(404).json({ error: 'Passkey no encontrada' });

    const user = await loadUser(session.userId);
    const lastFactor = !user?.totpEnabled && mine.length === 1;
    if (lastFactor && (await mfaRequiredSomewhere(session.userId))) {
      return res.status(409).json({
        error: 'Tu empresa exige un segundo factor: es el último que te queda',
        code: 'MFA_REQUIRED_BY_POLICY',
      });
    }
    await db().delete(schema.userPasskeys).where(eq(schema.userPasskeys.id, target.id));
    await revokeAllForUser(session.userId, 'passkey_removed', session.id);
    await recordAuthEvent({
      userId: session.userId,
      kind: 'passkey_remove',
      ok: true,
      client: clientInfo(req),
      detail: { passkeyId: target.id, rpId: target.rpId },
    });
    res.status(204).end();
  } catch (e) {
    fail(res, e);
  }
});

/**
 * POST /api/auth/passkey/options { challenge? } → { options, challenge }
 * Sin cuerpo: passkeys descubribles (entrar sin contraseña). Con `challenge` de un reto MFA:
 * solo las del usuario de ese reto (segundo factor).
 */
router.post('/passkey/options', async (req, res) => {
  const rp = rpOrReject(req, res);
  if (!rp) return;
  try {
    const ip = clientInfo(req).ip;
    const gate = await checkThrottle('login', { ip });
    if (gate.blocked) return sendThrottled(res, gate.retryAfter);

    let userId: string | undefined;
    const mfa = req.body?.challenge;
    if (mfa !== undefined) {
      const row = typeof mfa === 'string' ? await findChallenge('mfa', mfa) : null;
      if (!row?.userId) {
        return res.status(401).json({
          error: 'El paso de verificación ha caducado. Vuelve a entrar.',
          code: 'MFA_CHALLENGE_EXPIRED',
        });
      }
      userId = row.userId;
    }
    const { options, challengeSecret } = await authenticationOptions(rp, userId);
    res.json({ options, challenge: challengeSecret });
  } catch (e) {
    fail(res, e);
  }
});

/** POST /api/auth/passkey/verify { challenge, response, tenantId? } — entra sin contraseña. */
router.post('/passkey/verify', async (req, res) => {
  const rp = rpOrReject(req, res);
  if (!rp) return;
  const { challenge, response, tenantId } = req.body || {};
  try {
    // Solo el freno por IP: no hay cuenta que contar hasta saber de quién es la passkey.
    const keys = { ip: clientInfo(req).ip };
    const gate = await checkThrottle('login', keys);
    if (gate.blocked) return sendThrottled(res, gate.retryAfter);

    let found: { userId: string; passkeyId: string };
    try {
      found = await verifyAuthentication(rp, challenge, response);
    } catch (e) {
      if (e instanceof PasskeyError) await recordAttempt('login', keys, false);
      throw e;
    }
    const user = await loadUser(found.userId);
    if (!user) {
      await recordAttempt('login', keys, false);
      return res.status(401).json({ error: 'Passkey no válida', code: 'PASSKEY_INVALID' });
    }
    await completeLogin(req, res, user, {
      method: 'passkey',
      mfa: 'passkey',
      tenantId: typeof tenantId === 'string' ? tenantId : null,
    });
  } catch (e) {
    fail(res, e);
  }
});

export default router;
