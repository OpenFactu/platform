/**
 * Formato ligero de los textos del formulario (descripciones, bloques de
 * texto, introducción): **negrita**, *cursiva* y ==resaltado==, por líneas.
 * Puro: devuelve trozos y el TSX decide cómo pintarlos (sin HTML crudo).
 */
export type RichPiece = { kind: 'text' | 'bold' | 'italic' | 'mark'; text: string };

const TOKEN = /(\*\*[^*\n]+?\*\*|==[^=\n]+?==|\*[^*\s][^*\n]*?\*)/g;

export function parseLine(line: string): RichPiece[] {
  const out: RichPiece[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: 'text', text: line.slice(last, at) });
    const t = m[0];
    if (t.startsWith('**')) out.push({ kind: 'bold', text: t.slice(2, -2) });
    else if (t.startsWith('==')) out.push({ kind: 'mark', text: t.slice(2, -2) });
    else out.push({ kind: 'italic', text: t.slice(1, -1) });
    last = at + t.length;
  }
  if (last < line.length) out.push({ kind: 'text', text: line.slice(last) });
  return out;
}

/** Párrafos (separados por una línea en blanco), cada uno con sus líneas. */
export function parseRichText(text: string): RichPiece[][][] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => p.split('\n').map(parseLine));
}
