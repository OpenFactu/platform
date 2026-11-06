/**
 * Devolver desde el albarán, sin depender de logística: el cliente trae lo que se llevó de un
 * albarán todavía sin facturar, todo o solo una parte.
 *
 * Crea la misma entrada ligada que una devolución de logística, así que cuenta igual para el
 * abono, para facturar y para cancelar. La diferencia es que ya se sabe qué ha vuelto y está en
 * el almacén: entra en el stock en el momento, sin quedarse en borrador esperando al camión.
 */
import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { FLAGS_DEFAULTS } from '../config/appConfig';
import { getConfigSection } from '../config/systemConfigSection';
import { insertReturnReceipt } from '../logistics/returnReceipts';
import { nextLogisticsCode } from '../logistics/logisticsCodes';
import { postReceipt } from '../stock/StockPoster';
import { hydrate } from './documentChain';
import { isFullyReturned, pendingReturnLines, receiptReturnsByLine } from './deliveryReturns';
import { statusError } from './documentRules';
import { warehouseNeedsZone } from './hooks/shared';

/** Margen para comparar cantidades con decimales. */
const EPSILON = 1e-6;

export interface NoteReturnLine {
  lineId: string;
  batchNum?: string | null;
  /** En la unidad de la línea del albarán. */
  quantity: unknown;
}

export interface NoteReturnInput {
  reason?: unknown;
  warehouseId?: string | null;
  zoneId?: string | null;
  lines?: NoteReturnLine[];
}

const factorOf = (line: any) => Number(line.uomFactor || 1);

const noteLinesOf = (db: any, noteId: string) =>
  db
    .select()
    .from(schema.salesDeliveryNoteLines)
    .where(eq(schema.salesDeliveryNoteLines.deliveryId, noteId))
    .orderBy(asc(schema.salesDeliveryNoteLines.lineNum));

type ReturnBlock = 'cancelled' | 'invoiced' | 'shipment';

const BLOCK_MESSAGES: Record<ReturnBlock, string> = {
  cancelled: 'Este albarán está cancelado.',
  invoiced: 'Este albarán ya está facturado: la mercancía vuelve con el abono de su factura.',
  shipment: 'Este albarán tiene un envío en marcha: resuélvelo antes desde logística.',
};

/** Por qué este albarán no admite la devolución; `null` si la admite. */
async function returnProblem(db: any, note: any): Promise<ReturnBlock | null> {
  if (note.status === 'X') return 'cancelled';
  if (note.status === 'C') return 'invoiced';
  // Entregado sí: la mercancía ya la tiene el cliente, y puede traer una parte.
  const [shipment] = await db
    .select({ id: schema.shipments.id })
    .from(schema.shipments)
    .where(
      and(
        eq(schema.shipments.sourceDocType, 'SDN'),
        eq(schema.shipments.sourceDocId, note.id),
        notInArray(schema.shipments.preparationStatus, ['cancelled', 'returned', 'delivered']),
      ),
    );
  return shipment ? 'shipment' : null;
}

/** Lo que hace falta para la pantalla: el albarán, si se puede y lo que puede volver. */
export async function prepareNoteReturn(db: any, noteId: string) {
  const [note] = await db
    .select()
    .from(schema.salesDeliveryNotes)
    .where(eq(schema.salesDeliveryNotes.id, noteId));
  if (!note) throw statusError(404, 'Albarán no encontrado');

  const [[doc], [partner], noteLines, pending, problem] = await Promise.all([
    hydrate(db, 'SDN' as any, [noteId]) as Promise<any[]>,
    db
      .select({ name: schema.businessPartners.name })
      .from(schema.businessPartners)
      .where(eq(schema.businessPartners.id, note.partnerId)),
    noteLinesOf(db, noteId),
    pendingReturnLines(db, noteId),
    returnProblem(db, note),
  ]);
  const itemIds = [...new Set<string>(noteLines.map((line: any) => line.itemId))];
  const items = itemIds.length
    ? await db
        .select({
          id: schema.items.id,
          code: schema.items.code,
          name: schema.items.name,
          manageBy: schema.items.manageBy,
        })
        .from(schema.items)
        .where(inArray(schema.items.id, itemIds))
    : [];

  const uomIds = [...new Set<string>(noteLines.map((line: any) => line.uomId).filter(Boolean))];
  const uoms = uomIds.length
    ? await db
        .select({ id: schema.unitsOfMeasure.id, name: schema.unitsOfMeasure.name })
        .from(schema.unitsOfMeasure)
        .where(inArray(schema.unitsOfMeasure.id, uomIds))
    : [];

  const lines = noteLines.flatMap((line: any) => {
    const item = items.find((candidate: any) => candidate.id === line.itemId);
    return pending
      .filter((row) => row.sourceLineId === line.id)
      .map((row) => ({
        lineId: line.id,
        lineNum: line.lineNum,
        itemId: line.itemId,
        itemCode: item?.code ?? null,
        itemName: item?.name ?? null,
        description: line.description ?? null,
        batchNum: (row.batchNum as string | undefined) ?? null,
        pending: Number(row.quantity) / factorOf(line),
        uomName: uoms.find((uom: any) => uom.id === line.uomId)?.name ?? null,
        zoneId: line.zoneId ?? null,
      }));
  });

  return {
    note: {
      id: note.id,
      code: doc?.code ?? String(note.docNum),
      status: note.status,
      partnerId: note.partnerId,
      partnerName: partner?.name ?? null,
      warehouseId: note.warehouseId ?? noteLines[0]?.warehouseId ?? null,
    },
    problem,
    lines,
  };
}

/** Comprueba lo pedido contra lo que queda y lo deja como líneas de la entrada. */
async function pickReturnLines(tx: any, noteId: string, wanted: NoteReturnLine[]) {
  const [noteLines, pending] = await Promise.all([
    noteLinesOf(tx, noteId),
    pendingReturnLines(tx, noteId),
  ]);
  const taken = new Map<string, number>();
  const picked: Array<Record<string, unknown>> = [];

  for (const request of wanted) {
    const line = noteLines.find((candidate: any) => candidate.id === request.lineId);
    if (!line) throw statusError(400, 'Esa línea no es de este albarán.');
    const quantity = Number(request.quantity);
    if (!(quantity > 0)) {
      throw statusError(400, 'La cantidad a devolver tiene que ser mayor que cero.');
    }
    const [item] = await tx
      .select({ name: schema.items.name, manageBy: schema.items.manageBy })
      .from(schema.items)
      .where(eq(schema.items.id, line.itemId));
    const name = item?.name ?? line.itemId;

    const batches = await tx
      .select({ batchNum: schema.salesDeliveryNoteLineBatches.batchNum })
      .from(schema.salesDeliveryNoteLineBatches)
      .where(eq(schema.salesDeliveryNoteLineBatches.deliveryLineId, line.id));
    const batchNum = request.batchNum?.trim() || null;
    if (batches.length > 0 && !batchNum) {
      throw statusError(400, `De «${name}» hay que decir de qué lote vuelve.`);
    }
    if (
      batchNum &&
      (batches.length === 0 || !batches.some((batch: any) => batch.batchNum === batchNum))
    ) {
      throw statusError(400, `El lote ${batchNum} no salió con este albarán.`);
    }

    const factor = factorOf(line);
    const base = quantity * factor;
    if (item?.manageBy === 'S' && !Number.isInteger(base)) {
      throw statusError(400, `«${name}» va por número de serie: vuelve entero.`);
    }

    const row = pending.find(
      (candidate) =>
        candidate.sourceLineId === line.id && (candidate.batchNum ?? null) === batchNum,
    );
    const key = `${line.id}|${batchNum ?? ''}`;
    const before = taken.get(key) ?? 0;
    const left = Number(row?.quantity ?? 0) - before;
    if (base > left + EPSILON) {
      throw statusError(409, `De «${name}» solo queda ${Math.max(0, left) / factor} por volver.`);
    }
    taken.set(key, before + base);
    picked.push({ ...row, quantity: base, batchNum });
  }
  return { picked, noteLines };
}

/**
 * La ubicación de cada línea: la elegida o, si vuelve al almacén del que salió, la de allí. Si
 * el almacén las exige, sin ella no entra: como cualquier entrada de mercancía.
 */
async function withZones(
  tx: any,
  note: any,
  noteLines: any[],
  picked: Array<Record<string, unknown>>,
  warehouseId: string,
  zoneId: string | null,
) {
  if (zoneId) {
    const [zone] = await tx
      .select({ id: schema.warehouseZones.id })
      .from(schema.warehouseZones)
      .where(
        and(
          eq(schema.warehouseZones.id, zoneId),
          eq(schema.warehouseZones.warehouseId, warehouseId),
        ),
      );
    if (!zone) throw statusError(400, 'Esa ubicación no es de ese almacén.');
  }
  const located = picked.map((row) => {
    const line = noteLines.find((candidate) => candidate.id === row.sourceLineId);
    const sameWarehouse = (line?.warehouseId ?? note.warehouseId) === warehouseId;
    return { ...row, zoneId: zoneId ?? (sameWarehouse ? (row.zoneId ?? null) : null) };
  });
  if (located.some((row) => !row.zoneId)) {
    const flags = await getConfigSection(tx, 'flags', FLAGS_DEFAULTS);
    if (await warehouseNeedsZone(tx, warehouseId, flags)) {
      throw statusError(400, 'Este almacén exige indicar la ubicación donde entra la mercancía.');
    }
  }
  return located;
}

/** Registra la devolución: la entrada, ya confirmada, y el stock de vuelta en el almacén. */
export async function returnFromNote(
  ctx: { db: any; user?: any },
  noteId: string,
  input: NoteReturnInput,
) {
  const reason = String(input?.reason ?? '').trim();
  const wanted = Array.isArray(input?.lines) ? input.lines : [];

  return ctx.db.transaction(async (tx: any) => {
    // Con la fila bloqueada: dos devoluciones, o una y un abono, se ponen en fila.
    const [note] = await tx
      .select()
      .from(schema.salesDeliveryNotes)
      .where(eq(schema.salesDeliveryNotes.id, noteId))
      .for('update');
    if (!note) throw statusError(404, 'Albarán no encontrado');
    const problem = await returnProblem(tx, note);
    if (problem) throw statusError(409, BLOCK_MESSAGES[problem]);
    if (!reason) throw statusError(400, 'Indica el motivo de la devolución.');
    if (wanted.length === 0) throw statusError(400, 'Elige al menos una línea.');

    const { picked, noteLines } = await pickReturnLines(tx, noteId, wanted);
    const warehouseId = input.warehouseId || note.warehouseId || noteLines[0]?.warehouseId;
    if (!warehouseId) throw statusError(400, 'Elige el almacén al que vuelve.');
    const [warehouse] = await tx
      .select({ id: schema.warehouses.id })
      .from(schema.warehouses)
      .where(eq(schema.warehouses.id, warehouseId));
    if (!warehouse) throw statusError(400, 'Ese almacén no existe.');
    const lines = await withZones(
      tx,
      note,
      noteLines,
      picked,
      warehouseId,
      input.zoneId?.trim() || null,
    );

    const code = await nextLogisticsCode(tx, 'RET');
    const [doc]: any[] = await hydrate(tx, 'SDN' as any, [noteId]);
    const receiptId = await insertReturnReceipt(tx, {
      code,
      warehouseId,
      notes: `Devolución del albarán ${doc?.code ?? note.docNum} — ${reason}`,
      userId: ctx.user?.id ?? null,
      noteId,
      lines,
    });
    await postReceipt(tx, receiptId);
    await tx
      .update(schema.goodsReceipts)
      .set({ status: 'posted', postedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.goodsReceipts.id, receiptId));

    return {
      receiptId,
      code,
      fullyReturned: isFullyReturned(noteLines, await receiptReturnsByLine(tx, noteId)),
      reason,
    };
  });
}
