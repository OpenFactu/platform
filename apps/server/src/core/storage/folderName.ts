/**
 * Sanea un nombre de carpeta logico para usarlo como segmento de ruta REAL en
 * el almacenamiento fisico (disco local, OneDrive, Google Drive). Critico
 * para el adapter local: sin esto, una carpeta como "../../etc" seria una
 * vulnerabilidad de path traversal. Para los adapters cloud es simple
 * higiene (nombres de carpeta consistentes en la API).
 */
export function sanitizeFolderSegment(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value
    .replace(/[/\\]/g, ' ') // separadores de ruta -> espacio, no se anidan sub-carpetas desde aqui
    .replace(/\.\./g, ' ') // traversal
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '') // caracteres de control
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return clean || null;
}
