import { apiClient, ApiError, type BlobResult } from '@/shared/http';
import type { Payroll, PayrollLine, PayrollCreateResponse } from '../domain/payroll';

export interface PayrollCreateSafeResult {
  ok: boolean;
  status: number;
  data: PayrollCreateResponse;
}

export const payrollsApi = {
  list: () => apiClient.get<Payroll[]>('/api/hr/payrolls'),
  get: (id: string) => apiClient.get<Payroll>(`/api/hr/payrolls/${id}`),
  remove: (id: string) => apiClient.delete<void>(`/api/hr/payrolls/${id}`),
  approve: (id: string) => apiClient.post<Payroll>(`/api/hr/payrolls/${id}/approve`, {}),
  autoDeductions: (id: string) =>
    apiClient.post<{ created: number; error?: string }>(`/api/hr/payrolls/${id}/auto-deductions`),

  addLine: (payrollId: string, data: Record<string, unknown>) =>
    apiClient.post<PayrollLine>(`/api/hr/payrolls/${payrollId}/lines`, data),
  updateLine: (payrollId: string, lineId: string, data: Record<string, unknown>) =>
    apiClient.patch<PayrollLine>(`/api/hr/payrolls/${payrollId}/lines/${lineId}`, data),
  removeLine: (payrollId: string, lineId: string) =>
    apiClient.delete<void>(`/api/hr/payrolls/${payrollId}/lines/${lineId}`),

  payslipPdf: (id: string): Promise<BlobResult> => apiClient.getBlob(`/api/reports/payslip/${id}/pdf`),

  /**
   * Variante tolerante SOLO para el flujo de creación de nómina: si el
   * backend responde 409 con `{existingId}`, la UI necesita abrir la nómina
   * existente en vez de lanzar; y la generación masiva (bucle por empleado
   * en Payrolls.tsx) usa `status === 409` para contar "saltadas" sin romper
   * el bucle. El resto de payrollsApi lanza ApiError normal.
   */
  async createSafe(data: {
    employeeId: string;
    periodYear: number;
    periodMonth: number;
  }): Promise<PayrollCreateSafeResult> {
    try {
      const created = await apiClient.post<PayrollCreateResponse>('/api/hr/payrolls', data);
      return { ok: true, status: 200, data: created };
    } catch (e) {
      if (e instanceof ApiError && e.status !== 0) {
        return { ok: false, status: e.status, data: e.body as PayrollCreateResponse };
      }
      throw e;
    }
  },
};
