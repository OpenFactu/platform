import { and, eq, ne, sql } from 'drizzle-orm';
import * as schema from '../../../../db/schema';
import type { DocumentBeforeCreateHookContext, DocumentHooks } from '../../DocumentEngine';
import { assertSerialUniqueness, assertZoneRequired } from '../shared';

/**
 * El número de la factura del proveedor es obligatorio: es lo que identifica
 * el gasto ante Hacienda y lo que se busca al cuadrar con el proveedor. Además
 * no puede repetirse para el mismo proveedor (salvo en una factura cancelada):
 * casi siempre es la misma factura registrada dos veces.
 */
async function assertSupplierReference({ tx, request }: DocumentBeforeCreateHookContext) {
  const ref = String((request as any).externalRef ?? '').trim();
  if (!ref) {
    throw new Error('Indica el número de factura del proveedor (referencia del proveedor).');
  }
  const [dup] = await tx
    .select({ id: schema.purchaseInvoices.id })
    .from(schema.purchaseInvoices)
    .where(
      and(
        eq(schema.purchaseInvoices.partnerId, request.partnerId),
        sql`lower(${schema.purchaseInvoices.externalRef}) = lower(${ref})`,
        ne(schema.purchaseInvoices.status, 'X'),
      ),
    )
    .limit(1);
  if (dup) {
    throw new Error(`Ya hay una factura de este proveedor con la referencia «${ref}».`);
  }
}

/**
 * Factura de Compra directa: mismas salvaguardas de entrada de stock que el
 * Albarán de Compra (zona obligatoria si `enforceWarehouseZones` + unicidad
 * de serie). Solo aplican a líneas que mueven stock — una línea que viene de
 * un albarán (`baseAlreadyMovedStock`) no lo mueve y no se re-valida.
 */
export const purchaseInvoiceHooks: DocumentHooks = {
  beforeCreate: assertSupplierReference,
  beforeLine: assertZoneRequired,
  beforeBatchDetail: assertSerialUniqueness,
};
