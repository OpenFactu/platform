import { apiClient } from '@/shared/http';

export interface PermissionEntry {
  path: string;
  label: string;
  group: string;
  parent?: string;
  hint?: string;
}

export interface PermissionGroup {
  group: string;
  items: PermissionEntry[];
}

/**
 * El catálogo de permisos viene del servidor, no de una constante en esta
 * pantalla.
 *
 * Estuvo escrito aquí dentro y se desincronizó: 27 pantallas exigían permisos
 * que no aparecían en esta lista, así que no había forma de concederlos, y
 * media docena de casillas de esta lista no gobernaban nada. Con la lista
 * viniendo de donde se comprueba, eso ya no puede volver a pasar.
 */
export const permissionsApi = {
  catalog: () => apiClient.get<{ groups: PermissionGroup[] }>('/api/permissions/catalog'),
};
