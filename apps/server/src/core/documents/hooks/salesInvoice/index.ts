import { eq } from 'drizzle-orm';
import * as schema from '../../../../db/schema';
import type { DocumentHooks } from '../../DocumentEngine';
import { assertStockAvailable, resolveBatchDetailsFifo } from '../shared';

/**
 * Factura de Venta directa: mismas salvaguardas de salida de stock que el
 * Albarán de Venta (stock global suficiente salvo `allowNegativeStock` +
 * auto-FIFO de lotes si `autoConfirmBatches`). Solo aplican a líneas que
 * mueven stock — una línea que viene de un albarán (`baseAlreadyMovedStock`)
 * no lo mueve y no se re-valida.
 */
export const salesInvoiceHooks: DocumentHooks = {
  beforeLine: assertStockAvailable,
  resolveBatchDetails: resolveBatchDetailsFifo,
  // Facturar directamente un presupuesto (líneas con baseType 'SQ') lo marca
  // como Aceptado — misma semántica que al convertirlo en pedido.
  afterLinesProcessed: async ({ tx, request }) => {
    const quoteIds = Array.from(
      new Set(
        (request.lines ?? [])
          .filter((l: any) => l.baseType === 'SQ' && l.baseId)
          .map((l: any) => l.baseId as string),
      ),
    );
    for (const quoteId of quoteIds) {
      await tx
        .update(schema.salesQuotes)
        .set({ status: 'A' })
        .where(eq(schema.salesQuotes.id, quoteId));
    }
  },
};
