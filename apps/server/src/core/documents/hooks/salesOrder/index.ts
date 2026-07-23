import { eq } from 'drizzle-orm';
import * as schema from '../../../../db/schema';
import type { DocumentHooks } from '../../DocumentEngine';

/**
 * Pedido de Venta: si el pedido nace de un presupuesto (request.quoteId,
 * persistido en SalesOrder.quoteId), el presupuesto pasa a Aceptado.
 * Dentro de la misma transacción de creación del pedido.
 */
export const salesOrderHooks: DocumentHooks = {
  afterLinesProcessed: async ({ tx, request }) => {
    const quoteId = (request as any).quoteId;
    if (!quoteId) return;
    await tx
      .update(schema.salesQuotes)
      .set({ status: 'A' })
      .where(eq(schema.salesQuotes.id, quoteId));
  },
};
