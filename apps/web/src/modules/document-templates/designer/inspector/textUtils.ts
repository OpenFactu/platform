export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Convierte texto plano a un HTML mínimo seguro para el editor de texto rico:
 * escapa los metacarácteres y reemplaza saltos de línea por <br/>.
 */
export function escapePlainToHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}

export function appendSnippet(current: string | undefined, snippet: string): string {
  const cur = current ?? '';
  if (!cur) return snippet;
  return cur.endsWith('\n') ? cur + snippet : cur + ' ' + snippet;
}
