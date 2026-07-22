import { apiClient } from '@/shared/http';
import type { Employee } from '../domain/employee';

export const employeesApi = {
  list: () => apiClient.get<Employee[]>('/api/hr/employees'),
  get: (id: string) => apiClient.get<Employee>(`/api/hr/employees/${id}`),
  create: (data: Record<string, unknown>) => apiClient.post<Employee>('/api/hr/employees', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<Employee>(`/api/hr/employees/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/hr/employees/${id}`),
};
