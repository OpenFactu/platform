function addDaysIso(baseDate: Date, days: number): string {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Campos permitidos en PATCH cuando una factura tiene `isLocked = true`.
 * Cualquier otro campo en el body → 409 Conflict.
 *
 * El resto (fechas, líneas, partner, totales) está congelado por ley
 * antifraude y similar. Cambios operativos sólo vía rectificativas.
 */
export const LOCKED_INVOICE_ALLOWED_FIELDS = new Set<string>([
  'notes',
  'internalNotes',
  'fiscalHash',
  'fiscalHashPrev',
  'fiscalStatus',
  'fiscalSentAt',
  'fiscalRef',
]);

/**
 * Lanza error si el body trae campos no permitidos en una factura lockada.
 */
export function assertLockedPatchAllowed(body: Record<string, any>): void {
  const keys = Object.keys(body || {});
  const forbidden = keys.filter((k) => !LOCKED_INVOICE_ALLOWED_FIELDS.has(k));
  if (forbidden.length > 0) {
    const err: any = new Error(
      `Factura lockada. No se pueden modificar: ${forbidden.join(', ')}. Crea una rectificativa.`,
    );
    err.statusCode = 409;
    err.code = 'INVOICE_LOCKED';
    throw err;
  }
}

/**
 * Calcula el array `paymentDueLines` a partir de una fecha base y un
 * `PaymentTerm` con splits `[{days, percentage}]`.
 *
 * Ej.: total 1000 con term 30/60 (50/50) y baseDate 2026-04-20:
 *   → [{date: '2026-05-20', amount: 500}, {date: '2026-06-19', amount: 500}]
 */
export function buildPaymentDueLines(
  baseDate: Date,
  termLines: Array<{ days: number; percentage: number }>,
  total: number,
): Array<{ date: string; amount: number }> {
  if (!termLines || termLines.length === 0) return [];
  return termLines.map((tl) => ({
    date: addDaysIso(baseDate, tl.days),
    amount: Math.round(((total * tl.percentage) / 100) * 100) / 100,
  }));
}

/**
 * Devuelve la fecha de vencimiento final = la fecha más lejana del array.
 */
export function latestDueDate(dues: Array<{ date: string; amount: number }>): string | null {
  if (!dues || dues.length === 0) return null;
  return (
    dues
      .map((d) => d.date)
      .sort()
      .at(-1) || null
  );
}

/**
 * Calcula `withholdingAmount` a partir de subtotal y `withholdingRate`.
 * Si la rate es null/undefined, devuelve null.
 */
export function computeWithholding(
  subtotal: number,
  rate: number | string | null | undefined,
): number | null {
  const r = Number(rate);
  if (!r || Number.isNaN(r)) return null;
  return Math.round(((Number(subtotal) * r) / 100) * 10000) / 10000;
}
