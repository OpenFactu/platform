/**
 * Facturas canceladas que siguen con su asiento en pie, por empresa.
 *
 * Hasta noviembre de 2026 se podía cancelar una factura emitida y su asiento no se
 * revertía. Este listado es de solo lectura: qué hacer con cada una lo decide quien
 * lleve la contabilidad de esa empresa.
 *
 * Ejecuta con: `npx ts-node --transpile-only src/scripts/list-cancelled-issued-invoices.ts`
 */
import { sql } from 'drizzle-orm';
import { ClientFactory } from '../core/tenant/ClientFactory';
import * as schema from '../db/schema';

const INVOICE_TABLES = [
  { label: 'venta', table: 'SalesInvoice', source: 'sales_invoice' },
  { label: 'compra', table: 'PurchaseInvoice', source: 'purchase_invoice' },
];

async function main() {
  const tenants = await ClientFactory.getClient('public')
    .select({ name: schema.tenants.name, schemaName: schema.tenants.schemaName })
    .from(schema.tenants);

  let total = 0;
  for (const tenant of tenants) {
    const db = ClientFactory.getClient(tenant.schemaName);
    for (const { label, table, source } of INVOICE_TABLES) {
      const result: any = await db.execute(
        sql.raw(`
          SELECT i."docNum", i.date, i.total, e.number AS entry
          FROM "${table}" i
          JOIN "JournalEntry" e ON e."sourceDocumentId" = i.id
          WHERE i.status = 'X'
            AND e.source = '${source}'
            AND e.status = 'posted'
            AND e."reversedById" IS NULL
          ORDER BY i.date`),
      );
      for (const row of result.rows) {
        total++;
        console.log(
          `${tenant.name} | ${label} | nº ${row.docNum} | ${new Date(row.date).toISOString().slice(0, 10)} | ${row.total} | asiento ${row.entry}`,
        );
      }
    }
  }
  console.log(`Total: ${total}`);
  await ClientFactory.disconnectAll();
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
