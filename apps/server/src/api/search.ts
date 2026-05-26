import { Router } from 'express';
import { eq, or, ilike, sql, desc } from 'drizzle-orm';
import * as schema from '../db/schema';

const router = Router();

const LIMIT = 5;

/**
 * GET /api/search?q=xxx
 * Búsqueda global multi-entidad.
 */
router.get('/', async (req: any, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) {
    return res.json({
      partners: [],
      items: [],
      salesInvoices: [],
      purchaseInvoices: [],
      salesDeliveryNotes: [],
      purchaseDeliveryNotes: [],
      salesOrders: [],
      purchaseOrders: [],
      journalEntries: [],
      employees: [],
      internalOrders: [],
      chartOfAccounts: [],
      total: 0,
    });
  }

  const pattern = `%${q}%`;
  const db = req.tenantClient;

  try {
    // 1. Partners
    const partners = await db
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
    const items = await db
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
      searchDocs(schema.salesInvoices),
      searchDocs(schema.purchaseInvoices),
      searchDocs(schema.salesDeliveryNotes),
      searchDocs(schema.purchaseDeliveryNotes),
      searchDocs(schema.salesOrders),
      searchDocs(schema.purchaseOrders),
    ]);

    // 7. Asientos contables — por número o descripción.
    const journalEntries = await db
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

    // 8. Empleados — código, nombre, apellido, email, DNI.
    const employees = await db
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
    const internalOrders = await db
      .select({
        id: schema.internalOrders.id,
        code: schema.internalOrders.code,
        name: schema.internalOrders.name,
        status: schema.internalOrders.status,
      })
      .from(schema.internalOrders)
      .where(
        or(ilike(schema.internalOrders.code, pattern), ilike(schema.internalOrders.name, pattern)),
      )
      .limit(LIMIT);

    // 10. Plan contable.
    const chartOfAccounts = await db
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
