import { and, eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { openPeriodsFor } from '../accounting/periodRules';
import { statusError } from './documentRules';

/**
 * La serie y el periodo de un documento que nadie está rellenando a mano. Las series son por
 * ejercicio: al cambiar de año se busca la que lleva el mismo prefijo que la elegida, y si no, la
 * predeterminada. Nunca una manual: nadie teclearía el número.
 */
export async function autoSeriesFor(
  tx: any,
  docType: string,
  date: string,
  preferredSeriesId?: string | null,
): Promise<{ period: any; series: any }> {
  const open = await openPeriodsFor(tx, date);
  if (open.length === 0) {
    throw statusError(409, `No hay un periodo contable abierto para el ${date}.`);
  }

  const all = await tx
    .select()
    .from(schema.documentSeries)
    .where(
      and(
        eq(schema.documentSeries.docType, docType),
        eq(schema.documentSeries.numberingMode, 'AUTO'),
      ),
    );
  const inPeriod = all.filter((series: any) => open.some((p: any) => p.id === series.periodId));
  const chosen = all.find((series: any) => series.id === preferredSeriesId);
  const series =
    inPeriod.find((s: any) => s.id === preferredSeriesId) ??
    (chosen ? inPeriod.find((s: any) => s.prefix === chosen.prefix) : undefined) ??
    inPeriod.find((s: any) => s.isDefault) ??
    inPeriod[0];
  if (!series) {
    throw statusError(409, `No hay una serie de numeración para el periodo ${open[0].code}.`);
  }
  return { period: open.find((p: any) => p.id === series.periodId), series };
}
