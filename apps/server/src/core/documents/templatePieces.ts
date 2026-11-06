import { PdfRenderer } from '@openfactu/pdf';

/**
 * Resuelve trozos sueltos de una plantilla: el diseñador los pide para pintar cada
 * elemento igual que en el PDF. Uno que no compile da `null` y no afecta a los demás,
 * porque mientras se escribe una expresión es normal que esté a medias.
 */
export function renderTemplatePieces(pieces: string[], data: unknown): (string | null)[] {
  return pieces.map((piece) => {
    try {
      return PdfRenderer.renderHtml(piece, data);
    } catch {
      return null;
    }
  });
}
