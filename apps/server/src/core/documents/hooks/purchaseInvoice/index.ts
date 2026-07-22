import type { DocumentHooks } from '../../DocumentEngine';
import { assertSerialUniqueness, assertZoneRequired } from '../shared';

/**
 * Factura de Compra directa: mismas salvaguardas de entrada de stock que el
 * Albarán de Compra (zona obligatoria si `enforceWarehouseZones` + unicidad
 * de serie). Solo aplican a líneas que mueven stock — una línea que viene de
 * un albarán (`baseAlreadyMovedStock`) no lo mueve y no se re-valida.
 */
export const purchaseInvoiceHooks: DocumentHooks = {
  beforeLine: assertZoneRequired,
  beforeBatchDetail: assertSerialUniqueness,
};
