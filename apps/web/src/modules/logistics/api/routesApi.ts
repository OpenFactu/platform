import type { MapSettings } from '../domain/deliveryFlow';
import { apiClient } from '@/shared/http';
import type { Route, RouteDetail, RouteStop } from '../domain/route';

export type RouteInput = Record<string, unknown>;

export interface DeliveryProofInput {
  recipientName: string | null;
  recipientDocument: string | null;
  signatureImage: string | null;
  photoImage: string | null;
  podNotes: string | null;
  handover?: string | null;
}

export const routesApi = {
  list: (params?: { includeArchived?: boolean }) =>
    apiClient.get<Route[]>('/api/logistics/routes', {
      query: params?.includeArchived ? { includeArchived: 'true' } : undefined,
    }),
  create: (data: RouteInput) => apiClient.post<Route>('/api/logistics/routes', data),
  update: (id: string, data: RouteInput) =>
    apiClient.patch<Route>(`/api/logistics/routes/${id}`, data),
  /** Una ruta con actividad se archiva: `archived` dice qué ha pasado. */
  remove: (id: string) => apiClient.delete<{ archived: boolean }>(`/api/logistics/routes/${id}`),
  restore: (id: string) => apiClient.post<void>(`/api/logistics/routes/${id}/restore`),
  start: (id: string) => apiClient.post<Route>(`/api/logistics/routes/${id}/start`),
  finish: (id: string) => apiClient.post<Route>(`/api/logistics/routes/${id}/finish`),

  listStops: (routeId: string) =>
    apiClient.get<RouteStop[]>(`/api/logistics/routes/${routeId}/stops`),
  createStop: (routeId: string, data: Record<string, unknown>) =>
    apiClient.post<RouteStop>(`/api/logistics/routes/${routeId}/stops`, data),
  updateStop: (routeId: string, stopId: string, data: Record<string, unknown>) =>
    apiClient.patch<RouteStop>(`/api/logistics/routes/${routeId}/stops/${stopId}`, data),
  removeStop: (routeId: string, stopId: string) =>
    apiClient.delete<void>(`/api/logistics/routes/${routeId}/stops/${stopId}`),

  // App del conductor — "mis rutas".
};

/** Lo del conductor: va por su propio permiso y solo llega a sus rutas. */
export const driverApi = {
  myRoutes: () => apiClient.get<Route[]>('/api/logistics/my/routes'),
  myRouteDetail: (id: string) => apiClient.get<RouteDetail>(`/api/logistics/my/routes/${id}`),
  start: (id: string) => apiClient.post<void>(`/api/logistics/my/routes/${id}/start`),
  finish: (id: string) => apiClient.post<void>(`/api/logistics/my/routes/${id}/finish`),
  /** Una sola llamada: parada, envío, paquetes y ruta quedan de acuerdo. */
  arrive: (routeId: string, stopId: string) =>
    apiClient.post<void>(`/api/logistics/my/routes/${routeId}/stops/${stopId}/arrive`),
  deliver: (routeId: string, stopId: string, proof: DeliveryProofInput) =>
    apiClient.post<void>(`/api/logistics/my/routes/${routeId}/stops/${stopId}/deliver`, proof),
  postpone: (routeId: string, stopId: string, reason: string | null) =>
    apiClient.post<void>(`/api/logistics/my/routes/${routeId}/stops/${stopId}/postpone`, {
      reason,
    }),
  incident: (routeId: string, stopId: string, reason: string) =>
    apiClient.post<void>(`/api/logistics/my/routes/${routeId}/stops/${stopId}/incident`, {
      reason,
    }),
  package: (id: string) => apiClient.get<any>(`/api/logistics/my/packages/${id}`),
  stagingArea: (id: string) => apiClient.get<any>(`/api/logistics/my/staging-areas/${id}`),
  stagingAreas: () =>
    apiClient.get<{ id: string; code: string; name: string; address: string | null }[]>(
      '/api/logistics/my/staging-areas',
    ),
  loadPackage: (routeId: string, packageId: string, loaded: boolean) =>
    apiClient.post<void>(`/api/logistics/my/routes/${routeId}/packages/${packageId}/load`, {
      loaded,
    }),
  drop: (routeId: string, stagingAreaId: string, shipmentIds: string[]) =>
    apiClient.post<void>(`/api/logistics/my/routes/${routeId}/drop`, {
      stagingAreaId,
      shipmentIds,
    }),
  mapConfig: () => apiClient.get<MapSettings>('/api/logistics/my/map-config'),
  sendAppReport: (data: Record<string, unknown>) =>
    apiClient.post<{ id: string }>('/api/logistics/my/app-reports', data),
};
