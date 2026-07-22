import { apiClient } from '../../../shared/http';
import type { Category } from '../domain/category';

export interface CategoryInput {
  name: string;
  codePrefix?: string | null;
  parentId?: string | null;
}

export const categoriesApi = {
  list: () => apiClient.get<Category[]>('/api/categories'),
  create: (data: CategoryInput) => apiClient.post<Category>('/api/categories', data),
  update: (id: string, data: Partial<CategoryInput>) =>
    apiClient.patch<Category>(`/api/categories/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/categories/${id}`),
};
