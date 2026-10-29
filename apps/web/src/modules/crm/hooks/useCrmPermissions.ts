import { useAuth } from '@/context/AuthContext';
import type { PagePermissions } from '@/hooks/usePagePermissions';

export type CrmPermissionPath =
  | '/crm/opportunities'
  | '/crm/contacts'
  | '/crm/activities'
  | '/crm/settings'
  | '/crm/forms'
  /** Para el alta rápida de clientes desde los formularios del CRM. */
  | '/partners';

/**
 * Permisos sobre una parte del CRM, sin depender de la URL.
 *
 * `usePagePermissions` mira el `pathname`, y los paneles del CRM también se
 * pintan dentro de la ficha del interlocutor (`/partners`): allí lo que manda
 * es el permiso del CRM, no el de la pantalla que los aloja.
 */
export function useCrmPermissions(path: CrmPermissionPath): PagePermissions {
  const { user } = useAuth();
  const isPrivileged = user?.role === 'SUPERUSER' || user?.role === 'ADMIN';
  const perm = user?.permissions?.[path];
  return {
    canRead: isPrivileged || !!perm?.read,
    canWrite: isPrivileged || !!perm?.write,
    canDelete: isPrivileged || !!perm?.delete,
  };
}
