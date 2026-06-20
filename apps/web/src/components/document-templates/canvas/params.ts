import type { CanvasLayout, ParamDef } from './types';

/**
 * Placeholders que el servidor rellena automáticamente según el contexto del
 * render (no se piden en el formulario de generación).
 */
export const STANDARD_PARAMS = ['docId', 'partnerId', 'companyId', 'tenantId'];

const PLACEHOLDER_RE = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;

/**
 * Extrae los nombres de placeholder (`:nombre`) de las queries de un layout,
 * únicos y excluyendo los estándar. Son los parámetros de entrada que el
 * usuario debe rellenar para generar el documento.
 */
export function extractPlaceholders(queries: CanvasLayout['queries']): string[] {
  const found = new Set<string>();
  for (const q of queries ?? []) {
    if (!q?.sql) continue;
    let m: RegExpExecArray | null;
    PLACEHOLDER_RE.lastIndex = 0;
    while ((m = PLACEHOLDER_RE.exec(q.sql))) {
      const name = m[1];
      if (!STANDARD_PARAMS.includes(name)) found.add(name);
    }
  }
  return [...found];
}

/**
 * Combina los placeholders detectados en las queries con la metadata definida en
 * `layout.paramsSchema` (la metadata manda). El orden sigue al schema y luego los
 * placeholders nuevos detectados que aún no estén en el schema.
 */
export function resolveInputParams(layout: CanvasLayout): ParamDef[] {
  const detected = extractPlaceholders(layout.queries);
  const schema = layout.paramsSchema ?? [];
  const byName = new Map<string, ParamDef>();
  for (const p of schema) byName.set(p.name, p);
  const out: ParamDef[] = [];
  // Primero los del schema que sigan existiendo como placeholder.
  for (const p of schema) if (detected.includes(p.name)) out.push(p);
  // Luego los detectados que no estén en el schema → texto por defecto.
  for (const name of detected) if (!byName.has(name)) out.push({ name });
  return out;
}
