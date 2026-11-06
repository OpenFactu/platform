/**
 * Reglas de un recuento, sin base de datos.
 *
 * El stock se guarda en capas que no se cruzan: por zona no se sabe el lote, y por lote no se
 * sabe la zona. Así que una línea cuenta una sola capa:
 *   - un artículo normal, por zona, y aparte lo que no tiene ubicación;
 *   - uno con lote o serie, por lote, y aparte lo que no está en ninguno;
 *   - en un recuento de una zona, por el total de esa zona, sin separar lotes.
 * Lo que la línea no dice se decide al repartir la diferencia (`allocateDifference`).
 */

export interface ItemLayers {
  itemId: string;
  /** `N` normal, `B` por lotes, `S` por series. */
  manageBy: string;
  warehouse: number;
  zones: Array<{ zoneId: string; stock: number }>;
  batches: Array<{ batchNum: string; quantity: number }>;
}

export interface LineKey {
  zoneId: string | null;
  batchNum: string | null;
}

export interface ExpectedLine extends LineKey {
  itemId: string;
  expectedQty: number;
}

/** Un movimiento de la diferencia, con su signo. */
export interface Allocation extends LineKey {
  quantity: number;
}

export const roundQty = (value: number) => Math.round(value * 1e4) / 1e4;
const isZero = (value: number) => Math.abs(value) < 1e-4;
const sumBy = <T>(rows: T[], pick: (row: T) => number) =>
  rows.reduce((total, row) => total + pick(row), 0);

const isTracked = (layers: { manageBy: string }) => layers.manageBy !== 'N';

const unlocated = (layers: ItemLayers) =>
  roundQty(layers.warehouse - sumBy(layers.zones, (zone) => Number(zone.stock)));

const unbatched = (layers: ItemLayers) =>
  roundQty(layers.warehouse - sumBy(layers.batches, (batch) => Number(batch.quantity)));

/** Lo que dice el sistema de esa capa ahora mismo. */
export function lineStock(layers: ItemLayers, line: LineKey): number {
  if (line.batchNum) {
    return Number(layers.batches.find((b) => b.batchNum === line.batchNum)?.quantity ?? 0);
  }
  if (line.zoneId) {
    return Number(layers.zones.find((z) => z.zoneId === line.zoneId)?.stock ?? 0);
  }
  return isTracked(layers) ? unbatched(layers) : unlocated(layers);
}

/** Las líneas de un recuento que empieza: lo que hay, tal como se puede contar. */
export function buildCountLines(all: ItemLayers[], scopeZoneId: string | null): ExpectedLine[] {
  const lines: ExpectedLine[] = [];
  const push = (layers: ItemLayers, key: LineKey) => {
    const expectedQty = lineStock(layers, key);
    if (!isZero(expectedQty)) lines.push({ itemId: layers.itemId, ...key, expectedQty });
  };
  for (const layers of all) {
    if (scopeZoneId) {
      push(layers, { zoneId: scopeZoneId, batchNum: null });
    } else if (isTracked(layers)) {
      for (const { batchNum } of layers.batches) push(layers, { zoneId: null, batchNum });
      push(layers, { zoneId: null, batchNum: null });
    } else {
      for (const { zoneId } of layers.zones) push(layers, { zoneId, batchNum: null });
      push(layers, { zoneId: null, batchNum: null });
    }
  }
  return lines;
}

/** Contado frente a lo que había al contar. Lo que se mueva después no cambia esta cuenta. */
export function lineDifference(line: {
  countedQty: number | null;
  systemAtCount: number | null;
}): number {
  if (line.countedQty === null || line.countedQty === undefined) return 0;
  return roundQty(Number(line.countedQty) - Number(line.systemAtCount ?? 0));
}

/** Si ese número no se puede apuntar en esa línea, por qué. */
export function countedProblem(
  layers: { manageBy: string },
  line: LineKey,
  counted: number,
  system: number,
): string | null {
  if (!Number.isFinite(counted)) return 'La cantidad contada no es un número.';
  if (counted < 0) return 'La cantidad contada no puede ser negativa.';
  if (layers.manageBy === 'S') {
    if (line.batchNum && counted !== 0 && counted !== 1) {
      return 'Una serie está o no está: cuenta 0 o 1.';
    }
    if (!Number.isInteger(counted)) return 'Las series se cuentan enteras.';
  }
  if (isTracked(layers) && !line.batchNum && !line.zoneId && counted > system + 1e-4) {
    return 'Lo que sobre de un artículo con lote tiene que ir en su lote: añade una línea con él.';
  }
  return null;
}

/** La línea sí dice su lote: la zona de la diferencia se decide aquí. */
function spreadOverZones(
  line: LineKey,
  difference: number,
  layers: ItemLayers,
  defaultZoneId?: string | null,
): Allocation[] {
  const byStock = [...layers.zones]
    .filter((zone) => Number(zone.stock) > 0)
    .sort((a, b) => Number(b.stock) - Number(a.stock));

  if (difference > 0) {
    const zoneId = defaultZoneId ?? byStock[0]?.zoneId ?? null;
    return [{ zoneId, batchNum: line.batchNum, quantity: difference }];
  }

  let left = -difference;
  const allocations: Allocation[] = [];
  const take = (zoneId: string | null, available: number) => {
    const taken = Math.min(left, Math.max(0, available));
    if (taken <= 0) return;
    allocations.push({ zoneId, batchNum: line.batchNum, quantity: roundQty(-taken) });
    left = roundQty(left - taken);
  };
  take(null, unlocated(layers));
  for (const zone of byStock) take(zone.zoneId, Number(zone.stock));
  // No llega con lo que hay: lo dirá `negativeAfter`.
  if (left > 0) allocations.push({ zoneId: null, batchNum: line.batchNum, quantity: -left });
  return allocations;
}

/** Contado por zona: la zona se sabe y el lote hay que deducirlo o preguntarlo. */
function pickBatch(
  line: LineKey,
  difference: number,
  layers: ItemLayers,
  saved?: Array<{ batchNum: string | null; quantity: number }> | null,
): { allocations: Allocation[]; needsBatch: boolean } {
  if (saved?.length && !allocationProblem(layers, saved, difference)) {
    return {
      allocations: saved.map((row) => ({
        zoneId: line.zoneId,
        batchNum: row.batchNum,
        quantity: Number(row.quantity),
      })),
      needsBatch: false,
    };
  }
  const inStock = layers.batches.filter((batch) => Number(batch.quantity) > 0);
  const obvious = inStock.length === 1 && !(layers.manageBy === 'S' && difference > 0);
  if (!obvious) return { allocations: [], needsBatch: true };
  return {
    allocations: [{ zoneId: line.zoneId, batchNum: inStock[0].batchNum, quantity: difference }],
    needsBatch: false,
  };
}

/** A qué capas va la diferencia de una línea. */
export function allocateDifference(input: {
  line: LineKey;
  difference: number;
  layers: ItemLayers;
  defaultZoneId?: string | null;
  saved?: Array<{ batchNum: string | null; quantity: number }> | null;
}): { allocations: Allocation[]; needsBatch: boolean } {
  const { line, difference, layers, defaultZoneId, saved } = input;
  if (isZero(difference)) return { allocations: [], needsBatch: false };
  if (!isTracked(layers)) {
    return {
      allocations: [{ zoneId: line.zoneId, batchNum: null, quantity: difference }],
      needsBatch: false,
    };
  }
  if (line.zoneId) return pickBatch(line, difference, layers, saved);
  return {
    allocations: spreadOverZones(line, difference, layers, defaultZoneId),
    needsBatch: false,
  };
}

/** Si lo que alguien dice de los lotes de una diferencia no vale, por qué. */
export function allocationProblem(
  layers: { manageBy: string },
  rows: Array<{ batchNum: string | null; quantity: number }>,
  difference: number,
): string | null {
  if (rows.length === 0) return 'Di de qué lote es la diferencia.';
  for (const row of rows) {
    if (!row.batchNum?.trim()) return 'Falta el lote en una de las filas.';
    const quantity = Number(row.quantity);
    if (
      !Number.isFinite(quantity) ||
      quantity === 0 ||
      Math.sign(quantity) !== Math.sign(difference)
    ) {
      return 'Cada fila tiene que ir en el mismo sentido que la diferencia.';
    }
    if (layers.manageBy === 'S' && Math.abs(quantity) !== 1) {
      return 'Las series van de una en una.';
    }
  }
  const total = roundQty(sumBy(rows, (row) => Number(row.quantity)));
  if (!isZero(total - difference)) return 'Los lotes tienen que sumar la diferencia.';
  return null;
}

export interface NegativeLayer {
  layer: 'warehouse' | 'zone' | 'batch';
  zoneId?: string;
  batchNum?: string;
  after: number;
}

/** Las capas que quedarían en negativo. Un negativo que ya había y mejora no cuenta. */
export function negativeAfter(layers: ItemLayers, allocations: Allocation[]): NegativeLayer[] {
  const problems: NegativeLayer[] = [];
  const check = (before: number, delta: number, where: Omit<NegativeLayer, 'after'>) => {
    const after = roundQty(before + delta);
    if (after < 0 && delta < 0) problems.push({ ...where, after });
  };

  check(
    layers.warehouse,
    sumBy(allocations, (row) => row.quantity),
    { layer: 'warehouse' },
  );
  for (const zoneId of new Set(allocations.map((row) => row.zoneId))) {
    if (!zoneId) continue;
    const delta = sumBy(
      allocations.filter((row) => row.zoneId === zoneId),
      (row) => row.quantity,
    );
    const before = layers.zones.find((zone) => zone.zoneId === zoneId)?.stock ?? 0;
    check(Number(before), delta, { layer: 'zone', zoneId });
  }
  for (const batchNum of new Set(allocations.map((row) => row.batchNum))) {
    if (!batchNum) continue;
    const delta = sumBy(
      allocations.filter((row) => row.batchNum === batchNum),
      (row) => row.quantity,
    );
    const before = layers.batches.find((batch) => batch.batchNum === batchNum)?.quantity ?? 0;
    check(Number(before), delta, { layer: 'batch', batchNum });
  }
  return problems;
}
