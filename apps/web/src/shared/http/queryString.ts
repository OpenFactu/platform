export type QueryParams = Record<string, string | number | boolean | undefined | null>;

/**
 * Construye un query string a partir de un objeto plano.
 * Omite claves con valor `undefined` o `null`. Devuelve '' o '?a=1&b=2'.
 */
export function buildQuery(params?: QueryParams): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
