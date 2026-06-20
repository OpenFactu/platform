/**
 * Exporta los datos "vivos" de un tenant en CSVs genéricos dentro de un zip.
 * Pensado para migrar a otro ERP — el destino se encarga de mapear las
 * columnas a su modelo. Una fila por entidad, separador `,`, encoding UTF-8
 * con BOM (Excel friendly).
 *
 * Tablas exportadas:
 *   partners.csv, partner_addresses.csv, partner_groups.csv
 *   items.csv, categories.csv, units_of_measure.csv, tax_groups.csv
 *   sales_orders.csv, sales_order_lines.csv
 *   sales_delivery_notes.csv, sales_delivery_note_lines.csv
 *   sales_invoices.csv, sales_invoice_lines.csv
 *   purchase_orders.csv, purchase_order_lines.csv
 *   purchase_delivery_notes.csv, purchase_delivery_note_lines.csv
 *   purchase_invoices.csv, purchase_invoice_lines.csv
 *
 * Cada fila incluye el campo natural y los IDs/relaciones, así otro ERP
 * puede reconciliar.
 */

import AdmZip from 'adm-zip';
import { sql } from 'drizzle-orm';

const TABLES = [
  { file: 'partner_groups', table: 'PartnerGroup' },
  { file: 'partners', table: 'BusinessPartner' },
  { file: 'partner_addresses', table: 'PartnerAddress' },
  { file: 'categories', table: 'Category' },
  { file: 'units_of_measure', table: 'UnitOfMeasure' },
  { file: 'tax_groups', table: 'TaxGroup' },
  { file: 'items', table: 'Item' },
  { file: 'sales_orders', table: 'SalesOrder' },
  { file: 'sales_order_lines', table: 'SalesOrderLine' },
  { file: 'sales_delivery_notes', table: 'SalesDeliveryNote' },
  { file: 'sales_delivery_note_lines', table: 'SalesDeliveryNoteLine' },
  { file: 'sales_invoices', table: 'SalesInvoice' },
  { file: 'sales_invoice_lines', table: 'SalesInvoiceLine' },
  { file: 'purchase_orders', table: 'PurchaseOrder' },
  { file: 'purchase_order_lines', table: 'PurchaseOrderLine' },
  { file: 'purchase_delivery_notes', table: 'PurchaseDeliveryNote' },
  { file: 'purchase_delivery_note_lines', table: 'PurchaseDeliveryNoteLine' },
  { file: 'purchase_invoices', table: 'PurchaseInvoice' },
  { file: 'purchase_invoice_lines', table: 'PurchaseInvoiceLine' },
];

export class ErpDataExporter {
  static async exportToZip(tenantClient: any): Promise<Buffer> {
    const zip = new AdmZip();
    const manifest: any = {
      exportedAt: new Date().toISOString(),
      version: 1,
      tables: [] as Array<{ file: string; table: string; rows: number }>,
    };

    for (const t of TABLES) {
      try {
        const res: any = await tenantClient.execute(sql.raw(`SELECT * FROM "${t.table}"`));
        const rows: any[] = res?.rows ?? res ?? [];
        const csv = toCsv(rows);
        // BOM + CSV para abrir bien en Excel.
        zip.addFile(
          `${t.file}.csv`,
          Buffer.concat([Buffer.from('\uFEFF', 'utf8'), Buffer.from(csv)]),
        );
        manifest.tables.push({ file: `${t.file}.csv`, table: t.table, rows: rows.length });
      } catch (e: any) {
        // Si una tabla no existe en este tenant la saltamos sin abortar.
        manifest.tables.push({ file: `${t.file}.csv`, table: t.table, rows: 0, error: e?.message });
      }
    }

    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
    return zip.toBuffer();
  }
}

/**
 * Convierte un array de rows a CSV. Detecta cabeceras como la unión de
 * todas las claves vistas. Escapa cadenas con comillas según RFC 4180.
 */
function toCsv(rows: any[]): string {
  if (rows.length === 0) return '';
  const headers = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) headers.add(k);
  const cols = [...headers];
  const out: string[] = [cols.join(',')];
  for (const r of rows) {
    out.push(cols.map((c) => esc(r[c])).join(','));
  }
  return out.join('\n');
}

function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s =
    v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
