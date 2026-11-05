import { apiClient } from '@/shared/http';
import type {
  ClientIncident,
  GeocodeSuggestion,
  ShipmentDetailData,
  TodaySummary,
  Shipment,
  ShipmentEvent,
  ShipmentListParams,
  ShipmentListResult,
  ShipmentPosition,
} from '../domain/shipment';
import type { AppReport } from '../domain/appReport';
import type { CarrierAccountOption } from '../domain/carrier';
import type { DeliveryFlow } from '../domain/deliveryFlow';
import type { LogisticsSummary } from '../domain/reports';
import type { UnroutedShipment, RouteWarning } from '../domain/route';

export type ShipmentInput = Record<string, unknown>;

/** Lo que deja una devolución: la entrada de mercancía y la factura que queda sin corregir. */
export interface ShipmentReturnResult {
  receiptId?: string | null;
  deliveryNoteCancelled?: boolean;
  alreadyReturned?: boolean;
  invoice?: { id: string; code: string; status: string } | null;
}

export const shipmentsApi = {
  /** El backend pagina (`{rows,total}`); algún caller tolera además un array plano legacy. */
  list: (params?: ShipmentListParams) =>
    apiClient.get<ShipmentListResult | Shipment[]>('/api/logistics/shipments', {
      query: params as Record<string, string | number | boolean | undefined | null>,
    }),
  listUnrouted: () => apiClient.get<UnroutedShipment[]>('/api/logistics/shipments/unrouted'),
  get: (id: string) => apiClient.get<Shipment>(`/api/logistics/shipments/${id}`),
  getDetail: (id: string) =>
    apiClient.get<ShipmentDetailData>(`/api/logistics/shipments/${id}/detail`),
  create: (data: ShipmentInput) => apiClient.post<Shipment>('/api/logistics/shipments', data),
  update: (id: string, data: ShipmentInput) =>
    apiClient.patch<Shipment>(`/api/logistics/shipments/${id}`, data),
  /** Lo que tiene historia se archiva: `archived` dice qué ha pasado. */
  remove: (id: string) => apiClient.delete<{ archived: boolean }>(`/api/logistics/shipments/${id}`),
  restore: (id: string) => apiClient.post<void>(`/api/logistics/shipments/${id}/restore`),

  cancel: (id: string, data: { reason: string | null; cancelDeliveryNote: boolean }) =>
    apiClient.post<Shipment>(`/api/logistics/shipments/${id}/cancel`, data),
  return: (id: string, data: { reason: string | null; cancelDeliveryNote?: boolean }) =>
    apiClient.post<ShipmentReturnResult>(`/api/logistics/shipments/${id}/return`, data),
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
  deliver: (id: string) => apiClient.post<void>(`/api/logistics/shipments/${id}/deliver`),
  postpone: (id: string, reason: string | null) =>
    apiClient.post<void>(`/api/logistics/shipments/${id}/postpone`, { reason }),
  reportIncident: (id: string, reason: string) =>
    apiClient.post<void>(`/api/logistics/shipments/${id}/incident`, { reason }),
  resolveIncident: (id: string) => apiClient.post<void>(`/api/logistics/shipments/${id}/resolve`),
  dispatch: (id: string, data: { routeId: string | null }) =>
    apiClient.post<{ warnings?: RouteWarning[] }>(`/api/logistics/shipments/${id}/dispatch`, data),
  carrierDispatch: (
    id: string,
    data: { carrierAccountId: string; trackingNumber: string | null },
  ) =>
    apiClient.post<{ trackingNumber: string }>(
      `/api/logistics/shipments/${id}/carrier-dispatch`,
      data,
    ),
  carrierRefresh: (id: string) =>
    apiClient.post<{ changed: boolean }>(`/api/logistics/shipments/${id}/carrier-refresh`),
  receive: (id: string) => apiClient.post<void>(`/api/logistics/shipments/${id}/receive`),

  listEvents: (id: string) =>
    apiClient.get<ShipmentEvent[]>(`/api/logistics/shipments/${id}/events`),
  listPositions: (id: string) =>
    apiClient.get<ShipmentPosition[]>(`/api/logistics/shipments/${id}/positions`),

  /** Reporte de posición GPS — ruta pública identificada por trackerToken (sin auth de tenant). */
  reportPosition: (
    trackerToken: string,
    data: {
      lat: number;
      lng: number;
      speedKmh?: number | null;
      heading?: number | null;
      accuracyMeters?: number | null;
    },
  ) => apiClient.post<void>(`/api/logistics/track/${trackerToken}/position`, data, { auth: false }),
};

export const logisticsApi = {
  today: () => apiClient.get<TodaySummary>('/api/logistics/today'),
  carrierAccounts: () => apiClient.get<CarrierAccountOption[]>('/api/logistics/carrier-accounts'),
  deliveryFlow: () => apiClient.get<DeliveryFlow>('/api/logistics/delivery-flow'),
  saveDeliveryFlow: (flow: DeliveryFlow) =>
    apiClient.put<DeliveryFlow>('/api/logistics/delivery-flow', flow),
  appReports: () => apiClient.get<AppReport[]>('/api/logistics/app-reports'),
  appReport: (id: string) => apiClient.get<AppReport>(`/api/logistics/app-reports/${id}`),
  setAppReportStatus: (id: string, status: 'open' | 'resolved') =>
    apiClient.patch<void>(`/api/logistics/app-reports/${id}`, { status }),
  reportSummary: (range: { from?: string; to?: string }) =>
    apiClient.get<LogisticsSummary>('/api/logistics/reports/summary', { query: range }),
};

export const incidentsApi = {
  listClientReported: () =>
    apiClient.get<ClientIncident[]>('/api/logistics/incidents/client-reported'),
};

export const geocodeApi = {
  suggest: (q: string) =>
    apiClient.get<GeocodeSuggestion[]>('/api/logistics/geocode/suggest', { query: { q } }),
};
