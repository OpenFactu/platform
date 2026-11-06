/**
 * Recepciones de mercancía devuelta: lo que vuelve al almacén, en borrador para
 * que el operario lo revise y lo contabilice al llegar el camión.
 */
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { lockDeliveryNote, pendingReturnLines } from '../documents/deliveryReturns';
import { nextLogisticsCode } from './logisticsCodes';

interface ReceiptInput {
  warehouseId: string;
  notes: string;
  userId: string | null;
  /** Envío cuyo albarán dice qué vuelve. Sin albarán, la recepción sale vacía. */
  shipment: { deliveryNoteId?: string | null; sourceDocType?: string | null };
}

/**
 * La entrada de lo que vuelve de un albarán, ligada a él y al coste con el que salió, sin lo que
 * ya haya vuelto por otro camino. `null` si no hay nada que meter: ya volvió todo, o es una
 * compra, cuya mercancía entró con el albarán y no vuelve a entrar.
 */
export async function createReturnReceipt(tx: any, input: ReceiptInput): Promise<string | null> {
  const { shipment } = input;
  if (shipment.sourceDocType === 'PDN') return null;
  let lines: Array<Record<string, unknown>> = [];
  if (shipment.deliveryNoteId) {
    await lockDeliveryNote(tx, shipment.deliveryNoteId);
    lines = await pendingReturnLines(tx, shipment.deliveryNoteId);
    if (lines.length === 0) return null;
  }
  return insertReturnReceipt(tx, {
    code: await nextLogisticsCode(tx, 'RET'),
    warehouseId: input.warehouseId,
    notes: input.notes,
    userId: input.userId,
    noteId: shipment.deliveryNoteId ?? null,
    lines,
  });
}

/** Escribe la entrada, en borrador y ligada a su albarán si lo tiene. */
export async function insertReturnReceipt(
  tx: any,
  input: {
    code: string;
    warehouseId: string;
    notes: string;
    userId: string | null;
    noteId: string | null;
    lines: Array<Record<string, unknown>>;
  },
): Promise<string> {
  const { lines } = input;
  const receiptId = crypto.randomUUID();
  await tx.insert(schema.goodsReceipts).values({
    id: receiptId,
    code: input.code,
    warehouseId: input.warehouseId,
    date: new Date(),
    type: 'return',
    status: 'draft',
    notes: input.notes,
    createdByUserId: input.userId,
    sourceDocType: input.noteId ? 'SDN' : null,
    sourceDocId: input.noteId,
  });
  if (lines.length > 0) {
    await tx.insert(schema.goodsReceiptLines).values(
      lines.map((line, index) => ({
        ...line,
        id: crypto.randomUUID(),
        receiptId,
        lineNum: index + 1,
      })),
    );
  }
  return receiptId;
}

/** Almacén al que vuelve: el indicado o, si no, el del albarán origen. */
export async function returnWarehouseOf(
  db: any,
  shipment: { deliveryNoteId?: string | null; sourceDocType?: string | null },
  explicit?: string | null,
): Promise<string | null> {
  if (explicit) return explicit;
  if (!shipment.deliveryNoteId) return null;
  const table: any =
    shipment.sourceDocType === 'PDN' ? schema.purchaseDeliveryNotes : schema.salesDeliveryNotes;
  const [note] = await db
    .select({ warehouseId: table.warehouseId })
    .from(table)
    .where(eq(table.id, shipment.deliveryNoteId));
  return note?.warehouseId || null;
}
