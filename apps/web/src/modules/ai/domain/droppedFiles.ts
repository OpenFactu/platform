/**
 * Clasificación de los archivos que entran al compositor del chat —
 * arrastrados, pegados o elegidos en el diálogo — entre las DOS vías que
 * soporta Keiro, que no son intercambiables:
 *
 * - **Imágenes** → viajan al modelo como adjunto de verdad (`FileUIPart`), así
 *   que solo sirven si el modelo activo tiene visión.
 * - **Documentos** (Excel/PDF/Word/CSV/TXT) → se suben a `/api/ai/extract-file`
 *   y lo que viaja en el mensaje es el TEXTO extraído en el server, nunca el
 *   archivo. Funciona con cualquier proveedor, incluido uno local sin soporte
 *   nativo de esos formatos.
 *
 * La vía la decide el ARCHIVO, no el modelo: soltar un PDF sobre un modelo con
 * visión sigue siendo un documento. Lógica pura (sin React) para poder
 * compartirla entre el soltar, el pegar y los `<input type="file">`.
 */

/** Extensiones que sabe leer `extractTextFromFile` (server: core/ai/fileProcessing.ts). */
export const DOCUMENT_EXTENSIONS = [
  '.xlsx',
  '.xls',
  '.xlsm',
  '.pdf',
  '.doc',
  '.docx',
  '.csv',
  '.txt',
  '.md',
  '.json',
  '.tsv',
];

/** Valor del atributo `accept` del input de documentos. */
export const DOCUMENT_ACCEPT = DOCUMENT_EXTENSIONS.join(',');

/** Un archivo arrastrado desde el escritorio puede llegar sin `type` (pasa con
 * .heic, con archivos de red y en algunos gestores de archivos de Linux), así
 * que la extensión es el segundo criterio, no el primero. */
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i;

export type RejectionReason = 'no-vision' | 'unsupported';

export interface RejectedFile {
  name: string;
  reason: RejectionReason;
}

export interface ClassifiedFiles {
  images: File[];
  documents: File[];
  rejected: RejectedFile[];
}

const isImage = (file: File) => file.type.startsWith('image/') || IMAGE_EXT.test(file.name);

const isDocument = (file: File) =>
  DOCUMENT_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));

/**
 * Reparte los archivos entre imágenes, documentos y descartados.
 *
 * @param acceptImages  Si el modelo activo admite imágenes. Si no, las
 *                      imágenes se descartan con motivo propio en vez de
 *                      colarse por la vía de documentos (que no sabría leerlas).
 */
export function classifyFiles(
  input: FileList | File[] | null | undefined,
  { acceptImages }: { acceptImages: boolean },
): ClassifiedFiles {
  const result: ClassifiedFiles = { images: [], documents: [], rejected: [] };
  for (const file of Array.from(input ?? [])) {
    if (isImage(file)) {
      if (acceptImages) result.images.push(file);
      else result.rejected.push({ name: file.name, reason: 'no-vision' });
    } else if (isDocument(file)) {
      result.documents.push(file);
    } else {
      result.rejected.push({ name: file.name, reason: 'unsupported' });
    }
  }
  return result;
}

/** Mensaje único para lo descartado, o `null` si no se descartó nada. */
export function rejectionMessage(rejected: RejectedFile[]): string | null {
  if (rejected.length === 0) return null;
  const names = (reason: RejectionReason) =>
    rejected.filter((r) => r.reason === reason).map((r) => r.name);
  const noVision = names('no-vision');
  const unsupported = names('unsupported');
  const parts: string[] = [];
  if (noVision.length > 0) {
    parts.push(`El modelo activo no admite imágenes: ${noVision.join(', ')}`);
  }
  if (unsupported.length > 0) {
    parts.push(
      `Formato no admitido: ${unsupported.join(', ')} — se admiten Excel, PDF, Word, CSV/TXT e imágenes`,
    );
  }
  return parts.join('. ');
}
