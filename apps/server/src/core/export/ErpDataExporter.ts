/**
 * Exporta los datos "vivos" de un tenant en CSVs genéricos dentro de un zip.
 * Pensado para migrar a otro ERP — el destino se encarga de mapear las
 * columnas a su modelo. Una fila por entidad, separador `,`, encoding UTF-8
 * con BOM (Excel friendly).
 *
 * Exporta TODAS las tablas del schema del tenant (descubiertas en pg_tables),
 * no una lista fija — así ninguna entidad se queda fuera aunque se añadan
 * tablas nuevas al modelo. Solo se excluyen las tablas internas de
 * infraestructura (_MigrationHistory). Las entidades principales conservan
 * su nombre de archivo histórico (partners.csv, items.csv, ...); el resto
 * usa el nombre de la tabla en snake_case.
 *
 * Cada fila incluye el campo natural y los IDs/relaciones, así otro ERP
 * puede reconciliar.
 */

import AdmZip from 'adm-zip';
import { sql } from 'drizzle-orm';

/** Tablas internas que no aportan datos de negocio. */
const EXCLUDED_TABLES = new Set(['_MigrationHistory']);

/** Nombres de archivo históricos para las entidades principales. */
const FRIENDLY_NAMES: Record<string, string> = {
  PartnerGroup: 'partner_groups',
  BusinessPartner: 'partners',
  PartnerAddress: 'partner_addresses',
  Category: 'categories',
  UnitOfMeasure: 'units_of_measure',
  TaxGroup: 'tax_groups',
  Item: 'items',
  SalesOrder: 'sales_orders',
  SalesOrderLine: 'sales_order_lines',
  SalesDeliveryNote: 'sales_delivery_notes',
  SalesDeliveryNoteLine: 'sales_delivery_note_lines',
  SalesInvoice: 'sales_invoices',
  SalesInvoiceLine: 'sales_invoice_lines',
  PurchaseOrder: 'purchase_orders',
  PurchaseOrderLine: 'purchase_order_lines',
  PurchaseDeliveryNote: 'purchase_delivery_notes',
  PurchaseDeliveryNoteLine: 'purchase_delivery_note_lines',
  PurchaseInvoice: 'purchase_invoices',
  PurchaseInvoiceLine: 'purchase_invoice_lines',
};

/** ItemZoneStock → item_zone_stock */
function toSnakeFile(table: string): string {
  return table
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/^_+/, '')
    .toLowerCase();
}

export class ErpDataExporter {
  static async exportToZip(tenantClient: any): Promise<Buffer> {
    const zip = new AdmZip();
    const manifest: any = {
      exportedAt: new Date().toISOString(),
      version: 2,
      tables: [] as Array<{ file: string; table: string; rows: number }>,
    };

    // Descubrir todas las tablas del schema activo del tenant (el client ya
    // nace con search_path al schema correcto).
    const tablesRes: any = await tenantClient.execute(
      sql.raw(
        `SELECT tablename FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename`,
      ),
    );
    const tableNames: string[] = (tablesRes?.rows ?? [])
      .map((r: any) => r.tablename as string)
      .filter((t: string) => !EXCLUDED_TABLES.has(t));

    for (const table of tableNames) {
      const file = FRIENDLY_NAMES[table] || toSnakeFile(table);
      try {
        const res: any = await tenantClient.execute(sql.raw(`SELECT * FROM "${table}"`));
        const rows: any[] = res?.rows ?? res ?? [];
        const csv = toCsv(rows);
        // BOM + CSV para abrir bien en Excel.
        zip.addFile(
          `${file}.csv`,
          Buffer.concat([Buffer.from('\uFEFF', 'utf8'), Buffer.from(csv)]),
        );
        manifest.tables.push({ file: `${file}.csv`, table, rows: rows.length });
      } catch (e: any) {
        // Si una tabla no puede leerse la registramos sin abortar el export.
        manifest.tables.push({ file: `${file}.csv`, table, rows: 0, error: e?.message });
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
