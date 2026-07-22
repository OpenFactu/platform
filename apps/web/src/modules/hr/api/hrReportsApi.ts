import { apiClient } from '@/shared/http';

export interface LaborCostRow {
  key: string;
  label: string;
  gross: number;
  ssEr: number;
  total: number;
  count: number;
}

export interface LaborCostResponse {
  rows: LaborCostRow[];
  totals: { gross: number; ssEr: number; total: number };
}

export interface ProductivityRow {
  employeeId: string;
  code: string;
  name: string;
  departmentId: string | null;
  hoursContracted: number;
  hoursPlanned: number;
  hoursClocked: number;
  hoursOvertime: number;
  compliancePct: number;
  incidentsByType: Record<string, number>;
  absenceDays: number;
}

export const hrReportsApi = {
  laborCost: (query: { from: string; to: string; groupBy: string }) =>
    apiClient.get<LaborCostResponse>('/api/reports/hr/labor-cost', { query }),
  productivity: (query: { from: string; to: string; employeeId?: string; departmentId?: string }) =>
    apiClient.get<ProductivityRow[]>('/api/reports/hr/productivity', { query }),
};
