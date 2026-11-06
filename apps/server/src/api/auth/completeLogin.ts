/**
 * Cierra un acceso ya autenticado: resuelve empresa, rol y permisos, abre la sesión y
 * responde `{ token, user }`. Lo usan el login con contraseña, el segundo factor y
 * el resto de formas de entrar.
 */
import { and, eq } from 'drizzle-orm';
import { ClientFactory } from '../../core/tenant/ClientFactory';
import * as schema from '../../db/schema';
import { createSession, issueToken } from '../../core/auth/sessions';
import { clientInfo } from '../../core/auth/clientInfo';

export interface CompleteLoginOpts {
  method: string;
  mfa: string | null;
  tenantId?: string | null;
}

export async function completeLogin(
  req: any,
  res: any,
  user: any,
  opts: CompleteLoginOpts,
): Promise<void> {
  const db = ClientFactory.getClient('public');
  const selectedTenantId = opts.tenantId;

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
        res.status(403).json({ error: 'No tienes acceso a esta empresa' });
        return;
      }
    } else {
      // Sin selectedTenantId: usar tenantId legacy
      finalTenantId = user.tenantId;
      finalPermissions = user.permissions;
    }
  }

  let tenantName = null;
  if (finalTenantId) {
    const [t] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, finalTenantId));
    tenantName = t?.name;
  }

  // ADMIN y SUPERUSER ignoran siempre permissions granulares — tienen acceso
  // total, y eso es lo que significa `null`.
  //
  // Un usuario normal SIN permisos configurados recibe `{}`, no `null`: son
  // dos cosas distintas y confundirlas es peligroso. Antes ambos casos
  // devolvían `null`, y bastaba con que alguien escribiera
  // `if (permissions === null) → acceso total` para regalarle la empresa
  // entera a un usuario recién creado.
  const effectivePermissions =
    finalRole === 'SUPERUSER' || finalRole === 'ADMIN'
      ? null
      : finalPermissions
        ? JSON.parse(finalPermissions)
        : {};

  const session = await createSession({
    userId: user.id,
    tenantId: finalTenantId,
    method: opts.method,
    mfa: opts.mfa,
    client: clientInfo(req),
  });
  const token = issueToken(session, {
    id: user.id,
    email: user.email,
    username: user.username,
    role: finalRole,
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
      locale: user.locale ?? null,
      themePreset: user.themePreset ?? null,
      themeMode: user.themeMode ?? null,
    },
  });
}
