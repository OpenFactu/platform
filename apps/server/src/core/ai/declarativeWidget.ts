/**
 * Widgets de dashboard "declarativos" (Fase 5) — un tercer `kind` para
 * `UserDashboardWidget` (junto a `metric` y `code`) pensado para que el chat
 * de IA los proponga: en vez de una métrica del catálogo curado o código React
 * arbitrario, un widget declarativo es `{ chartType, sql }` + mapeo de campos.
 *
 * La consulta SIEMPRE pasa por el mismo sandbox de solo lectura que
 * `run_read_query` (`validateQuery` + `runTemplateQueries`: transacción READ
 * ONLY, timeout, límite de filas) — ni el chat ni un admin pueden colar
 * escritura aquí. Compartido por el router (`api/dashboardWidgets.ts`, listado
 * y guardado) y la tool de acción (`tools/actionTools.ts`, que la usa para
 * validar antes de proponer la confirmación).
 */

import { z } from 'zod';
import { validateQuery } from '../documents/templateQueries';
import { sandboxQuery, type ChatToolContext } from './tools/util';

export const CHART_TYPES = ['kpi', 'bar', 'table'] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const queryConfigSchema = z.object({
  chartType: z.enum(CHART_TYPES),
  sql: z.string(),
  /** bar: columna del eje X. table: ignorado (se usan todas las columnas). */
  xField: z.string().optional(),
  /** bar: columna numérica del eje Y. */
  yField: z.string().optional(),
  /** kpi: columna del valor a mostrar; por defecto la 1ª columna numérica de la 1ª fila. */
  valueField: z.string().optional(),
});
export type QueryWidgetConfig = z.infer<typeof queryConfigSchema>;

const MAX_ROWS = 50;

/** Valida el SQL de un widget declarativo con el mismo sandbox que run_read_query. */
export function validateWidgetQuery(sql: string): string | null {
  return validateQuery(sql);
}

/**
 * Ejecuta la query del widget y da forma al resultado según `chartType`.
 * Nunca lanza por datos — un error de query se refleja como `{ error }` para
 * que el widget lo muestre en la UI en vez de romper el resto del dashboard.
 */
export async function resolveQueryWidget(
  ctx: ChatToolContext,
  config: QueryWidgetConfig,
): Promise<
  | { error: string }
  | { chartType: 'kpi'; value: unknown; label?: string }
  | { chartType: 'bar'; rows: Array<{ x: unknown; y: unknown }> }
  | { chartType: 'table'; columns: string[]; rows: Record<string, unknown>[] }
> {
  const invalid = validateWidgetQuery(config.sql);
  if (invalid) return { error: invalid };
  let rows: any[];
  try {
    rows = await sandboxQuery(ctx, config.sql);
  } catch (e: any) {
    return { error: e?.message || 'Error al ejecutar la consulta' };
  }
  if (rows.length === 0) return { error: 'La consulta no devolvió filas' };

  if (config.chartType === 'kpi') {
    const first = rows[0] as Record<string, unknown>;
    const keys = Object.keys(first);
    const field = config.valueField && config.valueField in first ? config.valueField : keys[0];
    return { chartType: 'kpi', value: first[field], label: field };
  }

  if (config.chartType === 'bar') {
    const first = rows[0] as Record<string, unknown>;
    const keys = Object.keys(first);
    const xField = config.xField && config.xField in first ? config.xField : keys[0];
    const yField = config.yField && config.yField in first ? config.yField : (keys[1] ?? keys[0]);
    return {
      chartType: 'bar',
      rows: rows.slice(0, MAX_ROWS).map((r) => ({ x: r[xField], y: r[yField] })),
    };
  }

  // table
  const columns = Object.keys(rows[0] as Record<string, unknown>);
  return { chartType: 'table', columns, rows: rows.slice(0, MAX_ROWS) };
}
