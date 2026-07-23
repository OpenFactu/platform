import { apiClient } from '@/shared/http';
import type { PayrollConcept } from '../domain/payroll';

export const payrollConceptsApi = {
  list: (activeOnly?: boolean) =>
    apiClient.get<PayrollConcept[]>('/api/hr/payroll-concepts', {
      query: activeOnly ? { activeOnly: 'true' } : undefined,
    }),
  create: (data: Record<string, unknown>) =>
    apiClient.post<PayrollConcept>('/api/hr/payroll-concepts', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<PayrollConcept>(`/api/hr/payroll-concepts/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/hr/payroll-concepts/${id}`),
  seedDefaults: () =>
    apiClient.post<{ created: number; error?: string }>('/api/hr/payroll-concepts/seed-defaults'),
};
