import { Router } from 'express';
import { eq, or, ilike, sql, desc } from 'drizzle-orm';
import * as schema from '../db/schema';
import { permissionsForRequest, grantsRead } from './middleware/requirePermission';

const router = Router();

const LIMIT = 5;

/**
 * Qué permiso hace falta para que un tipo de resultado aparezca.
 *
 * Este endpoint no puede exigir UN permiso y ya está: mira doce entidades a la
 * vez. Sin este recorte, alguien sin acceso a RRHH encontraba la plantilla
 * entera —nombre, DNI y correo— escribiendo tres letras en la caja de
 * búsqueda, y sin acceso a contabilidad leía los asientos. Lo que no se puede
 * ver ni siquiera se consulta.
 */
const PERMISO_POR_SECCION = {
  partners: '/partners',
  items: '/items',
  salesInvoices: '/sales/invoices',
  purchaseInvoices: '/purchases/invoices',
  salesDeliveryNotes: '/sales/delivery-notes',
  purchaseDeliveryNotes: '/purchases/delivery-notes',
  salesOrders: '/sales-orders',
  purchaseOrders: '/purchase-orders',
  journalEntries: '/journal-entries',
  employees: '/hr/employees',
  internalOrders: '/internal-orders',
  chartOfAccounts: '/chart-of-accounts',
} as const;

type Seccion = keyof typeof PERMISO_POR_SECCION;

/** Respuesta con todas las secciones vacías. */
function respuestaVacia() {
  const out: Record<string, any> = { total: 0 };
  for (const seccion of Object.keys(PERMISO_POR_SECCION)) out[seccion] = [];
  return out;
}

/**
 * GET /api/search?q=xxx
 * Búsqueda global multi-entidad, acotada a lo que el usuario puede ver.
 */
router.get('/', async (req: any, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json(respuestaVacia());

  const pattern = `%${q}%`;
  const db = req.tenantClient;

  try {
    const permisos = await permissionsForRequest(req);
    /** ¿Se busca en esta sección? Si no, se devuelve vacía sin tocar la base. */
    const puede = (seccion: Seccion) => grantsRead(permisos, PERMISO_POR_SECCION[seccion]);
    // 1. Partners
    const partners = !puede('partners')
      ? []
      : await db
          .select({
            id: schema.businessPartners.id,
            code: schema.businessPartners.code,
            name: schema.businessPartners.name,
            nif: schema.businessPartners.nif,
          })
          .from(schema.businessPartners)
          .where(
            or(
              ilike(schema.businessPartners.code, pattern),
              ilike(schema.businessPartners.name, pattern),
              ilike(schema.businessPartners.nif, pattern),
            ),
          )
          .limit(LIMIT);

    // 2. Items
    const items = !puede('items')
      ? []
      : await db
          .select({
            id: schema.items.id,
            code: schema.items.code,
            name: schema.items.name,
          })
          .from(schema.items)
          .where(or(ilike(schema.items.code, pattern), ilike(schema.items.name, pattern)))
          .limit(LIMIT);

    // 3-6. Documentos: busca por docCode formateado (prefix-period-docNum) o por partner
    const searchDocs = async (table: any) => {
      // Construye el docCode en SQL para poder hacer ILIKE sobre "FA-2026ER-000007"
      const docCodeExpr = sql`(
        COALESCE(${schema.documentSeries.prefix}, '')
        || '-' || COALESCE(${schema.accountingPeriods.code}, '')
        || '-' || LPAD(${table.docNum}::text, 6, '0')
      )`;

      const rows = await db
        .select({
          id: table.id,
          docNum: table.docNum,
          date: table.date,
          total: table.total,
          status: table.status,
          prefix: schema.documentSeries.prefix,
          periodCode: schema.accountingPeriods.code,
          partnerName: schema.businessPartners.name,
        })
        .from(table)
        .leftJoin(schema.documentSeries, eq(table.seriesId, schema.documentSeries.id))
        .leftJoin(schema.accountingPeriods, eq(table.periodId, schema.accountingPeriods.id))
        .leftJoin(schema.businessPartners, eq(table.partnerId, schema.businessPartners.id))
        .where(
          or(
            sql`${docCodeExpr} ILIKE ${pattern}`,
            ilike(schema.businessPartners.name, pattern),
            ilike(schema.documentSeries.prefix, pattern),
          ),
        )
        .orderBy(desc(table.createdAt))
        .limit(LIMIT);

      return rows.map((r: any) => ({
        id: r.id,
        docCode: `${r.prefix || ''}-${r.periodCode || ''}-${String(r.docNum).padStart(6, '0')}`,
        partnerName: r.partnerName || '',
        date: r.date,
        total: Number(r.total),
        status: r.status,
      }));
    };

    const [
      salesInvoices,
      purchaseInvoices,
      salesDeliveryNotes,
      purchaseDeliveryNotes,
      salesOrders,
      purchaseOrders,
    ] = await Promise.all([
      puede('salesInvoices') ? searchDocs(schema.salesInvoices) : [],
      puede('purchaseInvoices') ? searchDocs(schema.purchaseInvoices) : [],
      puede('salesDeliveryNotes') ? searchDocs(schema.salesDeliveryNotes) : [],
      puede('purchaseDeliveryNotes') ? searchDocs(schema.purchaseDeliveryNotes) : [],
      puede('salesOrders') ? searchDocs(schema.salesOrders) : [],
      puede('purchaseOrders') ? searchDocs(schema.purchaseOrders) : [],
    ]);

    // 7. Asientos contables — por número o descripción.
    const journalEntries = !puede('journalEntries')
      ? []
      : await db
          .select({
            id: schema.journalEntries.id,
            number: schema.journalEntries.number,
            date: schema.journalEntries.date,
            description: schema.journalEntries.description,
            status: schema.journalEntries.status,
          })
          .from(schema.journalEntries)
          .where(
            or(
              ilike(schema.journalEntries.description, pattern),
              sql`${schema.journalEntries.number}::text ILIKE ${pattern}`,
            ),
          )
          .orderBy(desc(schema.journalEntries.createdAt))
          .limit(LIMIT);

    // 8. Empleados — código, nombre, apellido, email, DNI. Datos personales:
    // es la sección que más urgía cerrar.
    const employees = !puede('employees')
      ? []
      : await db
          .select({
            id: schema.employees.id,
            code: schema.employees.code,
            firstName: schema.employees.firstName,
            lastName: schema.employees.lastName,
            email: schema.employees.email,
          })
          .from(schema.employees)
          .where(
            or(
              ilike(schema.employees.code, pattern),
              ilike(schema.employees.firstName, pattern),
              ilike(schema.employees.lastName, pattern),
              ilike(schema.employees.email, pattern),
              ilike(schema.employees.dni, pattern),
            ),
          )
          .limit(LIMIT);

    // 9. Proyectos / órdenes internas.
    const internalOrders = !puede('internalOrders')
      ? []
      : await db
          .select({
            id: schema.internalOrders.id,
            code: schema.internalOrders.code,
            name: schema.internalOrders.name,
            status: schema.internalOrders.status,
          })
          .from(schema.internalOrders)
          .where(
            or(
              ilike(schema.internalOrders.code, pattern),
              ilike(schema.internalOrders.name, pattern),
            ),
          )
          .limit(LIMIT);

    // 10. Plan contable.
    const chartOfAccounts = !puede('chartOfAccounts')
      ? []
      : await db
          .select({
            id: schema.chartOfAccounts.id,
            code: schema.chartOfAccounts.code,
            name: schema.chartOfAccounts.name,
            type: schema.chartOfAccounts.type,
          })
          .from(schema.chartOfAccounts)
          .where(
            or(
              ilike(schema.chartOfAccounts.code, pattern),
              ilike(schema.chartOfAccounts.name, pattern),
            ),
          )
          .limit(LIMIT);

    const total =
      partners.length +
      items.length +
      salesInvoices.length +
      purchaseInvoices.length +
      salesDeliveryNotes.length +
      purchaseDeliveryNotes.length +
      salesOrders.length +
      purchaseOrders.length +
      journalEntries.length +
      employees.length +
      internalOrders.length +
      chartOfAccounts.length;

    res.json({
      partners,
      items,
      salesInvoices,
      purchaseInvoices,
      salesDeliveryNotes,
      purchaseDeliveryNotes,
      salesOrders,
      purchaseOrders,
      journalEntries,
      employees,
      internalOrders,
      chartOfAccounts,
      total,
    });
  } catch (error: any) {
    console.error('[Search] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
