/**
 * Qué días cubre un periodo contable y qué serie le corresponde, sin React. El servidor lo
 * comprueba en `core/accounting/periodRules.ts`; esto repite la regla para no dejar llegar hasta
 * el error, así que si cambia una, cambia la otra.
 */
const DAY_MS = 86_400_000;

interface PeriodLike {
  id: string;
  name?: string;
  status?: string | null;
  startDate: string | Date;
  endDate: string | Date;
}

interface SeriesLike {
  id: string;
  prefix?: string | null;
  periodId?: string | null;
  isDefault?: boolean | null;
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Se guardan con la hora local del servidor: el día cuya medianoche queda más cerca. */
const nearestDay = (ms: number) => isoDay(ms + DAY_MS / 2);

export function periodDays(period: Pick<PeriodLike, 'startDate' | 'endDate'>): {
  first: string;
  last: string;
} {
  const start = new Date(period.startDate).getTime();
  const end = new Date(period.endDate).getTime();
  // Acabado en :59 es el último segundo de su día; si no, es el día en sí.
  const last =
    new Date(end).getUTCSeconds() === 59
      ? isoDay(Date.parse(nearestDay(end + 1000)) - DAY_MS)
      : nearestDay(end);
  return { first: nearestDay(start), last };
}

export function coversDate(
  period: Pick<PeriodLike, 'startDate' | 'endDate'>,
  date: string,
): boolean {
  const time = new Date(date).getTime();
  if (Number.isNaN(time)) return false;
  const day = isoDay(time);
  const { first, last } = periodDays(period);
  return day >= first && day <= last;
}

export const isOpenPeriod = (period?: Pick<PeriodLike, 'status'> | null): boolean =>
  period?.status === 'O';

/** El periodo abierto de esa fecha; si hay varios, el más reciente. */
export function openPeriodFor<T extends PeriodLike>(periods: T[], date: string): T | undefined {
  return periods
    .filter((period) => isOpenPeriod(period) && coversDate(period, date))
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];
}

/** La serie al cambiar de periodo: la misma si vale, la de su prefijo, la predeterminada. */
export function seriesForPeriod<T extends SeriesLike>(
  series: T[],
  periodId: string,
  currentId?: string,
): T | undefined {
  const own = series.filter((s) => s.periodId === periodId);
  const current = series.find((s) => s.id === currentId);
  return (
    own.find((s) => s.id === currentId) ??
    (current?.prefix ? own.find((s) => s.prefix === current.prefix) : undefined) ??
    own.find((s) => s.isDefault) ??
    own[0]
  );
}
