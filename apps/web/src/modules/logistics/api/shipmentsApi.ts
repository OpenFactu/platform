import { apiClient } from '@/shared/http';
import type {
  ClientIncident,
  GeocodeSuggestion,
  Shipment,
  ShipmentEvent,
  ShipmentListParams,
  ShipmentListResult,
  ShipmentPosition,
} from '../domain/shipment';
import type { UnroutedShipment } from '../domain/route';

export type ShipmentInput = Record<string, unknown>;

export const shipmentsApi = {
  /** El backend pagina (`{rows,total}`); algún caller tolera además un array plano legacy. */
  list: (params?: ShipmentListParams) =>
    apiClient.get<ShipmentListResult | Shipment[]>('/api/logistics/shipments', {
      query: params as Record<string, string | number | boolean | undefined | null>,
    }),
  listUnrouted: () => apiClient.get<UnroutedShipment[]>('/api/logistics/shipments/unrouted'),
  get: (id: string) => apiClient.get<Shipment>(`/api/logistics/shipments/${id}`),
  create: (data: ShipmentInput) => apiClient.post<Shipment>('/api/logistics/shipments', data),
  update: (id: string, data: ShipmentInput) =>
    apiClient.patch<Shipment>(`/api/logistics/shipments/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/logistics/shipments/${id}`),

  cancel: (id: string, data: { reason: string | null; cancelDeliveryNote: boolean }) =>
    apiClient.post<Shipment>(`/api/logistics/shipments/${id}/cancel`, data),
  return: (id: string, data: { reason: string | null; cancelDeliveryNote?: boolean }) =>
    apiClient.post<{ receiptId?: string; deliveryNoteCancelled?: boolean }>(
      `/api/logistics/shipments/${id}/return`,
      data,
    ),
  schedulePickup: (id: string, data: { reason: string | null; warehouseId: string | null }) =>
    apiClient.post<{ code?: string }>(`/api/logistics/shipments/${id}/schedule-pickup`, data),
  notify: (id: string, data: { stage: string }) =>
    apiClient.post<void>(`/api/logistics/shipments/${id}/notify`, data),
  toStaging: (id: string, data: { stagingAreaId: string }) =>
    apiClient.post<{ packagesCreated: number; packagesAffected: number }>(
      `/api/logistics/shipments/${id}/to-staging`,
      data,
    ),
  ready: (id: string) => apiClient.post<void>(`/api/logistics/shipments/${id}/ready`),
  dispatch: (id: string, data: { routeId: string | null }) =>
    apiClient.post<void>(`/api/logistics/shipments/${id}/dispatch`, data),
  receive: (id: string) => apiClient.post<void>(`/api/logistics/shipments/${id}/receive`),

  listEvents: (id: string) => apiClient.get<ShipmentEvent[]>(`/api/logistics/shipments/${id}/events`),
  listPositions: (id: string) =>
    apiClient.get<ShipmentPosition[]>(`/api/logistics/shipments/${id}/positions`),

  /** Reporte de posición GPS — ruta pública identificada por reportToken (sin auth de tenant). */
  reportPosition: (
    reportToken: string,
    data: {
      lat: number;
      lng: number;
      speedKmh?: number | null;
      heading?: number | null;
      accuracyMeters?: number | null;
    },
  ) => apiClient.post<void>(`/api/logistics/track/${reportToken}/position`, data, { auth: false }),
};

export const incidentsApi = {
  listClientReported: () =>
    apiClient.get<ClientIncident[]>('/api/logistics/incidents/client-reported'),
};

export const geocodeApi = {
  suggest: (q: string) =>
    apiClient.get<GeocodeSuggestion[]>('/api/logistics/geocode/suggest', { query: { q } }),
};
