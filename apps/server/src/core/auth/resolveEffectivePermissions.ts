import { and, eq } from 'drizzle-orm';
import { ClientFactory } from '../tenant/ClientFactory';
import * as schema from '../../db/schema';

export type PermSet = { read: boolean; write: boolean; delete: boolean };
/** Mismo shape que `Permissions` en apps/web/src/pages/Users.tsx — sin
 * paquete compartido entre server y web, se repite el tipo aquí. Clave =
 * `permissionPath` de un módulo (p.ej. "/partners", "/sales/invoices"),
 * mismos valores que `RouteRegistry.tsx`/`PERMISSION_GROUPS`. */
export type Permissions = Record<string, PermSet>;

/**
 * Resuelve los permisos granulares EFECTIVOS de un usuario para un tenant,
 * con el mismo criterio de 3 niveles que ya usa `POST /api/auth/login`
 * (`apps/server/src/api/auth.ts:105-159`) — extraído aquí para poder
 * reutilizarlo fuera del flujo de login (p.ej. el chat de IA, que hoy solo
 * recibe `req.user.role` pero nunca `permissions`, ver
 * `tenantContextMiddleware`).
 *
 * Devuelve `null` para ADMIN/SUPERUSER (acceso total, igual que
 * `PermittedRoute.tsx`/`auth.ts`), o el objeto de permisos (posiblemente
 * `{}` si nunca se configuró nada — deny-by-default, igual que
 * `defaultPermissions()` en Users.tsx).
 */
export async function resolveEffectivePermissions(
  userId: string,
  tenantId: string | null | undefined,
  role: string | undefined,
): Promise<Permissions | null> {
  if (role === 'ADMIN' || role === 'SUPERUSER') return null;
  if (!userId || !tenantId) return {};

  const publicDb = ClientFactory.getClient('public');

  // Nivel 1: membership exacta para este tenant.
  const [membership] = await publicDb
    .select()
    .from(schema.userTenantMemberships)
    .where(
      and(
        eq(schema.userTenantMemberships.userId, userId),
        eq(schema.userTenantMemberships.tenantId, tenantId),
      ),
    );
  if (membership) {
    if (membership.role === 'ADMIN' || membership.role === 'SUPERUSER') return null;
    return membership.permissions ? JSON.parse(membership.permissions) : {};
  }

  // Nivel 2: fallback legacy — tenant asignado directamente en GlobalUser.
  const [user] = await publicDb
    .select()
    .from(schema.globalUsers)
    .where(eq(schema.globalUsers.id, userId));
  if (user?.tenantId === tenantId) {
    return user.permissions ? JSON.parse(user.permissions) : {};
  }

  return {};
}
