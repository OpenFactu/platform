import { useAuth } from '@/context/AuthContext';
import { isAdminRole } from '@/modules/permissions';

/**
 * Si puede cambiar la configuración de logística. Es lo que comprueba el servidor:
 * `usePagePermissions` mira la ruta de la pantalla, y esta cuelga del permiso `/logistics`.
 */
export function useCanEditLogistics(): boolean {
  const { user } = useAuth();
  return isAdminRole(user?.role) || !!user?.permissions?.['/logistics']?.write;
}
