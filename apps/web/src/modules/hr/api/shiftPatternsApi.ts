import { apiClient } from '@/shared/http';
import type { ShiftPattern, ShiftPatternAssignment } from '../domain/shift';

export const shiftPatternsApi = {
  list: () => apiClient.get<ShiftPattern[]>('/api/hr/shift-patterns'),
  get: (id: string) => apiClient.get<ShiftPattern>(`/api/hr/shift-patterns/${id}`),
  create: (data: Record<string, unknown>) =>
    apiClient.post<ShiftPattern>('/api/hr/shift-patterns', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<ShiftPattern>(`/api/hr/shift-patterns/${id}`, data),
  addAssignment: (
    id: string,
    data: { employeeId: string; validFrom: string; weekOffset: number },
  ) => apiClient.post<ShiftPatternAssignment>(`/api/hr/shift-patterns/${id}/assignments`, data),
  removeAssignment: (id: string, assignmentId: string) =>
    apiClient.delete<void>(`/api/hr/shift-patterns/${id}/assignments/${assignmentId}`),
  expand: (id: string, data: { from: string; to: string }) =>
    apiClient.post<{ created: number }>(`/api/hr/shift-patterns/${id}/expand`, data),
};
