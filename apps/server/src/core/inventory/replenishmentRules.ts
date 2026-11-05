/** Reglas de la reposición, sin base de datos. */

const round = (value: number) => Math.round(value * 1e4) / 1e4;

export interface ItemSupply {
  stock: number;
  committed: number;
  ordered: number;
  inDraft: number;
  minStock: number;
  reorderQty: number;
}

/**
 * Cuánto hay que pedir. Lo previsto es lo que hay, menos lo prometido, más lo que viene. Un
 * borrador todavía no viene, pero ya está pensado: no se propone otra vez.
 */
export function suggestion(supply: ItemSupply): {
  projected: number;
  shortfall: number;
  suggested: number;
} {
  const projected = round(supply.stock - supply.committed + supply.ordered);
  const shortfall = supply.minStock > 0 ? Math.max(0, round(supply.minStock - projected)) : 0;
  const left = round(shortfall - supply.inDraft);
  return { projected, shortfall, suggested: left > 0 ? Math.max(left, supply.reorderQty) : 0 };
}

export function groupBySupplier<T extends { supplierId: string }>(
  lines: T[],
): Array<{ supplierId: string; lines: T[] }> {
  const groups = new Map<string, T[]>();
  for (const line of lines) {
    groups.set(line.supplierId, [...(groups.get(line.supplierId) ?? []), line]);
  }
  return [...groups].map(([supplierId, own]) => ({ supplierId, lines: own }));
}

/** Un pedido llega con lo último que llegue. Sin ningún plazo, no se dice. */
export function deliveryDateFor(date: string, leadTimes: Array<number | null>): string | null {
  const known = leadTimes.filter((days): days is number => days !== null && days !== undefined);
  if (known.length === 0) return null;
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + Math.max(...known));
  return result.toISOString().slice(0, 10);
}
