import { apiClient } from '@/shared/http';
import type { Department } from '../domain/department';

/** Solo lectura: el CRUD completo vive en DimensionCrudPage vía crudApi (ver pages/Departments.tsx). */
export const departmentsApi = {
  list: () => apiClient.get<Department[]>('/api/hr/departments'),
};
