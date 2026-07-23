import { apiClient } from '@/shared/http';
import type { Task, GanttResponse } from '../domain/task';

export const tasksApi = {
  list: (query?: { projectId?: string; assigneeId?: string }) =>
    apiClient.get<Task[]>('/api/hr/tasks', { query }),
  create: (data: Record<string, unknown>) => apiClient.post<Task>('/api/hr/tasks', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<Task>(`/api/hr/tasks/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/hr/tasks/${id}`),
  gantt: (query: { from: string; to: string; projectId?: string }) =>
    apiClient.get<GanttResponse>('/api/hr/tasks/gantt', { query }),
};
