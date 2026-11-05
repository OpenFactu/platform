/**
 * Lo que ha vuelto de un albarán de venta. La mercancía puede volver por dos caminos: la entrada
 * de una devolución de logística o un abono con «devolver al stock». Cada uno tiene que saber
 * lo que ya trajo el otro, y lo devuelto ya no se factura ni se devuelve al cancelar.
 *
 * Las cantidades van en unidad base, como las entradas de mercancía. Un borrador cuenta igual
 * que uno confirmado: si no, los dos podrían confirmarse después.
 */
import { and, eq, inArray, ne } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { statusError } from './documentRules';
import { hydrate } from './documentChain';

export interface ReturnedQuantity {
  total: number;
  byBatch: Map<string, number>;
}

/** Margen para comparar cantidades con decimales. */
const EPSILON = 1e-6;

const emptyReturned = (): ReturnedQuantity => ({ total: 0, byBatch: new Map() });

function addTo(map: Map<string, ReturnedQuantity>, key: string, quantity: number, batch?: string) {
  const entry = map.get(key) ?? emptyReturned();
  entry.total += quantity;
  if (batch) entry.byBatch.set(batch, (entry.byBatch.get(batch) ?? 0) + quantity);
  map.set(key, entry);
}

const baseQuantityOf = (line: any) => Number(line.quantity) * Number(line.uomFactor || 1);

/** Lo bloquea hasta el final de la transacción: entrada y abono se ponen en fila. */
export async function lockDeliveryNote(tx: any, noteId: string) {
  await tx
    .select({ id: schema.salesDeliveryNotes.id })
    .from(schema.salesDeliveryNotes)
    .where(eq(schema.salesDeliveryNotes.id, noteId))
    .for('update');
}

/** Las entradas de mercancía vivas de un albarán. */
export async function returnReceiptsOfNote(db: any, noteId: string) {
  return db
    .select({
      id: schema.goodsReceipts.id,
      code: schema.goodsReceipts.code,
      status: schema.goodsReceipts.status,
    })
    .from(schema.goodsReceipts)
    .where(
      and(
        eq(schema.goodsReceipts.sourceDocId, noteId),
        ne(schema.goodsReceipts.status, 'cancelled'),
      ),
    );
}

/** Lo que traen las entradas de mercancía de un albarán, por cada línea suya. */
export async function receiptReturnsByLine(
  db: any,
  noteId: string,
): Promise<Map<string, ReturnedQuantity>> {
  const rows = await db
    .select({
      lineId: schema.goodsReceiptLines.sourceLineId,
      quantity: schema.goodsReceiptLines.quantity,
      batchNum: schema.goodsReceiptLines.batchNum,
    })
    .from(schema.goodsReceiptLines)
    .innerJoin(
      schema.goodsReceipts,
      eq(schema.goodsReceiptLines.receiptId, schema.goodsReceipts.id),
    )
    .where(
      and(
        eq(schema.goodsReceipts.sourceDocId, noteId),
        ne(schema.goodsReceipts.status, 'cancelled'),
      ),
    );
  const result = new Map<string, ReturnedQuantity>();
  for (const row of rows) {
    if (row.lineId) addTo(result, row.lineId, Number(row.quantity), row.batchNum ?? undefined);
  }
  return result;
}

const noteLinesOf = (db: any, noteId: string) =>
  db
    .select()
    .from(schema.salesDeliveryNoteLines)
    .where(eq(schema.salesDeliveryNoteLines.deliveryId, noteId));

/** Lo que ha vuelto con abonos de las facturas de este albarán, por cada línea suya. */
export async function creditReturnsByLine(
  db: any,
  noteId: string,
): Promise<Map<string, ReturnedQuantity>> {
  const result = new Map<string, ReturnedQuantity>();
  const lines = schema.salesInvoiceLines;
  const headers = schema.salesInvoices;
  const invoiced = await db
    .select({ invoiceId: lines.invoiceId, lineNum: lines.lineNum, baseLine: lines.baseLine })
    .from(lines)
    .innerJoin(headers, eq(lines.invoiceId, headers.id))
    .where(and(eq(lines.baseType, 'SDN'), eq(lines.baseId, noteId), ne(headers.status, 'X')));
  if (invoiced.length === 0) return result;

  const noteLines = await noteLinesOf(db, noteId);
  const invoiceIds: string[] = [...new Set<string>(invoiced.map((row: any) => row.invoiceId))];
  const credits = await db
    .select({ line: lines })
    .from(lines)
    .innerJoin(headers, eq(lines.invoiceId, headers.id))
    .where(
      and(
        eq(lines.baseType, 'SINV'),
        inArray(lines.baseId, invoiceIds),
        eq(lines.stockReturned, true),
        ne(headers.status, 'X'),
      ),
    );
  for (const { line } of credits) {
    const source = invoiced.find(
      (row: any) => row.invoiceId === line.baseId && row.lineNum === line.baseLine,
    );
    const noteLine = noteLines.find((row: any) => row.lineNum === source?.baseLine);
    if (!noteLine) continue;
    const batches = await db
      .select()
      .from(schema.salesInvoiceLineBatches)
      .where(eq(schema.salesInvoiceLineBatches.invoiceLineId, line.id));
    if (batches.length > 0) {
      for (const batch of batches) {
        addTo(result, noteLine.id, Number(batch.quantity), batch.batchNum);
      }
    } else {
      addTo(result, noteLine.id, Math.abs(baseQuantityOf(line)));
    }
  }
  return result;
}

/**
 * Las líneas de la entrada de una devolución: lo que salió con el albarán menos lo que ya ha
 * vuelto por cualquier camino, al coste con el que salió. Una línea por lote: si no, al
 * contabilizarla no se sabría a qué lote reponer.
 */
export async function pendingReturnLines(db: any, noteId: string) {
  const [noteLines, byReceipt, byCredit] = await Promise.all([
    noteLinesOf(db, noteId),
    receiptReturnsByLine(db, noteId),
    creditReturnsByLine(db, noteId),
  ]);
  const out: Array<Record<string, unknown>> = [];
  for (const line of noteLines) {
    if (!line.itemId || !line.quantity) continue;
    const back = emptyReturned();
    for (const source of [byReceipt.get(line.id), byCredit.get(line.id)]) {
      if (!source) continue;
      back.total += source.total;
      for (const [batch, quantity] of source.byBatch) {
        back.byBatch.set(batch, (back.byBatch.get(batch) ?? 0) + quantity);
      }
    }
    const common = {
      itemId: line.itemId,
      zoneId: line.zoneId || null,
      uomId: line.uomId || null,
      sourceLineId: line.id,
      unitCost: line.unitCost ?? null,
    };
    const batches = await db
      .select()
      .from(schema.salesDeliveryNoteLineBatches)
      .where(eq(schema.salesDeliveryNoteLineBatches.deliveryLineId, line.id));
    if (batches.length > 0) {
      for (const batch of batches) {
        const quantity = Number(batch.quantity) - (back.byBatch.get(batch.batchNum) ?? 0);
        if (quantity > EPSILON) out.push({ ...common, quantity, batchNum: batch.batchNum });
      }
    } else {
      const quantity = baseQuantityOf(line) - back.total;
      if (quantity > EPSILON) out.push({ ...common, quantity });
    }
  }
  return out;
}

/** Lo devuelto no se factura: la línea del pedido a facturar no puede pasar de lo que queda. */
export async function assertNotReturned(tx: any, noteId: string, requested: any[]) {
  const byReceipt = await receiptReturnsByLine(tx, noteId);
  if (byReceipt.size === 0) return;
  const noteLines = await noteLinesOf(tx, noteId);
  for (const wanted of requested) {
    const noteLine = noteLines.find((row: any) => row.lineNum === Number(wanted.baseLine));
    const back = noteLine ? (byReceipt.get(noteLine.id)?.total ?? 0) : 0;
    if (!noteLine || back <= 0) continue;
    const left = baseQuantityOf(noteLine) - back;
    const asked = Number(wanted.quantity) * Number(wanted.uomFactor || noteLine.uomFactor || 1);
    if (asked <= left + EPSILON) continue;
    throw statusError(
      409,
      left <= EPSILON
        ? `La mercancía de la línea ${noteLine.lineNum} del albarán ha vuelto: no se puede facturar.`
        : `De la línea ${noteLine.lineNum} del albarán ha vuelto parte: solo se pueden facturar ${left}.`,
    );
  }
}

/** Si la entrada trae todo lo que salió, cancelar el albarán ya no tiene stock que devolver. */
export function isFullyReturned(lines: any[], byReceipt: Map<string, ReturnedQuantity>): boolean {
  return (
    lines.length > 0 &&
    lines.every((line) => (byReceipt.get(line.id)?.total ?? 0) >= baseQuantityOf(line) - EPSILON)
  );
}

/** La ficha de un albarán, con lo que ha vuelto y con qué entrada. */
export async function withReturnState<T extends { id: string; lines?: any[] }>(db: any, note: T) {
  const receipts = await returnReceiptsOfNote(db, note.id);
  if (receipts.length === 0) {
    return { ...note, returnReceipts: [], fullyReturned: false };
  }
  const byReceipt = await receiptReturnsByLine(db, note.id);
  const lines = note.lines ?? [];
  return {
    ...note,
    returnReceipts: receipts,
    fullyReturned: isFullyReturned(lines, byReceipt),
    lines: lines.map((line: any) => ({
      ...line,
      returnedQty: (byReceipt.get(line.id)?.total ?? 0) / Number(line.uomFactor || 1),
    })),
  };
}

/** De los albaranes de un listado, los que ya han vuelto enteros. */
export async function fullyReturnedNotes(db: any, noteIds: string[]): Promise<Set<string>> {
  const result = new Set<string>();
  if (noteIds.length === 0) return result;
  const rows = await db
    .select({ noteId: schema.goodsReceipts.sourceDocId })
    .from(schema.goodsReceipts)
    .where(
      and(
        inArray(schema.goodsReceipts.sourceDocId, noteIds),
        ne(schema.goodsReceipts.status, 'cancelled'),
      ),
    );
  const withReceipts: string[] = [...new Set<string>(rows.map((row: any) => row.noteId))];
  for (const noteId of withReceipts) {
    const [lines, byReceipt] = await Promise.all([
      noteLinesOf(db, noteId),
      receiptReturnsByLine(db, noteId),
    ]);
    if (isFullyReturned(lines, byReceipt)) result.add(noteId);
  }
  return result;
}

/** La factura de un albarán, para avisar de que se ha quedado sin corregir. */
export async function invoiceOfNote(db: any, noteId: string) {
  const lines = schema.salesInvoiceLines;
  const headers = schema.salesInvoices;
  const [row] = await db
    .select({ id: headers.id, status: headers.status })
    .from(lines)
    .innerJoin(headers, eq(lines.invoiceId, headers.id))
    .where(and(eq(lines.baseType, 'SDN'), eq(lines.baseId, noteId), ne(headers.status, 'X')))
    .limit(1);
  if (!row) return null;
  const [doc]: any[] = await hydrate(db, 'SINV' as any, [row.id]);
  return { id: row.id, status: row.status, code: doc?.code ?? row.id.slice(0, 8) };
}
