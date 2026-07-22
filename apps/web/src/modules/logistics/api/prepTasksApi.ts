import { apiClient } from '@/shared/http';
import type { PickingTask, PrepFromDocResult, PrepResyncResult } from '../domain/prepTask';

export const prepTasksApi = {
  list: (shipmentId: string) =>
    apiClient.get<PickingTask[]>('/api/logistics/prep/tasks', { query: { shipmentId } }),
  update: (id: string, patch: Record<string, unknown>) =>
    apiClient.patch<PickingTask>(`/api/logistics/prep/tasks/${id}`, patch),
  /** Regenera las tareas pendientes con los lotes/series actuales del albarán origen. */
  resyncShipment: (shipmentId: string) =>
    apiClient.post<PrepResyncResult>(`/api/logistics/prep/shipments/${shipmentId}/resync`),
  fromSdn: (id: string) => apiClient.post<PrepFromDocResult>(`/api/logistics/prep/from-sdn/${id}`),
  fromPdn: (id: string) => apiClient.post<PrepFromDocResult>(`/api/logistics/prep/from-pdn/${id}`),
};
