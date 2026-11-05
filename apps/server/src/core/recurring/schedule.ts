/**
 * Las fechas de una factura recurrente. Salen siempre de la fecha de inicio, no de la
 * anterior: si no, un día 31 se quedaría en 28 después de pasar por febrero.
 */
export const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'semiannual', 'yearly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

const MONTHS: Record<Exclude<Frequency, 'weekly'>, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

const MAX_STEPS = 100_000;

const iso = (date: Date) => date.toISOString().slice(0, 10);

export const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  iso(new Date(`${value}T00:00:00Z`)) === value;

/** La fecha número `n` de la serie, empezando en 0. */
export function occurrence(start: string, frequency: Frequency, n: number): string {
  const base = new Date(`${start}T00:00:00Z`);
  if (frequency === 'weekly') {
    return iso(new Date(base.getTime() + n * 7 * 86_400_000));
  }
  const months = base.getUTCMonth() + n * MONTHS[frequency];
  const year = base.getUTCFullYear() + Math.floor(months / 12);
  const month = ((months % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(year, month, Math.min(base.getUTCDate(), lastDay))));
}

/** La primera fecha de la serie que cae ese día o después. */
export function firstOnOrAfter(start: string, frequency: Frequency, date: string): string {
  for (let n = 0; n < MAX_STEPS; n++) {
    const candidate = occurrence(start, frequency, n);
    if (candidate >= date) return candidate;
  }
  throw new Error('Fecha fuera de rango');
}

/** La primera fecha de la serie posterior a ese día. */
export function firstAfter(start: string, frequency: Frequency, date: string): string {
  for (let n = 0; n < MAX_STEPS; n++) {
    const candidate = occurrence(start, frequency, n);
    if (candidate > date) return candidate;
  }
  throw new Error('Fecha fuera de rango');
}
