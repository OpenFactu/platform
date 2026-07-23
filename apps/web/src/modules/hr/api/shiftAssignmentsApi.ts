import { apiClient } from '@/shared/http';
import type { ShiftAssignment } from '../domain/shift';

export const shiftAssignmentsApi = {
  list: (from: string, to: string) =>
    apiClient.get<ShiftAssignment[]>('/api/hr/shift-assignments', { query: { from, to } }),
  create: (data: Record<string, unknown>) =>
    apiClient.post<ShiftAssignment>('/api/hr/shift-assignments', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<ShiftAssignment>(`/api/hr/shift-assignments/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/hr/shift-assignments/${id}`),
};
