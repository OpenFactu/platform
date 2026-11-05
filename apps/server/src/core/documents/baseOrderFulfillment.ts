import { and, eq, sql } from 'drizzle-orm';
import { DocStatus } from '@openfactu/common';

interface FulfillmentLine {
  baseLine?: number;
  quantity: number | string;
}

function conflict(message: string): Error {
  const err: any = new Error(message);
  err.statusCode = 409;
  return err;
}

/**
 * Un pedido se sirve hasta donde pide. El bloqueo hace esperar a un segundo albarán
 * simultáneo, que ya verá lo que haya servido el primero.
 */
async function assertOrderHasRoom(
  tx: any,
  opts: {
    orderLineTable: any;
    orderHeaderTable: any;
    qtyField: string;
    orderId: string;
    lines: FulfillmentLine[];
  },
) {
  const { orderLineTable, orderHeaderTable, qtyField, orderId, lines } = opts;
  const verb = qtyField === 'receivedQty' ? 'recibir' : 'entregar';
  const [order] = await tx
    .select({ status: orderHeaderTable.status })
    .from(orderHeaderTable)
    .where(eq(orderHeaderTable.id, orderId))
    .for('update');
  if (!order) throw conflict('El pedido de este albarán ya no existe.');
  if (order.status === DocStatus.Cancelled) throw conflict('Este pedido está cancelado.');
  if (order.status === DocStatus.Closed) {
    throw conflict(`Este pedido ya está cerrado: no queda nada por ${verb}.`);
  }

  const wanted = new Map<number, number>();
  for (const line of lines) {
    if (!line.baseLine) continue;
    wanted.set(line.baseLine, (wanted.get(line.baseLine) ?? 0) + Number(line.quantity));
  }
  const orderLines = await tx
    .select()
    .from(orderLineTable)
    .where(eq(orderLineTable.orderId, orderId));
  for (const [lineNum, quantity] of wanted) {
    const orderLine = orderLines.find((l: any) => l.lineNum === lineNum);
    if (!orderLine) throw conflict(`La línea ${lineNum} no está en el pedido.`);
    const pending = Math.max(0, Number(orderLine.orderedQty) - Number(orderLine[qtyField]));
    if (quantity > pending + 0.0001) {
      throw conflict(
        `De la línea ${lineNum} del pedido quedan ${pending} por ${verb}, no ${quantity}.`,
      );
    }
  }
}

/**
 * Incrementa `qtyField` (p. ej. `deliveredQty` en SDN→SO, `receivedQty` en
 * PDN→PO) en las líneas del pedido origen referenciadas por `baseLine`, y
 * recalcula el estado de la cabecera del pedido (Abierto/Parcial/Cerrado)
 * según cuánto se ha cumplido — mismo algoritmo para venta y compra, solo
 * cambian las tablas involucradas.
 */
export async function applyBaseOrderFulfillment(
  tx: any,
  opts: {
    orderLineTable: any;
    orderHeaderTable: any;
    qtyField: string;
    orderId: string | undefined | null;
    lines: FulfillmentLine[];
    /** 1 (por defecto) al crear el documento derivado; -1 al cancelarlo. */
    sign?: 1 | -1;
  },
) {
  const { orderLineTable, orderHeaderTable, qtyField, orderId, lines, sign = 1 } = opts;
  if (!orderId) return;
  if (sign === 1) {
    await assertOrderHasRoom(tx, { orderLineTable, orderHeaderTable, qtyField, orderId, lines });
  }

  for (const line of lines) {
    if (!line.baseLine) continue;
    const delta = sign * Number(line.quantity);
    await tx
      .update(orderLineTable)
      .set({ [qtyField]: sql`${orderLineTable[qtyField]} + ${delta}` })
      .where(and(eq(orderLineTable.orderId, orderId), eq(orderLineTable.lineNum, line.baseLine)));
  }

  const orderLines = await tx
    .select()
    .from(orderLineTable)
    .where(eq(orderLineTable.orderId, orderId));
  const allDone = orderLines.every(
    (l: any) => Number(l[qtyField]) + 0.0001 >= Number(l.orderedQty),
  );
  const anyDone = orderLines.some((l: any) => Number(l[qtyField]) > 0);

  await tx
    .update(orderHeaderTable)
    .set({ status: allDone ? DocStatus.Closed : anyDone ? DocStatus.Partial : DocStatus.Open })
    .where(eq(orderHeaderTable.id, orderId));
}
