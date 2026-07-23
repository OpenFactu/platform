import { apiClient } from '@/shared/http';
import type { ShiftTemplate } from '../domain/shift';

export const shiftTemplatesApi = {
  list: () => apiClient.get<ShiftTemplate[]>('/api/hr/shift-templates'),
  create: (data: Record<string, unknown>) =>
    apiClient.post<ShiftTemplate>('/api/hr/shift-templates', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<ShiftTemplate>(`/api/hr/shift-templates/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/hr/shift-templates/${id}`),
};
