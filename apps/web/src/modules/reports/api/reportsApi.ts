import { apiClient, type QueryParams } from '@/shared/http';

/**
 * Adaptador genérico de informes. Los informes son de solo lectura y todos
 * cuelgan de /api/reports/* (más algún lookup), así que un `get` por path
 * completo evita 20 métodos idénticos.
 */
export const reportsApi = {
  get: <T = unknown>(path: string, query?: QueryParams) => apiClient.get<T>(path, { query }),

  /** Descarga el PDF de un informe y dispara la descarga en el navegador. */
  async downloadPdf(path: string, fallbackName: string, query?: QueryParams): Promise<void> {
    const { blob, filename } = await apiClient.getBlob(path, { query });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || fallbackName;
    a.click();
    URL.revokeObjectURL(url);
  },
};
