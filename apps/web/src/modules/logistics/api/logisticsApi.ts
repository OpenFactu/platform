import { apiClient, ApiError, type QueryParams } from '@/shared/http';

export interface RawResult<T = any> {
  ok: boolean;
  status: number;
  /** Body parseado (respuesta o error del servidor). */
  data: T;
}

/**
 * Adaptador genérico del módulo de logística (/api/logistics/*, carriers,
 * shipments, rutas, vehículos...). Tipado fino por recurso pendiente
 * (TODO modularización: shipmentsApi, routesApi, carriersApi tipados).
 */
export const logisticsApi = {
  get: <T = any>(path: string, query?: QueryParams) => apiClient.get<T>(path, { query }),
  post: <T = any>(path: string, body?: unknown) => apiClient.post<T>(path, body),
  put: <T = any>(path: string, body?: unknown) => apiClient.put<T>(path, body),
  patch: <T = any>(path: string, body?: unknown) => apiClient.patch<T>(path, body),
  remove: <T = void>(path: string) => apiClient.delete<T>(path),
  /** Binarios autenticados (QR de acopios, etiquetas...). */
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
