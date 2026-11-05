/** El servidor solo manda el coste a quien tiene permiso para verlo. */
export const hasCosts = (rows: Array<Record<string, unknown>>) =>
  rows.some((row) => row.cost !== undefined);

export const hasValues = (rows: Array<Record<string, unknown>>) =>
  rows.some((row) => row.value !== undefined);

interface CostFormat {
  money: (value: any) => string;
  number: (value: any, precision?: number) => string;
}

/** Sin ninguna unidad con coste, un margen del 100 % sería mentira: no se da. */
const unknownCost = (row: any) => Number(row?.uncosted || 0) > 0 && Number(row?.cost || 0) === 0;

export function costColumns(t: (key: string) => string, fmt: CostFormat) {
  return [
    {
      key: 'cost',
      label: t('reports.common.cost'),
      format: (value: any, row: any) =>
        unknownCost(row) ? t('reports.common.noCost') : fmt.money(value),
    },
    {
      key: 'margin',
      label: t('reports.common.margin'),
      format: (value: any, row: any) => (unknownCost(row) ? '—' : fmt.money(value)),
    },
    {
      key: 'marginRate',
      label: t('reports.common.marginRate'),
      format: (value: any, row: any) => (unknownCost(row) ? '—' : `${fmt.number(value, 1)} %`),
    },
  ];
}
