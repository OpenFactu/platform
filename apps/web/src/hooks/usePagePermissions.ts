import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

export interface PagePermissions {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
}

/**
 * Permisos del usuario sobre la pantalla en la que está.
 *
 * `ADMIN` y `SUPERUSER` mandan siempre: el servidor ni siquiera les envía el
 * mapa granular (`auth.ts` pone `effectivePermissions = null` para ellos), así
 * que hay que resolverlos por rol antes de mirar el mapa.
 *
 * Para el resto el modelo **deniega por defecto**: `defaultPermissions()` en
 * `settings/Users` crea cada ruta con `{read:false, write:false, delete:false}`,
 * de modo que una ruta sin entrada en el mapa es una ruta sin permiso. Ojo con
 * eso al gatear una pantalla que hasta ahora no comprobaba nada: los usuarios
 * no-admin dejan de poder actuar hasta que un administrador les conceda el
 * permiso en Ajustes → Usuarios.
 *
 * La clave del mapa es el `pathname` de la ruta, que es también el `path` que
 * usa el editor de permisos, así que ambos lados hablan del mismo string.
 */
export function usePagePermissions(): PagePermissions {
  const { user } = useAuth();
  const location = useLocation();

  const isPrivileged = user?.role === 'SUPERUSER' || user?.role === 'ADMIN';
  const perm = user?.permissions?.[location.pathname];

  return {
    canRead: isPrivileged || !!perm?.read,
    canWrite: isPrivileged || !!perm?.write,
    canDelete: isPrivileged || !!perm?.delete,
  };
}
