import { apiClient } from '@/shared/http';
import type { CommissionAccrual, CommissionRule } from '../domain/commission';

export const commissionsApi = {
  listRules: () => apiClient.get<CommissionRule[]>('/api/hr/commissions/rules'),
  createRule: (data: Record<string, unknown>) =>
    apiClient.post<CommissionRule>('/api/hr/commissions/rules', data),
  updateRule: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<CommissionRule>(`/api/hr/commissions/rules/${id}`, data),
  removeRule: (id: string) => apiClient.delete<void>(`/api/hr/commissions/rules/${id}`),

  listAccruals: (query: Record<string, string>) =>
    apiClient.get<CommissionAccrual[]>('/api/hr/commissions/accruals', { query }),
  recalculate: (from: string, to: string) =>
    apiClient.post<{ processed: number }>('/api/hr/commissions/recalculate', undefined, {
      query: { from, to },
    }),
  /** Vuelca los acumulados pendientes del periodo/empleado a una nómina (llamado desde Payrolls.tsx). */
  importToPayroll: (payrollId: string) =>
    apiClient.post<{ imported: number; total: number; error?: string }>(
      `/api/hr/commissions/payrolls/${payrollId}/import-commissions`,
    ),
};
