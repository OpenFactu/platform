/**
 * Recuento de inventario: abrir, contar, revisar y cerrar.
 *
 * No se bloquea el almacén. Al contar una línea se guarda lo que decía el sistema en ese momento
 * (`systemAtCount`), y al cerrar solo se aplica la diferencia contra eso: lo que se mueva antes de
 * contar ya va en esa cifra, y lo que se mueva después sigue su camino sin corregirse dos veces.
 *
 * Al cerrar salen una entrada y una salida de ajuste por `StockPoster`, así que el stock y el
 * coste se mueven igual que en cualquier otro movimiento de almacén.
 */
import crypto from 'crypto';
import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { statusError } from '../documents/documentRules';
import { nextLogisticsCode } from '../logistics/logisticsCodes';
import { postIssue, postReceipt } from '../stock/StockPoster';
import {
  allocateDifference,
  allocationProblem,
  buildCountLines,
  countedProblem,
  lineDifference,
  lineStock,
  negativeAfter,
  roundQty,
  type Allocation,
  type ItemLayers,
  type NegativeLayer,
} from './countRules';

const SOURCE = 'InventoryCount';

export interface CountActor {
  userId?: string;
}

/** Qué puede ver quien pregunta. */
export interface CountViewer {
  canReview: boolean;
  canSeeCost: boolean;
}

export interface CountProblem {
  lineId: string;
  code: 'NEEDS_BATCH' | 'NEGATIVE';
  message: string;
}

interface ItemInfo extends ItemLayers {
  code: string;
  name: string;
  uomCode: string | null;
  averageCost: number;
  defaultZoneId: string | null;
}

const isTracked = (item: { manageBy: string }) => item.manageBy !== 'N';

/** Lo esperado solo se ve fuera de un recuento a ciegas, o en su revisión para quien revisa. */
const revealsSystem = (count: any, viewer: CountViewer) =>
  !count.blind || (count.status !== 'open' && viewer.canReview);

/** El stock de esos artículos en ese almacén, capa por capa. Sin lista, todo lo que tenga algo. */
async function loadLayers(
  db: any,
  warehouseId: string,
  itemIds?: string[],
): Promise<Map<string, ItemInfo>> {
  const onlyThese = (column: any) => (itemIds ? inArray(column, itemIds) : undefined);
  const [warehouseRows, zoneRows, batchRows] = await Promise.all([
    db
      .select()
      .from(schema.itemWarehouseStocks)
      .where(
        and(
          eq(schema.itemWarehouseStocks.warehouseId, warehouseId),
          onlyThese(schema.itemWarehouseStocks.itemId),
        ),
      ),
    db
      .select()
      .from(schema.itemZoneStocks)
      .where(
        and(
          eq(schema.itemZoneStocks.warehouseId, warehouseId),
          onlyThese(schema.itemZoneStocks.itemId),
        ),
      ),
    db
      .select()
      .from(schema.itemBatchStocks)
      .where(
        and(
          eq(schema.itemBatchStocks.warehouseId, warehouseId),
          onlyThese(schema.itemBatchStocks.itemId),
        ),
      ),
  ]);
  const ids = itemIds ?? [
    ...new Set([...warehouseRows, ...zoneRows, ...batchRows].map((row: any) => row.itemId)),
  ];
  const result = new Map<string, ItemInfo>();
  if (ids.length === 0) return result;

  const items = await db
    .select({
      id: schema.items.id,
      code: schema.items.code,
      name: schema.items.name,
      manageBy: schema.items.manageBy,
      averageCost: schema.items.averageCost,
      defaultZoneId: schema.items.defaultZoneId,
      uomCode: schema.unitsOfMeasure.code,
    })
    .from(schema.items)
    .leftJoin(schema.unitsOfMeasure, eq(schema.items.uomId, schema.unitsOfMeasure.id))
    .where(inArray(schema.items.id, ids))
    .orderBy(asc(schema.items.code));
  const zonesHere = await db
    .select({ id: schema.warehouseZones.id })
    .from(schema.warehouseZones)
    .where(eq(schema.warehouseZones.warehouseId, warehouseId));
  const zoneIds = new Set(zonesHere.map((zone: any) => zone.id));

  for (const item of items) {
    result.set(item.id, {
      itemId: item.id,
      code: item.code,
      name: item.name,
      uomCode: item.uomCode,
      manageBy: item.manageBy,
      averageCost: Number(item.averageCost ?? 0),
      defaultZoneId: zoneIds.has(item.defaultZoneId) ? item.defaultZoneId : null,
      warehouse: Number(warehouseRows.find((row: any) => row.itemId === item.id)?.stock ?? 0),
      zones: zoneRows
        .filter((row: any) => row.itemId === item.id)
        .map((row: any) => ({ zoneId: row.zoneId, stock: Number(row.stock) })),
      batches: batchRows
        .filter((row: any) => row.itemId === item.id)
        .map((row: any) => ({ batchNum: row.batchNum, quantity: Number(row.quantity) })),
    });
  }
  return result;
}

/** Una categoría y todas las que cuelgan de ella. */
async function categoryWithChildren(db: any, categoryId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: schema.categories.id, parentId: schema.categories.parentId })
    .from(schema.categories);
  const found = new Set<string>([categoryId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const row of rows) {
      if (row.parentId && found.has(row.parentId) && !found.has(row.id)) {
        found.add(row.id);
        grew = true;
      }
    }
  }
  return found;
}

const intersects = (a: Set<string>, b: Set<string>) => [...a].some((id) => b.has(id));

/** Si dos recuentos pueden contar lo mismo: los dos corregirían la misma diferencia. */
async function overlaps(db: any, a: any, b: any): Promise<boolean> {
  if (a.zoneId && b.zoneId && a.zoneId !== b.zoneId) return false;
  if (!a.categoryId || !b.categoryId) return true;
  return intersects(
    await categoryWithChildren(db, a.categoryId),
    await categoryWithChildren(db, b.categoryId),
  );
}

export async function openCount(
  db: any,
  input: {
    warehouseId?: string;
    zoneId?: string | null;
    categoryId?: string | null;
    blind?: boolean;
    notes?: string | null;
  },
  actor: CountActor,
): Promise<{ id: string; code: string; lines: number }> {
  const warehouseId = input.warehouseId;
  const zoneId = input.zoneId || null;
  const categoryId = input.categoryId || null;
  if (!warehouseId) throw statusError(400, 'Elige un almacén.');

  return db.transaction(async (tx: any) => {
    // Con el almacén bloqueado, dos altas a la vez no se cuelan las dos.
    const [warehouse] = await tx
      .select({ id: schema.warehouses.id })
      .from(schema.warehouses)
      .where(eq(schema.warehouses.id, warehouseId))
      .for('update');
    if (!warehouse) throw statusError(404, 'Ese almacén no existe.');

    if (zoneId) {
      const [zone] = await tx
        .select({ warehouseId: schema.warehouseZones.warehouseId })
        .from(schema.warehouseZones)
        .where(eq(schema.warehouseZones.id, zoneId));
      if (zone?.warehouseId !== warehouseId) {
        throw statusError(400, 'Esa zona no es de este almacén.');
      }
    }
    let categories: Set<string> | null = null;
    if (categoryId) {
      const [category] = await tx
        .select({ id: schema.categories.id })
        .from(schema.categories)
        .where(eq(schema.categories.id, categoryId));
      if (!category) throw statusError(400, 'Esa categoría no existe.');
      categories = await categoryWithChildren(tx, categoryId);
    }

    const active = await tx
      .select()
      .from(schema.inventoryCounts)
      .where(
        and(
          eq(schema.inventoryCounts.warehouseId, warehouseId),
          inArray(schema.inventoryCounts.status, ['open', 'review']),
        ),
      );
    for (const other of active) {
      if (await overlaps(tx, { zoneId, categoryId }, other)) {
        throw statusError(
          409,
          `El recuento ${other.code} ya está contando esto: ciérralo o cancélalo antes.`,
        );
      }
    }

    const layers = await loadLayers(tx, warehouseId);
    if (categories) {
      const inCategory = await tx
        .select({ id: schema.items.id, categoryId: schema.items.categoryId })
        .from(schema.items);
      for (const row of inCategory) {
        if (!categories.has(row.categoryId)) layers.delete(row.id);
      }
    }

    const id = crypto.randomUUID();
    const code = await nextLogisticsCode(tx, 'REC');
    await tx.insert(schema.inventoryCounts).values({
      id,
      code,
      warehouseId,
      zoneId,
      categoryId,
      blind: !!input.blind,
      notes: input.notes?.trim() || null,
      createdBy: actor.userId ?? null,
    });
    const lines = buildCountLines([...layers.values()], zoneId);
    if (lines.length > 0) {
      await tx.insert(schema.inventoryCountLines).values(
        lines.map((line) => ({
          id: crypto.randomUUID(),
          countId: id,
          itemId: line.itemId,
          zoneId: line.zoneId,
          batchNum: line.batchNum,
          expectedQty: line.expectedQty,
        })),
      );
    }
    return { id, code, lines: lines.length };
  });
}

export async function listCounts(db: any) {
  const counts = schema.inventoryCounts;
  return db
    .select({
      id: counts.id,
      code: counts.code,
      status: counts.status,
      blind: counts.blind,
      notes: counts.notes,
      createdAt: counts.createdAt,
      closedAt: counts.closedAt,
      warehouseId: counts.warehouseId,
      warehouseName: schema.warehouses.name,
      zoneName: schema.warehouseZones.name,
      categoryName: schema.categories.name,
      totalLines: sql<number>`(SELECT COUNT(*)::int FROM "InventoryCountLine" l WHERE l."countId" = ${counts.id})`,
      countedLines: sql<number>`(SELECT COUNT(*)::int FROM "InventoryCountLine" l WHERE l."countId" = ${counts.id} AND l."countedQty" IS NOT NULL)`,
    })
    .from(counts)
    .leftJoin(schema.warehouses, eq(counts.warehouseId, schema.warehouses.id))
    .leftJoin(schema.warehouseZones, eq(counts.zoneId, schema.warehouseZones.id))
    .leftJoin(schema.categories, eq(counts.categoryId, schema.categories.id))
    .orderBy(desc(counts.createdAt))
    .limit(200);
}

/** Lo que hace falta para abrir uno, sin pedir los permisos de almacenes ni de categorías. */
export async function countOptions(db: any) {
  const [warehouses, zones, categories] = await Promise.all([
    db
      .select({ id: schema.warehouses.id, name: schema.warehouses.name })
      .from(schema.warehouses)
      .orderBy(asc(schema.warehouses.name)),
    db
      .select({
        id: schema.warehouseZones.id,
        name: schema.warehouseZones.name,
        warehouseId: schema.warehouseZones.warehouseId,
      })
      .from(schema.warehouseZones)
      .orderBy(asc(schema.warehouseZones.name)),
    db
      .select({ id: schema.categories.id, name: schema.categories.name })
      .from(schema.categories)
      .orderBy(asc(schema.categories.name)),
  ]);
  return { warehouses, zones, categories };
}

async function loadCount(db: any, id: string) {
  const [count] = await db
    .select()
    .from(schema.inventoryCounts)
    .where(eq(schema.inventoryCounts.id, id));
  if (!count) throw statusError(404, 'Recuento no encontrado');
  return count;
}

/** Cómo se enseña una línea a quien pregunta. */
function viewLine(
  line: any,
  item: ItemInfo,
  count: any,
  viewer: CountViewer,
  zoneNames: Map<string, string>,
) {
  const base = {
    id: line.id,
    countId: line.countId,
    itemId: line.itemId,
    itemCode: item.code,
    itemName: item.name,
    uomCode: item.uomCode,
    manageBy: item.manageBy,
    zoneId: line.zoneId,
    zoneName: line.zoneId ? (zoneNames.get(line.zoneId) ?? null) : null,
    batchNum: line.batchNum,
    countedQty: line.countedQty,
    countedAt: line.countedAt,
    addedDuringCount: line.addedDuringCount,
  };
  if (!revealsSystem(count, viewer)) return base;

  const counted = line.countedQty !== null;
  const closed = count.status === 'closed' || count.status === 'cancelled';
  const difference = closed ? Number(line.appliedQty ?? 0) : lineDifference(line);
  const unitCost = closed && line.unitCost !== null ? Number(line.unitCost) : item.averageCost;
  const view: Record<string, unknown> = {
    ...base,
    expectedQty: line.expectedQty,
    systemAtCount: line.systemAtCount,
    difference,
    appliedQty: line.appliedQty,
    movedBeforeCount: counted ? roundQty(Number(line.systemAtCount) - line.expectedQty) : null,
    averageCost: unitCost,
    ...(viewer.canSeeCost ? { differenceValue: roundQty(difference * unitCost) } : {}),
  };
  if (closed) return { ...view, allocations: line.allocations ?? [] };

  const stockNow = lineStock(item, line);
  const { allocations, needsBatch } = allocateDifference({
    line,
    difference,
    layers: item,
    defaultZoneId: item.defaultZoneId,
    saved: line.allocations,
  });
  return {
    ...view,
    stockNow,
    movedAfterCount: counted ? roundQty(stockNow - Number(line.systemAtCount)) : null,
    finalStock: roundQty(stockNow + difference),
    allocations,
    needsBatch,
    ...(needsBatch || (isTracked(item) && line.zoneId)
      ? { batchOptions: item.batches.filter((batch) => batch.quantity > 0) }
      : {}),
  };
}

async function zoneNamesOf(db: any, warehouseId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: schema.warehouseZones.id, name: schema.warehouseZones.name })
    .from(schema.warehouseZones)
    .where(eq(schema.warehouseZones.warehouseId, warehouseId));
  return new Map(rows.map((row: any) => [row.id, row.name]));
}

export async function countDetail(db: any, id: string, viewer: CountViewer) {
  const count = await loadCount(db, id);
  const rows = await db
    .select()
    .from(schema.inventoryCountLines)
    .where(eq(schema.inventoryCountLines.countId, id));
  const itemIds = [...new Set<string>(rows.map((row: any) => row.itemId))];
  const layers = await loadLayers(db, count.warehouseId, itemIds);
  const zoneNames = await zoneNamesOf(db, count.warehouseId);
  const lines = rows
    .map((row: any) => viewLine(row, layers.get(row.itemId)!, count, viewer, zoneNames))
    .sort(
      (a: any, b: any) =>
        a.itemCode.localeCompare(b.itemCode) ||
        String(a.zoneName ?? '').localeCompare(String(b.zoneName ?? '')) ||
        String(a.batchNum ?? '').localeCompare(String(b.batchNum ?? '')),
    );
  const [warehouse] = await db
    .select({ name: schema.warehouses.name })
    .from(schema.warehouses)
    .where(eq(schema.warehouses.id, count.warehouseId));
  const [zone] = count.zoneId
    ? await db
        .select({ name: schema.warehouseZones.name })
        .from(schema.warehouseZones)
        .where(eq(schema.warehouseZones.id, count.zoneId))
    : [null];
  const [category] = count.categoryId
    ? await db
        .select({ name: schema.categories.name })
        .from(schema.categories)
        .where(eq(schema.categories.id, count.categoryId))
    : [null];

  const [receipt] = count.receiptId
    ? await db
        .select({ code: schema.goodsReceipts.code })
        .from(schema.goodsReceipts)
        .where(eq(schema.goodsReceipts.id, count.receiptId))
    : [null];
  const [issue] = count.issueId
    ? await db
        .select({ code: schema.goodsIssues.code })
        .from(schema.goodsIssues)
        .where(eq(schema.goodsIssues.id, count.issueId))
    : [null];

  const counted = rows.filter((row: any) => row.countedQty !== null).length;
  const revealed = revealsSystem(count, viewer);
  return {
    ...count,
    warehouseName: warehouse?.name ?? null,
    zoneName: zone?.name ?? null,
    categoryName: category?.name ?? null,
    receiptCode: receipt?.code ?? null,
    issueCode: issue?.code ?? null,
    revealed,
    lines,
    summary: {
      total: rows.length,
      counted,
      pending: rows.length - counted,
      ...(revealed
        ? {
            withDifference: lines.filter((line: any) => line.difference).length,
            needsBatch: lines.filter((line: any) => line.needsBatch).length,
          }
        : {}),
    },
  };
}

/** El recuento, bloqueado para que nadie lo cierre mientras se apunta. */
async function lockCounting(tx: any, id: string) {
  const [count] = await tx
    .select()
    .from(schema.inventoryCounts)
    .where(eq(schema.inventoryCounts.id, id))
    .for('share');
  if (!count) throw statusError(404, 'Recuento no encontrado');
  if (count.status !== 'open') throw statusError(409, 'Este recuento ya no está abierto.');
  return count;
}

async function lockLine(tx: any, countId: string, lineId: string) {
  const [line] = await tx
    .select()
    .from(schema.inventoryCountLines)
    .where(
      and(
        eq(schema.inventoryCountLines.id, lineId),
        eq(schema.inventoryCountLines.countId, countId),
      ),
    )
    .for('update');
  if (!line) throw statusError(404, 'Línea no encontrada');
  return line;
}

/** Apunta lo contado junto con lo que dice el sistema en este momento. */
async function writeCount(
  tx: any,
  count: any,
  line: any,
  counted: number,
  item: ItemInfo,
  actor: CountActor,
) {
  const system = lineStock(item, line);
  const problem = countedProblem(item, line, counted, system);
  if (problem) throw statusError(400, problem);
  const [saved] = await tx
    .update(schema.inventoryCountLines)
    .set({
      countedQty: counted,
      systemAtCount: system,
      countedAt: new Date(),
      countedBy: actor.userId ?? null,
    })
    .where(eq(schema.inventoryCountLines.id, line.id))
    .returning();
  return saved;
}

async function itemOf(tx: any, count: any, itemId: string): Promise<ItemInfo> {
  const layers = await loadLayers(tx, count.warehouseId, [itemId]);
  const item = layers.get(itemId);
  if (!item) throw statusError(404, 'Ese artículo no existe.');
  return item;
}

async function viewOne(tx: any, count: any, line: any, item: ItemInfo, viewer: CountViewer) {
  return viewLine(line, item, count, viewer, await zoneNamesOf(tx, count.warehouseId));
}

export async function setLineCount(
  db: any,
  id: string,
  lineId: string,
  countedQty: unknown,
  actor: CountActor,
  viewer: CountViewer,
) {
  return db.transaction(async (tx: any) => {
    const count = await lockCounting(tx, id);
    const line = await lockLine(tx, id, lineId);
    const item = await itemOf(tx, count, line.itemId);
    if (countedQty === null) {
      const [cleared] = await tx
        .update(schema.inventoryCountLines)
        .set({ countedQty: null, systemAtCount: null, countedAt: null, countedBy: null })
        .where(eq(schema.inventoryCountLines.id, lineId))
        .returning();
      return viewOne(tx, count, cleared, item, viewer);
    }
    const saved = await writeCount(tx, count, line, Number(countedQty), item, actor);
    return viewOne(tx, count, saved, item, viewer);
  });
}

async function assertInScope(tx: any, count: any, itemId: string) {
  if (!count.categoryId) return;
  const [row] = await tx
    .select({ categoryId: schema.items.categoryId })
    .from(schema.items)
    .where(eq(schema.items.id, itemId));
  const allowed = await categoryWithChildren(tx, count.categoryId);
  if (!allowed.has(row?.categoryId)) {
    throw statusError(400, 'Ese artículo no entra en este recuento.');
  }
}

/** Una línea nueva, o la que ya hubiera con esa misma identidad. */
async function ensureLine(
  tx: any,
  count: any,
  item: ItemInfo,
  key: { zoneId: string | null; batchNum: string | null },
) {
  const lines = schema.inventoryCountLines;
  const find = async () => {
    const rows = await tx
      .select()
      .from(lines)
      .where(and(eq(lines.countId, count.id), eq(lines.itemId, item.itemId)))
      .for('update');
    return rows.find(
      (row: any) => (row.zoneId ?? null) === key.zoneId && (row.batchNum ?? null) === key.batchNum,
    );
  };
  const existing = await find();
  if (existing) return existing;
  await tx
    .insert(lines)
    .values({
      id: crypto.randomUUID(),
      countId: count.id,
      itemId: item.itemId,
      zoneId: key.zoneId,
      batchNum: key.batchNum,
      expectedQty: lineStock(item, key),
      addedDuringCount: true,
    })
    .onConflictDoNothing();
  return find();
}

/** Qué identidad lleva una línea añadida a mano o por el lector. */
function keyFor(
  count: any,
  item: ItemInfo,
  input: { zoneId?: string | null; batchNum?: string | null },
) {
  if (count.zoneId) return { zoneId: count.zoneId as string, batchNum: null };
  if (!isTracked(item)) {
    return { zoneId: input.zoneId || item.defaultZoneId || null, batchNum: null };
  }
  const batchNum = input.batchNum?.trim();
  if (!batchNum) throw statusError(400, 'Indica el lote o la serie.');
  return { zoneId: null, batchNum };
}

export async function addLine(
  db: any,
  id: string,
  input: {
    itemId?: string;
    zoneId?: string | null;
    batchNum?: string | null;
    countedQty?: unknown;
  },
  actor: CountActor,
  viewer: CountViewer,
) {
  if (!input.itemId) throw statusError(400, 'Elige un artículo.');
  const itemId = input.itemId;
  return db.transaction(async (tx: any) => {
    const count = await lockCounting(tx, id);
    const [exists] = await tx
      .select({ id: schema.items.id })
      .from(schema.items)
      .where(eq(schema.items.id, itemId));
    if (!exists) throw statusError(404, 'Ese artículo no existe.');
    await assertInScope(tx, count, itemId);

    const item = await itemOf(tx, count, itemId);
    const key = keyFor(count, item, input);
    if (input.zoneId && !count.zoneId) {
      const names = await zoneNamesOf(tx, count.warehouseId);
      if (!names.has(input.zoneId)) throw statusError(400, 'Esa zona no es de este almacén.');
    }
    if (item.manageBy === 'S' && key.batchNum)
      await assertSerialIsHere(tx, count, item, key.batchNum);

    let line = await ensureLine(tx, count, item, key);
    if (input.countedQty !== undefined && input.countedQty !== null) {
      line = await writeCount(tx, count, line, Number(input.countedQty), item, actor);
    }
    return viewOne(tx, count, line, item, viewer);
  });
}

/** Una serie es una sola cosa: si está en otro almacén, aquí no puede aparecer sin traspaso. */
async function assertSerialIsHere(tx: any, count: any, item: ItemInfo, serial: string) {
  const [elsewhere] = await tx
    .select({ warehouseId: schema.itemBatchStocks.warehouseId })
    .from(schema.itemBatchStocks)
    .where(
      and(
        eq(schema.itemBatchStocks.itemId, item.itemId),
        eq(schema.itemBatchStocks.batchNum, serial),
        ne(schema.itemBatchStocks.warehouseId, count.warehouseId),
        sql`${schema.itemBatchStocks.quantity} > 0`,
      ),
    )
    .limit(1);
  if (elsewhere) {
    throw statusError(409, `La serie ${serial} está en otro almacén: haz un traspaso.`);
  }
}

export type ScanResult =
  | { outcome: 'counted'; line: any }
  | { outcome: 'choose'; lines: any[] }
  | { outcome: 'needs_batch'; item: { id: string; code: string; name: string; manageBy: string } };

/** Una lectura del lector o de la cámara: un lote o serie de la lista, o un artículo. */
export async function scanCode(
  db: any,
  id: string,
  input: { code?: string; quantity?: unknown },
  actor: CountActor,
  viewer: CountViewer,
): Promise<ScanResult> {
  const code = input.code?.trim();
  if (!code) throw statusError(400, 'No se ha leído ningún código.');
  const step = input.quantity === undefined ? 1 : Number(input.quantity);
  if (!Number.isFinite(step) || step <= 0) throw statusError(400, 'La cantidad no es válida.');

  return db.transaction(async (tx: any) => {
    const count = await lockCounting(tx, id);
    const lines = schema.inventoryCountLines;

    const add = async (line: any, item: ItemInfo): Promise<ScanResult> => {
      // Con la fila bloqueada: dos lecturas a la vez cuentan dos.
      const locked = await lockLine(tx, id, line.id);
      const isSerial = item.manageBy === 'S' && !!locked.batchNum;
      const counted = isSerial ? 1 : Number(locked.countedQty ?? 0) + step;
      const saved = await writeCount(tx, count, locked, counted, item, actor);
      return { outcome: 'counted', line: await viewOne(tx, count, saved, item, viewer) };
    };

    const byBatch = await tx
      .select()
      .from(lines)
      .where(and(eq(lines.countId, id), eq(lines.batchNum, code)));
    if (byBatch.length === 1) {
      return add(byBatch[0], await itemOf(tx, count, byBatch[0].itemId));
    }

    const [found] = await tx
      .select({ id: schema.items.id })
      .from(schema.items)
      .where(or(eq(schema.items.code, code), eq(schema.items.barcode, code)))
      .limit(1);
    if (!found) throw statusError(404, 'Ese código no se reconoce.');
    await assertInScope(tx, count, found.id);

    const item = await itemOf(tx, count, found.id);
    const needsBatch = (): ScanResult => ({
      outcome: 'needs_batch',
      item: { id: item.itemId, code: item.code, name: item.name, manageBy: item.manageBy },
    });
    // El código del artículo no dice qué serie es.
    if (item.manageBy === 'S' && !count.zoneId) return needsBatch();

    const own = await tx
      .select()
      .from(lines)
      .where(and(eq(lines.countId, id), eq(lines.itemId, item.itemId)));
    if (own.length === 1) return add(own[0], item);
    if (own.length > 1) {
      const zoneNames = await zoneNamesOf(tx, count.warehouseId);
      return {
        outcome: 'choose',
        lines: own.map((line: any) => viewLine(line, item, count, viewer, zoneNames)),
      };
    }
    if (isTracked(item) && !count.zoneId) return needsBatch();
    return add(await ensureLine(tx, count, item, keyFor(count, item, {})), item);
  });
}

async function moveStatus(
  db: any,
  id: string,
  from: string[],
  to: string,
  wrong: string,
  extra = {},
) {
  return db.transaction(async (tx: any) => {
    const [count] = await tx
      .select()
      .from(schema.inventoryCounts)
      .where(eq(schema.inventoryCounts.id, id))
      .for('update');
    if (!count) throw statusError(404, 'Recuento no encontrado');
    if (!from.includes(count.status)) throw statusError(409, wrong);
    await tx
      .update(schema.inventoryCounts)
      .set({ status: to, updatedAt: new Date(), ...extra })
      .where(eq(schema.inventoryCounts.id, id));
    return { id, status: to };
  });
}

/** Ya se ha contado: quien revisa puede ver las diferencias. */
export const finishCount = (db: any, id: string) =>
  moveStatus(db, id, ['open'], 'review', 'Este recuento ya no está abierto.');

/** Vuelve a contar: lo apuntado se queda. */
export const reopenCount = (db: any, id: string) =>
  moveStatus(db, id, ['review'], 'open', 'Este recuento no está en revisión.');

export const cancelCount = (db: any, id: string, actor: CountActor) =>
  moveStatus(db, id, ['open', 'review'], 'cancelled', 'Este recuento ya está terminado.', {
    cancelledAt: new Date(),
    cancelledBy: actor.userId ?? null,
  });

/** Dice de qué lotes es la diferencia de una línea contada por zona. */
export async function setLineAllocations(
  db: any,
  id: string,
  lineId: string,
  rows: unknown,
  viewer: CountViewer,
) {
  return db.transaction(async (tx: any) => {
    const [count] = await tx
      .select()
      .from(schema.inventoryCounts)
      .where(eq(schema.inventoryCounts.id, id))
      .for('share');
    if (!count) throw statusError(404, 'Recuento no encontrado');
    if (count.status !== 'review') throw statusError(409, 'Este recuento no está en revisión.');

    const line = await lockLine(tx, id, lineId);
    const item = await itemOf(tx, count, line.itemId);
    if (!isTracked(item) || !line.zoneId) {
      throw statusError(400, 'Esta línea ya sabe a dónde va su diferencia.');
    }

    const allocations = (Array.isArray(rows) ? rows : []).map((row: any) => ({
      zoneId: line.zoneId,
      batchNum: String(row?.batchNum ?? '').trim() || null,
      quantity: Number(row?.quantity),
    }));
    const problem = allocationProblem(item, allocations, lineDifference(line));
    if (problem) throw statusError(400, problem);
    if (item.manageBy === 'S') {
      for (const row of allocations) {
        if (row.quantity > 0) await assertSerialIsHere(tx, count, item, row.batchNum!);
      }
    }

    const [saved] = await tx
      .update(schema.inventoryCountLines)
      .set({ allocations })
      .where(eq(schema.inventoryCountLines.id, lineId))
      .returning();
    return viewOne(tx, count, saved, item, viewer);
  });
}

async function createAdjustment(
  tx: any,
  kind: 'receipt' | 'issue',
  count: any,
  rows: Array<Allocation & { itemId: string; unitCost: number }>,
  actor: CountActor,
): Promise<string | null> {
  if (rows.length === 0) return null;
  const id = crypto.randomUUID();
  const header = {
    id,
    warehouseId: count.warehouseId,
    date: new Date(),
    type: 'adjustment',
    status: 'draft',
    sourceDocType: SOURCE,
    sourceDocId: count.id,
    notes: count.code,
    createdByUserId: actor.userId ?? null,
  };
  const lineOf = (row: Allocation & { itemId: string }, index: number) => ({
    id: crypto.randomUUID(),
    lineNum: index + 1,
    itemId: row.itemId,
    quantity: Math.abs(row.quantity),
    zoneId: row.zoneId,
    batchNum: row.batchNum,
  });

  if (kind === 'receipt') {
    await tx
      .insert(schema.goodsReceipts)
      .values({ ...header, code: await nextLogisticsCode(tx, 'ENT') });
    await tx.insert(schema.goodsReceiptLines).values(
      rows.map((row, index) => ({
        ...lineOf(row, index),
        receiptId: id,
        // Sin coste conocido entra a la que haya, sin inventarse ninguno.
        unitCost: row.unitCost > 0 ? String(row.unitCost) : null,
      })),
    );
    await postReceipt(tx, id);
    await tx
      .update(schema.goodsReceipts)
      .set({ status: 'posted', postedAt: new Date() })
      .where(eq(schema.goodsReceipts.id, id));
    return id;
  }

  await tx
    .insert(schema.goodsIssues)
    .values({ ...header, code: await nextLogisticsCode(tx, 'SAL') });
  await tx
    .insert(schema.goodsIssueLines)
    .values(rows.map((row, index) => ({ ...lineOf(row, index), issueId: id })));
  await postIssue(tx, id);
  await tx
    .update(schema.goodsIssues)
    .set({ status: 'posted', postedAt: new Date() })
    .where(eq(schema.goodsIssues.id, id));
  return id;
}

function negativeMessage(item: ItemInfo, problem: NegativeLayer, zoneNames: Map<string, string>) {
  if (problem.layer === 'batch') {
    return `${item.code}: el lote ${problem.batchNum} quedaría en negativo (${problem.after}). Vuelve a contarlo.`;
  }
  if (problem.layer === 'zone') {
    const zone = zoneNames.get(problem.zoneId!) ?? problem.zoneId;
    return `${item.code}: la zona ${zone} quedaría en negativo (${problem.after}). Vuelve a contarlo.`;
  }
  return `${item.code}: el almacén quedaría en negativo (${problem.after}). Vuelve a contarlo.`;
}

/** Aplica las diferencias. Todo o nada, y si algo no se puede, dice qué líneas. */
export async function closeCount(
  db: any,
  id: string,
  actor: CountActor,
): Promise<{
  id: string;
  status: string;
  adjusted: number;
  receiptId: string | null;
  issueId: string | null;
}> {
  return db.transaction(async (tx: any) => {
    const [count] = await tx
      .select()
      .from(schema.inventoryCounts)
      .where(eq(schema.inventoryCounts.id, id))
      .for('update');
    if (!count) throw statusError(404, 'Recuento no encontrado');
    if (count.status !== 'review') throw statusError(409, 'Este recuento no está en revisión.');

    const rows = await tx
      .select()
      .from(schema.inventoryCountLines)
      .where(eq(schema.inventoryCountLines.countId, id));
    const counted = rows.filter((row: any) => row.countedQty !== null);
    const itemIds = [...new Set<string>(counted.map((row: any) => row.itemId))].sort();
    if (itemIds.length > 0) {
      await tx
        .select({ id: schema.items.id })
        .from(schema.items)
        .where(inArray(schema.items.id, itemIds))
        .orderBy(asc(schema.items.id))
        .for('update');
    }
    const layers = await loadLayers(tx, count.warehouseId, itemIds);
    const zoneNames = await zoneNamesOf(tx, count.warehouseId);

    const problems: CountProblem[] = [];
    const planned = new Map<string, { line: any; difference: number; allocations: Allocation[] }>();
    for (const line of counted) {
      const item = layers.get(line.itemId)!;
      const difference = lineDifference(line);
      const { allocations, needsBatch } = allocateDifference({
        line,
        difference,
        layers: item,
        defaultZoneId: item.defaultZoneId,
        saved: line.allocations,
      });
      if (needsBatch) {
        problems.push({
          lineId: line.id,
          code: 'NEEDS_BATCH',
          message: `${item.code}: di de qué lote es la diferencia.`,
        });
      }
      planned.set(line.id, { line, difference, allocations });
    }

    for (const itemId of itemIds) {
      const item = layers.get(itemId)!;
      const own = [...planned.values()].filter((plan) => plan.line.itemId === itemId);
      for (const problem of negativeAfter(
        item,
        own.flatMap((plan) => plan.allocations),
      )) {
        const culprit =
          own.find((plan) =>
            plan.allocations.some(
              (row) =>
                row.quantity < 0 &&
                (problem.layer === 'warehouse' ||
                  (problem.layer === 'zone' && row.zoneId === problem.zoneId) ||
                  (problem.layer === 'batch' && row.batchNum === problem.batchNum)),
            ),
          ) ?? own[0];
        problems.push({
          lineId: culprit.line.id,
          code: 'NEGATIVE',
          message: negativeMessage(item, problem, zoneNames),
        });
      }
    }

    if (problems.length > 0) {
      throw Object.assign(statusError(409, problems[0].message), { problems });
    }

    const moves = [...planned.values()].flatMap((plan) =>
      plan.allocations.map((row) => ({
        ...row,
        itemId: plan.line.itemId,
        unitCost: layers.get(plan.line.itemId)!.averageCost,
      })),
    );
    const receiptId = await createAdjustment(
      tx,
      'receipt',
      count,
      moves.filter((row) => row.quantity > 0),
      actor,
    );
    const issueId = await createAdjustment(
      tx,
      'issue',
      count,
      moves.filter((row) => row.quantity < 0),
      actor,
    );

    let adjusted = 0;
    for (const { line, difference, allocations } of planned.values()) {
      if (difference !== 0) adjusted++;
      await tx
        .update(schema.inventoryCountLines)
        .set({
          appliedQty: difference,
          allocations,
          unitCost: String(layers.get(line.itemId)!.averageCost),
        })
        .where(eq(schema.inventoryCountLines.id, line.id));
    }
    await tx
      .update(schema.inventoryCounts)
      .set({
        status: 'closed',
        receiptId,
        issueId,
        closedAt: new Date(),
        closedBy: actor.userId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.inventoryCounts.id, id));
    return { id, status: 'closed', adjusted, receiptId, issueId };
  });
}

/** Qué se puede añadir: los artículos que entran en este recuento. */
export async function searchItems(db: any, id: string, query: string) {
  const count = await loadCount(db, id);
  const term = query.trim();
  if (!term) return [];
  const pattern = `%${term}%`;
  const rows = await db
    .select({
      id: schema.items.id,
      code: schema.items.code,
      name: schema.items.name,
      manageBy: schema.items.manageBy,
      categoryId: schema.items.categoryId,
    })
    .from(schema.items)
    .where(
      or(
        ilike(schema.items.code, pattern),
        ilike(schema.items.name, pattern),
        ilike(schema.items.barcode, pattern),
      ),
    )
    .orderBy(asc(schema.items.code))
    .limit(30);
  if (!count.categoryId) return rows;
  const allowed = await categoryWithChildren(db, count.categoryId);
  return rows.filter((row: any) => allowed.has(row.categoryId));
}
