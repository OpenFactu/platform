import { Router } from 'express';
import crypto from 'crypto';
import { AuthService } from '../core/auth/AuthService';
import { ClientFactory } from '../core/tenant/ClientFactory';
import * as schema from '../db/schema';
import { eq, or, and, gt } from 'drizzle-orm';
import { verifyTwoFactor } from './twofa';
import { hashCode } from '../core/auth/totpCrypto';
import { enqueueMail } from '../core/email/MailQueue';

const router = Router();

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

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  const { email, password, selectedTenantId, totpCode } = req.body;

  try {
    const db = ClientFactory.getClient('public');

    // Buscar usuario por email o username
    const [user] = await db
      .select()
      .from(schema.globalUsers)
      .where(or(eq(schema.globalUsers.email, email), eq(schema.globalUsers.username, email)));

    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const isMatch = await AuthService.verifyPassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // ── Segundo factor (2FA/TOTP) ──────────────────────────────────────────
    // Si el usuario lo tiene activo, exigimos el código antes de emitir el JWT.
    if (user.totpEnabled) {
      if (!totpCode) {
        // Contraseña correcta pero falta el 2FA: no emitimos token todavía.
        return res.json({ twoFactorRequired: true });
      }
      const check = verifyTwoFactor(String(totpCode), user.totpSecret, user.totpBackupCodes);
      if (!check.ok) {
        return res.status(401).json({ error: 'Código 2FA inválido' });
      }
      // Si se consumió un código de respaldo, persistimos la lista restante.
      if (check.usedBackup) {
        await db
          .update(schema.globalUsers)
          .set({
            totpBackupCodes: JSON.stringify(check.remainingBackups || []),
            updatedAt: new Date(),
          })
          .where(eq(schema.globalUsers.id, user.id));
      }
    }

    // Resolución de tenant/rol/permisos en 3 niveles
    let finalRole = user.role;
    let finalTenantId: string | null = null;
    let finalPermissions: string | null = null;

    if (user.role === 'SUPERUSER') {
      // SUPERUSER bypassa memberships: accede a cualquier tenant
      finalTenantId = selectedTenantId || null;
    } else {
      // Nivel 1: buscar membership exacta para el tenant seleccionado
      if (selectedTenantId) {
        const [membership] = await db
          .select()
          .from(schema.userTenantMemberships)
          .where(
            and(
              eq(schema.userTenantMemberships.userId, user.id),
              eq(schema.userTenantMemberships.tenantId, selectedTenantId),
            ),
          );

        if (membership) {
          finalTenantId = membership.tenantId;
          finalRole = membership.role;
          finalPermissions = membership.permissions;
        } else if (user.tenantId === selectedTenantId) {
          // Nivel 2: fallback legacy — el usuario tiene ese tenant asignado directamente
          finalTenantId = user.tenantId;
          finalPermissions = user.permissions;
        } else {
          return res.status(403).json({ error: 'No tienes acceso a esta empresa' });
        }
      } else {
        // Sin selectedTenantId: usar tenantId legacy
        finalTenantId = user.tenantId;
        finalPermissions = user.permissions;
      }
    }

    let tenantName = null;
    if (finalTenantId) {
      const [t] = await db
        .select()
        .from(schema.tenants)
        .where(eq(schema.tenants.id, finalTenantId));
      tenantName = t?.name;
    }

    // ADMIN y SUPERUSER ignoran siempre permissions granulares — tienen acceso total
    const effectivePermissions =
      finalRole === 'SUPERUSER' || finalRole === 'ADMIN'
        ? null
        : finalPermissions
          ? JSON.parse(finalPermissions)
          : null;

    const token = AuthService.generateToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      role: finalRole,
      tenantId: finalTenantId,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: finalRole,
        tenantId: finalTenantId,
        tenantName,
        permissions: effectivePermissions,
        avatarImageUrl: user.avatarImageUrl,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auth/switch-tenant
 * Cambia el tenant activo del usuario autenticado y devuelve un JWT nuevo.
 */
router.post('/switch-tenant', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No autorizado' });

  try {
    const token = authHeader.split(' ')[1];
    const payload: any = AuthService.verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Token inválido' });

    const { tenantId } = req.body || {};
    if (!tenantId) return res.status(400).json({ error: 'tenantId es obligatorio' });

    const db = ClientFactory.getClient('public');
    const [user] = await db
      .select()
      .from(schema.globalUsers)
      .where(eq(schema.globalUsers.id, payload.userId));
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

    const newToken = AuthService.generateToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      role: finalRole,
      tenantId,
    });

    // ADMIN y SUPERUSER ignoran siempre permissions granulares
    const effectivePermissions =
      finalRole === 'SUPERUSER' || finalRole === 'ADMIN'
        ? null
        : finalPermissions
          ? JSON.parse(finalPermissions)
          : null;

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
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No autorizado' });

  try {
    const token = authHeader.split(' ')[1];
    const payload: any = AuthService.verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Token inválido' });

    const db = ClientFactory.getClient('public');
    const [user] = await db
      .select()
      .from(schema.globalUsers)
      .where(eq(schema.globalUsers.id, payload.userId));

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const activeTenantId = payload.tenantId || user.tenantId;
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

    // ADMIN y SUPERUSER ignoran siempre permissions granulares
    const effectivePermissions =
      resolvedRole === 'SUPERUSER' || resolvedRole === 'ADMIN' ? null : resolvedPermissions;

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      role: resolvedRole,
      tenantId: activeTenantId,
      tenantName,
      permissions: effectivePermissions,
      avatarImageUrl: user.avatarImageUrl,
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
      return res.status(400).json({ error: 'El enlace no es válido o ha caducado' });
    }

    const hashed = await AuthService.hashPassword(newPassword);
    await db
      .update(schema.globalUsers)
      .set({
        password: hashed,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.globalUsers.id, user.id));

    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Error' });
  }
});

export default router;
