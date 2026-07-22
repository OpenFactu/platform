import { apiClient } from '@/shared/http';
import type { Contract } from '../domain/employee';

export const contractsApi = {
  listByEmployee: (employeeId: string) =>
    apiClient.get<Contract[]>('/api/hr/contracts', { query: { employeeId } }),
};
