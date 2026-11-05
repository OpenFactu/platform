import { apiClient } from '@/shared/http';

/** Dispara la descarga de un fichero ya generado. */
export function saveBlob(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

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
  saveBlob(blob, filename || fallbackName);
}

export const PDF_VIEWER_PATH = '/pdf-viewer';

/**
 * El visor pide esta ruta con la sesión del usuario, así que solo admite rutas de
 * nuestra API: un enlace manipulado no puede llevarse el token a otro sitio.
 */
export function isApiPath(path: string | null | undefined): path is string {
  return (
    typeof path === 'string' &&
    /^\/api\/[^\s\\]*$/.test(path) &&
    !path.includes('//') &&
    !path.split('?')[0].split('/').includes('..')
  );
}

/**
 * Abre el PDF en una pestaña nueva para verlo antes de imprimirlo o guardarlo. Si el
 * navegador bloquea la pestaña, se descarga como antes.
 */
export async function openPdf(url: string, fallbackName?: string): Promise<void> {
  const win = window.open(`${PDF_VIEWER_PATH}?src=${encodeURIComponent(url)}`, '_blank');
  if (!win) await downloadPdf(url, fallbackName);
}
