/**
 * Qué días cubre un periodo contable y qué admite. Un periodo cerrado no admite documentos,
 * cobros ni asientos, y un documento tiene que llevar una fecha de su periodo.
 *
 * Las fechas de un periodo se guardaron con la hora local del servidor que lo creó, o con solo
 * el día: un 1 de enero puede estar guardado como el 31 de diciembre a las 23:00. Por eso no se
 * comparan a pelo. `apps/web/src/modules/documents/domain/periods.ts` repite la misma regla
 * para no dejar llegar hasta el error, así que si cambia una, cambia la otra.
 */
import { asc, eq } from 'drizzle-orm';
import * as schema from '../../db/schema';

const DAY_MS = 86_400_000;
const OPEN_STATUS = 'O';

export interface PeriodRange {
  startDate: Date | string;
  endDate: Date | string;
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** El día cuya medianoche queda más cerca: cubre cualquier zona horaria. */
const nearestDay = (ms: number) => isoDay(ms + DAY_MS / 2);

/** El primer y el último día del periodo, en `AAAA-MM-DD`. */
export function periodDays(period: PeriodRange): { first: string; last: string } {
  const start = new Date(period.startDate).getTime();
  const end = new Date(period.endDate).getTime();
  // Acabado en :59 es el último segundo de su día; si no, es el día en sí.
  const last =
    new Date(end).getUTCSeconds() === 59
      ? isoDay(Date.parse(nearestDay(end + 1000)) - DAY_MS)
      : nearestDay(end);
  return { first: nearestDay(start), last };
}

/** El día de una fecha, o `null` si no lo es. */
export function dayOf(date: Date | string | null | undefined): string | null {
  if (date === null || date === undefined || date === '') return null;
  const time = new Date(date).getTime();
  return Number.isNaN(time) ? null : isoDay(time);
}

export function coversDate(period: PeriodRange, date: Date | string): boolean {
  const day = dayOf(date);
  if (!day) return false;
  const { first, last } = periodDays(period);
  return day >= first && day <= last;
}

export const isOpenPeriod = (period: { status?: string | null } | null | undefined): boolean =>
  period?.status === OPEN_STATUS;

function httpError(statusCode: number, message: string): Error {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function allPeriods(db: any): Promise<any[]> {
  return db
    .select()
    .from(schema.accountingPeriods)
    .orderBy(asc(schema.accountingPeriods.startDate));
}

/** Los periodos abiertos que cubren esa fecha; el más reciente, primero. */
export async function openPeriodsFor(db: any, date: Date | string): Promise<any[]> {
  const periods = await allPeriods(db);
  return periods.filter((p) => isOpenPeriod(p) && coversDate(p, date)).reverse();
}

/** Lanza si ese periodo no admite un documento con esa fecha. */
export async function assertPeriodAccepts(
  db: any,
  periodId: string,
  date: Date | string,
): Promise<any> {
  const [period] = await db
    .select()
    .from(schema.accountingPeriods)
    .where(eq(schema.accountingPeriods.id, periodId));
  if (!period) throw httpError(400, 'Ese periodo contable no existe.');
  if (!isOpenPeriod(period)) {
    throw httpError(409, `El periodo ${period.name} está cerrado: no admite documentos.`);
  }
  if (!coversDate(period, date)) {
    throw httpError(400, `La fecha ${dayOf(date)} no cae en el periodo ${period.name}.`);
  }
  return period;
}

/**
 * El periodo al que va un cobro: el abierto de su fecha, aunque su factura sea de otro. Si esa
 * fecha es de un periodo cerrado no se admite, y si no es de ninguno va al de la factura mientras
 * siga abierto. Lanza antes de guardar nada, para no dejar un cobro sin su asiento.
 */
export async function paymentPeriodFor(
  db: any,
  date: Date | string,
  invoicePeriodId?: string | null,
): Promise<string> {
  const periods = await allPeriods(db);
  const covering = periods.filter((p) => coversDate(p, date));
  const open = covering.filter(isOpenPeriod);
  if (open.length > 0) return open[open.length - 1].id;
  if (covering.length > 0) {
    throw httpError(409, `El periodo ${covering[0].name} está cerrado: elige otra fecha.`);
  }
  const invoicePeriod = periods.find((p) => p.id === invoicePeriodId);
  if (invoicePeriod && isOpenPeriod(invoicePeriod)) return invoicePeriod.id;
  throw httpError(409, `No hay un periodo contable abierto para el ${dayOf(date)}.`);
}

/** Lanza si esa fecha cae en un periodo cerrado y en ninguno abierto. */
export async function assertDateNotClosed(db: any, date: Date | string): Promise<void> {
  const periods = await allPeriods(db);
  const covering = periods.filter((p) => coversDate(p, date));
  if (covering.length > 0 && !covering.some(isOpenPeriod)) {
    throw httpError(409, `El periodo ${covering[0].name} está cerrado: elige otra fecha.`);
  }
}
