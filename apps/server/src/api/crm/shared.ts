/**
 * Utilidades comunes de los routers del CRM.
 */

/** Copia del body solo las claves permitidas; '' pasa a null y las fechas indicadas a Date. */
export function pick(body: any, allowed: string[], dateKeys: string[] = []): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of allowed) {
    if (!body || !(k in body)) continue;
    const v = body[k] === '' ? null : body[k];
    out[k] = dateKeys.includes(k) && typeof v === 'string' ? new Date(v) : v;
  }
  return out;
}

/** Etiquetas limpias: texto, sin vacíos ni repetidas (sin distinguir mayúsculas). */
export function normalizeTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of v) {
    const t = String(raw ?? '')
      .trim()
      .slice(0, 40);
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out.slice(0, 20);
}

/** Mensaje útil a partir de un error de Drizzle (que esconde la causa de pg en `cause`). */
export function errorDetail(error: any): string {
  return error?.cause?.detail || error?.cause?.message || error?.message || 'Error desconocido';
}
