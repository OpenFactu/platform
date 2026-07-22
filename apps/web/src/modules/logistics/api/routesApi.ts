import { apiClient } from '@/shared/http';
import type { Route, RouteDetail, RouteStop } from '../domain/route';

export type RouteInput = Record<string, unknown>;

export const routesApi = {
  list: () => apiClient.get<Route[]>('/api/logistics/routes'),
  create: (data: RouteInput) => apiClient.post<Route>('/api/logistics/routes', data),
  update: (id: string, data: RouteInput) => apiClient.patch<Route>(`/api/logistics/routes/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/logistics/routes/${id}`),
  start: (id: string) => apiClient.post<Route>(`/api/logistics/routes/${id}/start`),
  finish: (id: string) => apiClient.post<Route>(`/api/logistics/routes/${id}/finish`),

  listStops: (routeId: string) => apiClient.get<RouteStop[]>(`/api/logistics/routes/${routeId}/stops`),
  createStop: (routeId: string, data: Record<string, unknown>) =>
    apiClient.post<RouteStop>(`/api/logistics/routes/${routeId}/stops`, data),
  updateStop: (routeId: string, stopId: string, data: Record<string, unknown>) =>
    apiClient.patch<RouteStop>(`/api/logistics/routes/${routeId}/stops/${stopId}`, data),
  removeStop: (routeId: string, stopId: string) =>
    apiClient.delete<void>(`/api/logistics/routes/${routeId}/stops/${stopId}`),

  // App del conductor — "mis rutas".
  myRoutes: () => apiClient.get<Route[]>('/api/logistics/my/routes'),
  myRouteDetail: (id: string) => apiClient.get<RouteDetail>(`/api/logistics/my/routes/${id}`),
};
