import { apiClient } from '@/shared/http';

/**
 * Descarga un PDF desde un endpoint autenticado y fuerza la descarga con el
 * filename devuelto por el servidor (Content-Disposition) o el fallback.
 * La auth (token + tenant) la pone el ApiClient central.
 */
export async function downloadPdf(
  url: string,
  fallbackName: string = 'documento.pdf',
): Promise<void> {
  const { blob, filename } = await apiClient.getBlob(url);

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename || fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}
