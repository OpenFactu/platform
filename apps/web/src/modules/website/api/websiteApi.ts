import { apiClient } from '@/shared/http';
import type {
  WebsiteAsset,
  WebsiteHost,
  WebsitePage,
  WebsiteSite,
  WebsiteSubmission,
} from '../domain/website';

export const websiteApi = {
  getSite: () => apiClient.get<WebsiteSite>('/api/website/site'),
  updateSite: (patch: Partial<WebsiteSite>) =>
    apiClient.put<WebsiteSite>('/api/website/site', patch),

  listHosts: () => apiClient.get<WebsiteHost[]>('/api/website/hosts'),
  addHost: (kind: 'subdomain' | 'domain', value: string) =>
    apiClient.post<{ ok: true }>('/api/website/hosts', { kind, value }),
  removeHost: (id: string) => apiClient.delete<{ ok: true }>(`/api/website/hosts/${id}`),

  listPages: () => apiClient.get<WebsitePage[]>('/api/website/pages'),
  createPage: (data: { title: string; path: string }) =>
    apiClient.post<WebsitePage>('/api/website/pages', data),
  getPage: (id: string) => apiClient.get<WebsitePage>(`/api/website/pages/${id}`),
  updatePage: (id: string, patch: Partial<WebsitePage>) =>
    apiClient.put<WebsitePage>(`/api/website/pages/${id}`, patch),
  deletePage: (id: string) => apiClient.delete<{ ok: true }>(`/api/website/pages/${id}`),
  publishPage: (id: string) => apiClient.post<{ ok: true }>(`/api/website/pages/${id}/publish`),
  publishAll: () => apiClient.post<{ ok: true; pages: number }>('/api/website/publish'),

  /** HTML del draft renderizado por el server (mismo renderer que el público). */
  previewHtml: async (id: string): Promise<string> => {
    const { blob } = await apiClient.getBlob(`/api/website/pages/${id}/preview`);
    return blob.text();
  },

  uploadAsset: (file: File, folder?: string | null): Promise<WebsiteAsset> => {
    const form = new FormData();
    form.append('file', file);
    if (folder) form.append('folder', folder);
    return apiClient.postForm<WebsiteAsset>('/api/website/assets', form);
  },
  listAssets: () => apiClient.get<WebsiteAsset[]>('/api/website/assets'),
  updateAssetMeta: (id: string, patch: { folder?: string | null; tags?: string[] }) =>
    apiClient.put<WebsiteAsset>(`/api/website/assets/${id}`, patch),
  deleteAsset: (id: string) => apiClient.delete<{ ok: true }>(`/api/website/assets/${id}`),

  listSubmissions: () => apiClient.get<WebsiteSubmission[]>('/api/website/submissions'),
  markSubmissionRead: (id: string) =>
    apiClient.put<{ ok: true }>(`/api/website/submissions/${id}/read`),
};
