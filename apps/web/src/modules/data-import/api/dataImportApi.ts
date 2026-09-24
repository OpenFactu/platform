import { apiClient } from '@/shared/http';
import type {
  ImportJob,
  ImportJobRow,
  ImportMode,
  ImportObject,
  SavedMapping,
  UploadResult,
} from '../types';

const BASE = '/api/data-import';

/** Dispara la descarga de un blob en el navegador. */
function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const dataImportApi = {
  objects: () => apiClient.get<ImportObject[]>(`${BASE}/objects`),

  async downloadTemplate(object: ImportObject): Promise<void> {
    const { blob, filename } = await apiClient.getBlob(
      `${BASE}/objects/${object.id}/template.xlsx`,
    );
    download(blob, filename || `plantilla-${object.id}.xlsx`);
  },

  upload(objectId: string, file: File): Promise<UploadResult> {
    const form = new FormData();
    form.append('objectId', objectId);
    form.append('file', file);
    return apiClient.postForm<UploadResult>(`${BASE}/uploads`, form);
  },

  createJob(input: {
    uploadId: string;
    objectId: string;
    fileName: string;
    sheetName?: string;
    linesSheetName?: string;
    mapping: Record<string, string>;
    mode: ImportMode;
    matchBy?: string;
    dryRun: boolean;
  }): Promise<{ jobId: string }> {
    return apiClient.post<{ jobId: string }>(`${BASE}/jobs`, input);
  },

  jobs: (limit = 25) => apiClient.get<ImportJob[]>(`${BASE}/jobs`, { query: { limit } }),

  activeJobs: () => apiClient.get<ImportJob[]>(`${BASE}/jobs/active`),

  job: (id: string) => apiClient.get<ImportJob>(`${BASE}/jobs/${id}`),

  jobRows: (id: string, status?: string) =>
    apiClient.get<ImportJobRow[]>(`${BASE}/jobs/${id}/rows`, { query: status ? { status } : {} }),

  cancel: (id: string) => apiClient.post<{ ok: boolean }>(`${BASE}/jobs/${id}/cancel`),

  undo: (id: string) => apiClient.post<{ ok: boolean }>(`${BASE}/jobs/${id}/undo`),

  async downloadErrors(job: ImportJob): Promise<void> {
    const { blob, filename } = await apiClient.getBlob(`${BASE}/jobs/${job.id}/errors.csv`);
    download(blob, filename || `errores-${job.fileName}.csv`);
  },

  mappings: (objectId: string) =>
    apiClient.get<SavedMapping[]>(`${BASE}/mappings`, { query: { objectId } }),

  saveMapping: (input: {
    objectId: string;
    name: string;
    mapping: Record<string, string>;
    mode?: ImportMode;
    matchBy?: string;
  }) => apiClient.post<SavedMapping>(`${BASE}/mappings`, input),

  deleteMapping: (id: string) => apiClient.delete<void>(`${BASE}/mappings/${id}`),
};
