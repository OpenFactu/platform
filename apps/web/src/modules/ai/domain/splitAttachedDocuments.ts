export interface AttachedDocumentBlock {
  filename: string;
  truncated: boolean;
  text: string;
}

const MARKER_RE = /--- Documento adjunto: (.+?)(?: \(truncado\))? ---\n/g;

/**
 * `useComposerState.submit()` concatena el texto extraído de cada documento
 * adjunto (Excel/PDF/Word/CSV) directamente en el texto del mensaje del
 * usuario — así el MODELO lo lee sin necesitar ninguna tool. Pero eso mismo
 * texto es lo que se guarda como `part.text` del mensaje, así que al
 * renderizarlo hay que separarlo de nuevo: lo que el usuario escribió a mano
 * (se muestra tal cual) de los bloques "--- Documento adjunto: ... ---"
 * (se muestran como chips plegables, no como un muro de texto).
 */
export function splitAttachedDocuments(fullText: string): {
  userText: string;
  documents: AttachedDocumentBlock[];
} {
  MARKER_RE.lastIndex = 0;
  const matches = [...fullText.matchAll(MARKER_RE)];
  if (matches.length === 0) return { userText: fullText, documents: [] };

  const firstIndex = matches[0].index ?? 0;
  const userText = fullText.slice(0, firstIndex).trim();
  const documents: AttachedDocumentBlock[] = matches.map((m, i) => {
    const contentStart = (m.index ?? 0) + m[0].length;
    const contentEnd = i + 1 < matches.length ? matches[i + 1].index : fullText.length;
    return {
      filename: m[1],
      truncated: m[0].includes('(truncado)'),
      text: fullText.slice(contentStart, contentEnd).trim(),
    };
  });
  return { userText, documents };
}
