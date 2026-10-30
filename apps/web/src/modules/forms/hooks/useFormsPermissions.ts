import { useAuth } from '@/context/AuthContext';
import type { PagePermissions } from '@/hooks/usePagePermissions';

/**
 * Permisos del módulo: todas sus pantallas (`/forms/:id`, la vista previa…)
 * cuelgan del permiso `/forms`, así que no sirve mirar el `pathname`.
 */
export function useFormsPermissions(): PagePermissions {
  const { user } = useAuth();
  const isPrivileged = user?.role === 'SUPERUSER' || user?.role === 'ADMIN';
  const perm = user?.permissions?.['/forms'];
  return {
    canRead: isPrivileged || !!perm?.read,
    canWrite: isPrivileged || !!perm?.write,
    canDelete: isPrivileged || !!perm?.delete,
  };
}
