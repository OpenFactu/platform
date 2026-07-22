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
};
