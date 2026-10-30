import { apiClient } from '@/shared/http';
import type {
  FormDoc,
  FormInviteRow,
  FormListItem,
  FormResponseDetail,
  FormResponseRow,
  FormSummary,
} from '../domain/types';

const BASE = '/api/forms';

export interface MemberOption {
  id: string;
  name: string;
}
export interface StageOption {
  id: string;
  name: string;
}

export const formsApi = {
  list: () => apiClient.get<FormListItem[]>(BASE),
  templates: () =>
    apiClient.get<Array<{ id: string; label: string; kind: 'form' | 'survey' }>>(
      `${BASE}/templates`,
    ),
  create: (name: string, template: string) => apiClient.post<FormDoc>(BASE, { name, template }),
  get: (id: string) => apiClient.get<FormDoc>(`${BASE}/${id}`),
  update: (id: string, patch: Partial<FormDoc>) => apiClient.patch<FormDoc>(`${BASE}/${id}`, patch),
  duplicate: (id: string) => apiClient.post<FormDoc>(`${BASE}/${id}/duplicate`),
  remove: (id: string) => apiClient.delete<void>(`${BASE}/${id}`),
  uploadAsset: (id: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return apiClient.postForm<{ id: string; fileName: string }>(`${BASE}/${id}/assets`, body);
  },
  /** Las imágenes del formulario se sirven por su ruta pública (un <img> no lleva la sesión). */
  publicAssetUrl: (tenantId: string, slug: string, assetId: string) =>
    `/api/public/forms/${tenantId}/${slug}/assets/${assetId}`,

  responses: (id: string) => apiClient.get<FormResponseRow[]>(`${BASE}/${id}/responses`),
  response: (id: string, rid: string) =>
    apiClient.get<FormResponseDetail>(`${BASE}/${id}/responses/${rid}`),
  grade: (id: string, rid: string, grades: Record<string, number>) =>
    apiClient.patch<FormResponseDetail['grading']>(`${BASE}/${id}/responses/${rid}/grades`, {
      grades,
    }),
  removeResponse: (id: string, rid: string) =>
    apiClient.delete<void>(`${BASE}/${id}/responses/${rid}`),
  removeAllResponses: (id: string) =>
    apiClient.delete<{ deleted: number }>(`${BASE}/${id}/responses`),
  fileUrl: (id: string, rid: string, fileId: string) =>
    `${BASE}/${id}/responses/${rid}/files/${fileId}`,
  summary: (id: string) => apiClient.get<FormSummary>(`${BASE}/${id}/summary`),
  exportUrl: (id: string) => `${BASE}/${id}/export`,
  releaseScores: (id: string) => apiClient.post<{ sent: number }>(`${BASE}/${id}/release-scores`),

  /** Para elegir a quién avisar y el responsable del prospecto. */
  members: () => apiClient.get<MemberOption[]>('/api/members'),
  /** Solo con el CRM activo. */
  crmContacts: () =>
    apiClient.get<Array<{ id: string; name: string; email: string | null }>>('/api/crm/contacts'),
  /** Solo con el CRM activo. */
  crmStages: () => apiClient.get<StageOption[]>('/api/crm/stages'),

  qr: (id: string) => apiClient.get<{ url: string; dataUrl: string }>(`${BASE}/${id}/qr`),
  invites: (id: string) => apiClient.get<FormInviteRow[]>(`${BASE}/${id}/invites`),
  invite: (
    id: string,
    body: { emails?: string[]; contactIds?: string[]; message?: string; send: boolean },
  ) =>
    apiClient.post<
      Array<{ name: string | null; email: string | null; link: string; emailed: boolean }>
    >(`${BASE}/${id}/invites`, body),
};
