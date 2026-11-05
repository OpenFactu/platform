import { apiClient, type QueryParams } from '@/shared/http';
import { openPdf } from '@/utils/downloadPdf';

/**
 * Adaptador genérico de informes. Los informes son de solo lectura y todos
 * cuelgan de /api/reports/* (más algún lookup), así que un `get` por path
 * completo evita 20 métodos idénticos.
 */
export const reportsApi = {
  get: <T = unknown>(path: string, query?: QueryParams) => apiClient.get<T>(path, { query }),

  /** Abre el PDF de un informe en una pestaña nueva. */
  async openPdf(path: string, fallbackName: string, query?: QueryParams): Promise<void> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    await openPdf(qs ? `${path}${path.includes('?') ? '&' : '?'}${qs}` : path, fallbackName);
  },
};
