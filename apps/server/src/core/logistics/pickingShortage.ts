/**
 * Una falta en el picking. El stock sale al crear el albarán, antes de preparar,
 * así que lo que no se encuentra hay que corregirlo: la línea baja, el stock vuelve
 * y el pedido de origen deja de darlo por servido. Un albarán ya facturado no se
 * toca: queda el aviso para hacer una rectificativa.
 */
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { applyBaseOrderFulfillment } from '../documents/baseOrderFulfillment';
import { DocumentEngine } from '../documents/DocumentEngine';
import { DocumentRegistry } from '../documents/DocumentRegistry';

/** Lo que el motor de documentos necesita saber de un tipo. */
export function documentDefinition(code: 'SDN' | 'PDN') {
  const config = DocumentRegistry.get(code);
  return {
    tableName: config.tableName,
    schemaTable: config.schemaTable,
    lineSchemaTable: config.lineSchemaTable,
    batchSchemaTable: config.batchSchemaTable,
    eventPrefix: config.eventPrefix,
    stockAction: config.stockAction,
    closeBaseDocuments: config.closeBaseDocuments,
    hooks: config.hooks,
  };
}

const FULFILLMENT = {
  SDN: {
    orderLineTable: schema.salesOrderLines,
    orderHeaderTable: schema.salesOrders,
    qtyField: 'deliveredQty',
  },
  PDN: {
    orderLineTable: schema.purchaseOrderLines,
    orderHeaderTable: schema.purchaseOrders,
    qtyField: 'receivedQty',
  },
};

async function recordShortage(tx: any, shipmentId: string | null, description: string) {
  if (!shipmentId) return;
  await tx.insert(schema.shipmentEvents).values({
    id: crypto.randomUUID(),
    shipmentId,
    kind: 'shortage',
    description,
  });
}

/**
 * Aplica la falta de una tarea. Devuelve la cantidad corregida, o `null` si no se
 * ha podido corregir y el albarán sigue como estaba.
 */
export async function applyPickingShortage(
  tx: any,
  task: any,
  pickedQty: number,
): Promise<number | null> {
  const shortfall = Number(task.requestedQty) - pickedQty;
  if (shortfall <= 0 || !task.docLineId) return null;

  const code = task.docType as 'SDN' | 'PDN';
  const def = documentDefinition(code);
  const [note] = await tx.select().from(def.schemaTable).where(eq(def.schemaTable.id, task.docId));
  if (!note || note.status === 'X') return null;

  const [item] = task.itemId
    ? await tx
        .select({ code: schema.items.code })
        .from(schema.items)
        .where(eq(schema.items.id, task.itemId))
    : [null];
  const what = item?.code || task.itemId || '';

  if (note.status === 'C') {
    await recordShortage(
      tx,
      task.shipmentId,
      `Faltan ${shortfall} de ${what}, pero el albarán ya está facturado: emite una factura rectificativa.`,
    );
    return null;
  }

  const [line] = await tx
    .select()
    .from(def.lineSchemaTable)
    .where(eq(def.lineSchemaTable.id, task.docLineId));
  if (!line) return null;

  // Una tarea de lote va en unidad base; una de línea, en la unidad del albarán.
  const factor = Number(line.uomFactor || 1);
  const lineQty = task.batchNumber ? shortfall / factor : shortfall;
  await DocumentEngine.reduceLineQuantity(tx, def, task.docLineId, lineQty, task.batchNumber);

  if (line.baseLine) {
    const fulfillment = FULFILLMENT[code];
    await applyBaseOrderFulfillment(tx, {
      ...fulfillment,
      orderId: note.orderId,
      lines: [{ baseLine: line.baseLine, quantity: lineQty }],
      sign: -1,
    });
  }

  await recordShortage(
    tx,
    task.shipmentId,
    `Faltan ${shortfall} de ${what}: albarán corregido y stock ajustado.`,
  );
  return shortfall;
}
