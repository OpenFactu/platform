/**
 * Formatea el código visible de un documento a partir de la serie, el periodo
 * y el número, omitiendo las partes vacías (evita el "null-..." o el guion
 * suelto cuando la serie no tiene prefijo o no hay periodo).
 *
 * Reglas de formato:
 *   - Serie MANUAL  → `PREFIJO-NÚMERO`  (sin periodo; pensado para importaciones
 *                     desde otros ERPs, donde el documento conserva su propia
 *                     numeración de origen). Ej: `ODOO-000001`.
 *   - Serie AUTO    → `PREFIJO-PERIODO-NÚMERO`. Ej: `FA-2026-000042`.
 *
 * Si falta el prefijo, simplemente no aparece: `2026-000042` / `000001`.
 */
export interface DocCodeParts {
  seriesPrefix?: string | null;
  periodCode?: string | null;
  docNum?: number | string | null;
  /** 'AUTO' | 'MANUAL' — si es MANUAL se omite el periodo. */
  numberingMode?: string | null;
}

export function formatDocCode(d: DocCodeParts | null | undefined, padTo = 6): string {
  if (!d) return '—';
  const num =
    d.docNum != null && d.docNum !== '' ? String(d.docNum).padStart(padTo, '0') : '';
  const parts =
    d.numberingMode === 'MANUAL'
      ? [d.seriesPrefix, num]
      : [d.seriesPrefix, d.periodCode, num];
  return parts.filter((p) => p != null && p !== '').join('-') || '—';
}
