import { apiClient, ApiError, type QueryParams } from '../http';

export interface RawResult<T = any> {
  ok: boolean;
  status: number;
  /** Body parseado (respuesta o error del servidor). */
  data: T;
}

/**
 * Adaptador genérico del kernel para componentes/hooks compartidos entre
 * módulos (paneles de adjuntos, notificaciones, búsqueda global...). Los
 * recursos con dueño claro deben usar el adaptador de su módulo.
 */
export const coreApi = {
  get: <T = any>(path: string, query?: QueryParams) => apiClient.get<T>(path, { query }),
  post: <T = any>(path: string, body?: unknown) => apiClient.post<T>(path, body),
  put: <T = any>(path: string, body?: unknown) => apiClient.put<T>(path, body),
  patch: <T = any>(path: string, body?: unknown) => apiClient.patch<T>(path, body),
  remove: <T = void>(path: string) => apiClient.delete<T>(path),
  postForm: <T = any>(path: string, form: FormData) => apiClient.postForm<T>(path, form),
  getBlob: (path: string) => apiClient.getBlob(path),

  /** Variante tolerante con contrato legacy res.ok/res.data (ver hrApi.raw). */
  async raw<T = any>(method: string, path: string, body?: unknown): Promise<RawResult<T>> {
    try {
      const m = method.toUpperCase();
      const data =
        m === 'GET'
          ? await apiClient.get<T>(path)
          : m === 'DELETE'
            ? await apiClient.delete<T>(path)
            : m === 'PUT'
              ? await apiClient.put<T>(path, body)
              : m === 'PATCH'
                ? await apiClient.patch<T>(path, body)
                : body instanceof FormData
                  ? await apiClient.postForm<T>(path, body)
                  : await apiClient.post<T>(path, body);
      return { ok: true, status: 200, data };
    } catch (e) {
      if (e instanceof ApiError && e.status !== 0) {
        return { ok: false, status: e.status, data: e.body as T };
      }
      throw e;
    }
  },
};
