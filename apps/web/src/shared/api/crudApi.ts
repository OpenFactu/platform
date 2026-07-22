import { apiClient } from '../http';

/**
 * Adaptador CRUD genérico para componentes compartidos parametrizados por
 * endpoint (p.ej. DimensionCrudPage, usado por analytics y hr). Los módulos
 * con recursos propios deben definir su adaptador tipado en su api/ en vez
 * de usar este.
 */
export const crudApi = {
  list: <T>(endpoint: string) => apiClient.get<T[]>(endpoint),
  create: <T>(endpoint: string, data: unknown) => apiClient.post<T>(endpoint, data),
  update: <T>(endpoint: string, id: string, data: unknown) =>
    apiClient.patch<T>(`${endpoint}/${id}`, data),
  remove: (endpoint: string, id: string) => apiClient.delete<void>(`${endpoint}/${id}`),
};
