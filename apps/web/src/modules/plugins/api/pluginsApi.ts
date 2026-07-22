import { apiClient } from '@/shared/http';
import type { PluginInfo } from '../domain/PluginInfo';
import type { PluginField } from '../domain/PluginField';
import type { PluginTable } from '../domain/PluginTable';

export const pluginsApi = {
  list: () => apiClient.get<PluginInfo[]>('/api/plugins/available'),
  fields: () => apiClient.get<PluginField[]>('/api/plugins/fields'),
  tables: () => apiClient.get<PluginTable[]>('/api/plugins/tables'),
  activate: (pluginId: string) => apiClient.post<void>(`/api/plugins/${pluginId}/activate`, {}),
  deactivate: (pluginId: string) => apiClient.post<void>(`/api/plugins/${pluginId}/deactivate`, {}),
};
