import { Router } from 'express';
import crypto from 'crypto';
import { AuthService } from '../core/auth/AuthService';
import { ClientFactory } from '../core/tenant/ClientFactory';
import * as schema from '../db/schema';
import { eq, or, and, gt } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { hashCode } from '../core/auth/totpCrypto';
import { enqueueMail } from '../core/email/MailQueue';
import {
  createSession,
  issueToken,
  revokeAllForUser,
  setSessionTenant,
} from '../core/auth/sessions';
import { clientInfo } from '../core/auth/clientInfo';
import sessionRoutes, { requireSession } from './auth/sessionRoutes';
import eventRoutes from './auth/eventRoutes';
import { recordAuthEvent } from '../core/auth/authEvents';
import mfaRoutes, { consumeUserCode, startMfaOrComplete } from './auth/mfaRoutes';
import { completeLogin } from './auth/completeLogin';
import {
  checkThrottle,
  normalizeAccount,
  recordAttempt,
  sendThrottled,
} from '../core/auth/throttle';

const router = Router();

// logout, refresh y sesiones abiertas.
router.use(sessionRoutes);
router.use(eventRoutes);
// Segundo factor con reto.
router.use(mfaRoutes);

/**
 * GET /api/auth/avatar-for-login?email=X — foto de perfil a mostrar en el
 * formulario de login mientras el usuario escribe (antes de autenticarse).
 * Sin sesión, igual que /api/memberships/tenants-for-user, y con el mismo
 * cuidado: SIEMPRE 200 con `avatarImageUrl` (null si no hay usuario o no
 * tiene foto) — nunca un 404 que permita distinguir si la cuenta existe.
 */
router.get('/avatar-for-login', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.json({ avatarImageUrl: null });
  try {
    const db = ClientFactory.getClient('public');
    const [user] = await db
      .select({ avatarImageUrl: schema.globalUsers.avatarImageUrl })
      .from(schema.globalUsers)
      .where(
        or(
          eq(schema.globalUsers.email, email as string),
          eq(schema.globalUsers.username, email as string),
        ),
      );
    res.json({ avatarImageUrl: user?.avatarImageUrl || null });
  } catch {
    res.json({ avatarImageUrl: null });
  }
});

/**
 * GET /api/auth/tenants
 */
router.get('/tenants', async (req, res) => {
  try {
    const db = ClientFactory.getClient('public');
    const results = await db
      .select({
        id: schema.tenants.id,
        name: schema.tenants.name,
      })
      .from(schema.tenants);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Fallo al obtener empresas' });
  }
});

// Hash fijo para gastar el mismo tiempo con un usuario que no existe.
const DUMMY_HASH = bcrypt.hashSync('keirost-sin-usuario', 10);

const BAD_CREDENTIALS = { error: 'Credenciales inválidas' };

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  const { email, password, selectedTenantId, totpCode } = req.body || {};

  try {
    const account = normalizeAccount(String(email ?? ''));
    const keys = { account: account || undefined, ip: clientInfo(req).ip };

    // Primero el freno: bloqueado no se comprueba nada ni se apunta nada.
    const gate = await checkThrottle('login', keys);
    if (gate.blocked) return sendThrottled(res, gate.retryAfter);

    const db = ClientFactory.getClient('public');

    // Buscar usuario por email o username
    const [user] = await db
      .select()
      .from(schema.globalUsers)
      .where(or(eq(schema.globalUsers.email, email), eq(schema.globalUsers.username, email)));

    // Con o sin usuario se hace una comparación de bcrypt, y la respuesta es idéntica.
    const isMatch = user
      ? await AuthService.verifyPassword(password, user.password)
      : (await bcrypt.compare(String(password ?? ''), DUMMY_HASH), false);
    if (!user || !isMatch) {
      await recordAttempt('login', keys, false);
      if (user) {
        await recordAuthEvent({
          userId: user.id,
          kind: 'login',
          ok: false,
          method: 'password',
          client: clientInfo(req),
        });
      }
      return res.status(401).json(BAD_CREDENTIALS);
    }
    await recordAttempt('login', keys, true);

    // Atajo compatible: el código del segundo factor en el mismo cuerpo. Pasa por la misma
    // comprobación de un solo uso que `/mfa`.
    if (user.totpEnabled && totpCode) {
      const mfaKeys = { account: user.id, ip: keys.ip };
      const mfaGate = await checkThrottle('mfa', mfaKeys);
      if (mfaGate.blocked) return sendThrottled(res, mfaGate.retryAfter);
      const used = await consumeUserCode(user, String(totpCode));
      await recordAttempt('mfa', mfaKeys, used.ok);
      if (!used.ok) {
        await recordAuthEvent({
          userId: user.id,
          kind: 'mfa',
          ok: false,
          method: 'totp',
          client: clientInfo(req),
        });
        return res.status(401).json({ error: 'Código 2FA inválido' });
      }
      return completeLogin(req, res, user, {
        method: 'password',
        mfa: used.mfa,
        tenantId: selectedTenantId,
      });
    }

    await startMfaOrComplete(req, res, user, { method: 'password', tenantId: selectedTenantId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auth/switch-tenant
 * Cambia el tenant activo del usuario autenticado y devuelve un JWT nuevo.
 */
router.post('/switch-tenant', async (req, res) => {
  const session = await requireSession(req, res);
  if (!session) return;

  try {
    const { tenantId } = req.body || {};
    if (!tenantId) return res.status(400).json({ error: 'tenantId es obligatorio' });

    const db = ClientFactory.getClient('public');
    const [user] = await db
      .select()
      .from(schema.globalUsers)
      .where(eq(schema.globalUsers.id, session.userId));
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    let finalRole = user.role;
    let finalPermissions: string | null = null;

    if (user.role === 'SUPERUSER') {
      // libre acceso a cualquier tenant
    } else {
      const [membership] = await db
        .select()
        .from(schema.userTenantMemberships)
        .where(
          and(
            eq(schema.userTenantMemberships.userId, user.id),
            eq(schema.userTenantMemberships.tenantId, tenantId),
          ),
        );

      if (membership) {
        finalRole = membership.role;
        finalPermissions = membership.permissions;
      } else if (user.tenantId === tenantId) {
        finalPermissions = user.permissions;
      } else {
        return res.status(403).json({ error: 'No tienes acceso a esta empresa' });
      }
    }

    const [t] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId));
    if (!t) return res.status(404).json({ error: 'Empresa no encontrada' });

    // Misma sesión (mismo sid), otra empresa activa.
    const updated = await setSessionTenant(session.id, tenantId, null);
    const newToken = issueToken(updated, {
      id: user.id,
      email: user.email,
      username: user.username,
      role: finalRole,
    });

    // Igual que en el login: `null` es "admin, acceso total"; un usuario sin
    // permisos configurados es `{}`.
    const effectivePermissions =
      finalRole === 'SUPERUSER' || finalRole === 'ADMIN'
        ? null
        : finalPermissions
          ? JSON.parse(finalPermissions)
          : {};

    res.json({
      token: newToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: finalRole,
        tenantId,
        tenantName: t.name,
        permissions: effectivePermissions,
        avatarImageUrl: user.avatarImageUrl,
        locale: user.locale ?? null,
        themePreset: user.themePreset ?? null,
        themeMode: user.themeMode ?? null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', async (req, res) => {
  const session = await requireSession(req, res);
  if (!session) return;

  try {
    const db = ClientFactory.getClient('public');
    const [user] = await db
      .select()
      .from(schema.globalUsers)
      .where(eq(schema.globalUsers.id, session.userId));

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const activeTenantId = session.tenantId || user.tenantId;
    // El rol global debe salir SIEMPRE de la BD, no del JWT — si promueves a
    // alguien a SUPERUSER a mano, el JWT viejo todavía dice ADMIN y lo
    // estaríamos propagando indefinidamente hasta que cerrase sesión.
    let resolvedRole = user.role;
    let resolvedPermissions: any = null;

    if (user.role !== 'SUPERUSER' && activeTenantId) {
      // Buscar membership activa
      const [membership] = await db
        .select()
        .from(schema.userTenantMemberships)
        .where(
          and(
            eq(schema.userTenantMemberships.userId, user.id),
            eq(schema.userTenantMemberships.tenantId, activeTenantId),
          ),
        );

      if (membership) {
        resolvedRole = membership.role;
        resolvedPermissions = membership.permissions ? JSON.parse(membership.permissions) : null;
      } else {
        // Fallback legacy
        resolvedPermissions = user.permissions ? JSON.parse(user.permissions) : null;
      }
    }

    let tenantName = null;
    if (activeTenantId) {
      const [t] = await db
        .select()
        .from(schema.tenants)
        .where(eq(schema.tenants.id, activeTenantId));
      tenantName = t?.name;
    }

    // `null` solo para admins. Un usuario normal sin nada configurado va con
    // `{}`, que es "no puede nada" y no "puede todo".
    const effectivePermissions =
      resolvedRole === 'SUPERUSER' || resolvedRole === 'ADMIN' ? null : (resolvedPermissions ?? {});

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      role: resolvedRole,
      tenantId: activeTenantId,
      tenantName,
      permissions: effectivePermissions,
      avatarImageUrl: user.avatarImageUrl,
      locale: user.locale ?? null,
      themePreset: user.themePreset ?? null,
      themeMode: user.themeMode ?? null,
    });
  } catch (e) {
    res.status(401).json({ error: 'No autorizado' });
  }
});

/**
 * Resuelve el tenant a usar para enviar correo a un usuario global:
 * su tenant legacy o, si no tiene, la primera membership.
 */
async function resolveUserTenantId(db: any, user: any): Promise<string | null> {
  if (user.tenantId) return user.tenantId;
  const [m] = await db
    .select({ tenantId: schema.userTenantMemberships.tenantId })
    .from(schema.userTenantMemberships)
    .where(eq(schema.userTenantMemberships.userId, user.id))
    .limit(1);
  return m?.tenantId || null;
}

/**
 * POST /api/auth/forgot-password — inicia la recuperación de contraseña.
 * Devuelve SIEMPRE 200 sin revelar si el email existe (anti-enumeración).
 * Si el usuario existe y su empresa tiene SMTP, se le envía un enlace de reset.
 */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  // Respuesta uniforme pase lo que pase.
  const ok = () => res.json({ ok: true });

  try {
    if (!email) return ok();
    // Cada petición cuenta como un fallo: la respuesta es siempre la misma, así que lo
    // único que limita el correo que se puede mandar a una cuenta es el ritmo.
    const account = normalizeAccount(String(email));
    const keys = { account: account || undefined, ip: clientInfo(req).ip };
    const gate = await checkThrottle('forgot', keys);
    if (gate.blocked) return sendThrottled(res, gate.retryAfter);
    await recordAttempt('forgot', keys, false);
    const db = ClientFactory.getClient('public');
    const [user] = await db
      .select()
      .from(schema.globalUsers)
      .where(or(eq(schema.globalUsers.email, email), eq(schema.globalUsers.username, email)));
    if (!user) return ok();

    // Genera token, guarda solo su hash + expiración (1h).
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashCode(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await db
      .update(schema.globalUsers)
      .set({ resetTokenHash: tokenHash, resetTokenExpiresAt: expiresAt, updatedAt: new Date() })
      .where(eq(schema.globalUsers.id, user.id));

    // Construye el enlace hacia el frontend.
    const origin =
      process.env.WEB_ORIGIN ||
      (req.headers.origin as string) ||
      `http://localhost:${process.env.WEB_PORT || 8080}`;
    const link = `${origin.replace(/\/$/, '')}/reset-password?token=${token}`;

    // Intenta enviar el correo con el SMTP de la empresa del usuario. Si no hay
    // tenant o SMTP configurado, no rompemos: el admin puede resetear a mano.
    try {
      const tenantId = await resolveUserTenantId(db, user);
      if (tenantId) {
        enqueueMail(tenantId, {
          to: user.email,
          subject: 'Keirost — Recuperación de contraseña',
          text:
            `Has solicitado restablecer tu contraseña de Keirost ERP.\n\n` +
            `Abre este enlace (válido 1 hora):\n${link}\n\n` +
            `Si no fuiste tú, ignora este mensaje.`,
          html: `
        <div style="font-family:'DM Sans',system-ui,sans-serif;padding:24px;max-width:520px;background:#FAFBFC;border:1px solid #E2E8F0;border-radius:4px;">
          <h2 style="margin:0 0 12px 0;color:#0A1628;font-family:'Syne',sans-serif;font-weight:700;">
            Recuperación de contraseña
          </h2>
          <p style="color:#2D3A4A;line-height:1.6;">
            Has solicitado restablecer tu contraseña de
            <strong style="color:#0D9488;">Keirost ERP</strong>. Pulsa el botón para elegir una nueva.
            El enlace caduca en 1 hora.
          </p>
          <p style="margin:24px 0;">
            <a href="${link}" style="background:#0D9488;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:700;display:inline-block;">
              Restablecer contraseña
            </a>
          </p>
          <p style="color:#94A3B8;font-size:12px;margin-top:24px;font-family:'DM Mono',monospace;word-break:break-all;">
            Si el botón no funciona, copia este enlace:<br/>${link}
          </p>
          <p style="color:#94A3B8;font-size:12px;">Si no solicitaste esto, ignora este correo.</p>
        </div>`,
        });
      } else {
        console.warn(
          `[Auth.forgot-password] Usuario ${user.email} sin tenant/SMTP — no se envió email (usar reset por admin).`,
        );
      }
    } catch (mailErr: any) {
      console.warn('[Auth.forgot-password] No se pudo encolar el email:', mailErr?.message);
    }

    return ok();
  } catch (error: any) {
    console.error('[Auth.forgot-password]', error?.message);
    // Aun con error interno mantenemos la respuesta uniforme.
    return ok();
  }
});

/**
 * POST /api/auth/reset-password — fija la nueva contraseña dado un token válido.
 */
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body || {};
  try {
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Faltan datos' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    // Adivinar el enlace se frena solo por IP: no hay cuenta que atribuir.
    const ipKeys = { ip: clientInfo(req).ip };
    const gate = await checkThrottle('reset', ipKeys);
    if (gate.blocked) return sendThrottled(res, gate.retryAfter);
    const db = ClientFactory.getClient('public');
    const tokenHash = hashCode(token);
    const [user] = await db
      .select()
      .from(schema.globalUsers)
      .where(
        and(
          eq(schema.globalUsers.resetTokenHash, tokenHash),
          gt(schema.globalUsers.resetTokenExpiresAt, new Date()),
        ),
      );
    if (!user) {
      await recordAttempt('reset', ipKeys, false);
      return res.status(400).json({ error: 'El enlace no es válido o ha caducado' });
    }

    const hashed = await AuthService.hashPassword(newPassword);

    // Primero las sesiones: si esto falla no se cambia la contraseña, y nunca queda la
    // nueva con sesiones viejas vivas.
    await revokeAllForUser(user.id, 'password_change');

    await db
      .update(schema.globalUsers)
      .set({
        password: hashed,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.globalUsers.id, user.id));

    await recordAuthEvent({
      userId: user.id,
      kind: 'password_change',
      ok: true,
      method: 'reset',
      client: clientInfo(req),
    });

    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Error' });
  }
});

export default router;
