/**
 * Arnés de las pruebas de facturas: la API real sobre una empresa de prueba, con
 * periodo, series, impuestos y cuentas ya preparados para poder emitir y contabilizar.
 */
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { sql } from 'drizzle-orm';
import { createTestTenant, testDatabaseUrl } from '../../tenant/__tests__/testTenant';
import { invalidatePermissions } from '../../../api/middleware/requirePermission';

export { testDatabaseUrl };

export type InvoiceSide = 'sales' | 'purchase';

export interface HarnessUser {
  id: string;
  role?: string;
}

export interface ApiResult<T = any> {
  status: number;
  data: T;
}

export interface ItemOptions {
  stock?: number;
  /** `N` sin trazabilidad; cualquier otro valor, por lotes. */
  manageBy?: string;
  warehouseId?: string;
}

export interface DocumentsHarness {
  tenantId: string;
  schemaName: string;
  db: any;
  publicDb: any;
  /** Un usuario normal con estos permisos en la empresa. */
  seedUser: (
    id: string,
    permissions: Record<string, { read: boolean; write: boolean; delete: boolean }>,
  ) => Promise<HarnessUser>;
  /** Un administrador de la empresa de prueba, de los que reciben los avisos. */
  seedAdmin: (id: string) => Promise<HarnessUser>;
  query: <T = any>(text: string) => Promise<T[]>;
  api: <T = any>(
    method: string,
    path: string,
    body?: unknown,
    user?: HarnessUser | null,
    /** Hace la petición como un token de API con estos scopes. */
    tokenScopes?: string[],
  ) => Promise<ApiResult<T>>;
  warehouseId: string;
  periodId: string;
  seriesId: Record<InvoiceSide, string>;
  tax: { general: string; reduced: string };
  seedPartner: () => Promise<string>;
  seedItem: (options?: ItemOptions) => Promise<string>;
  /** Crea un borrador por la API y devuelve su id. Falla la prueba si no se crea. */
  invoice: (
    side: InvoiceSide,
    lines: Array<Record<string, unknown>>,
    extra?: Record<string, unknown>,
  ) => Promise<string>;
  /** Emite una factura en borrador. */
  post: (side: InvoiceSide, id: string) => Promise<any>;
  invoicePath: (side: InvoiceSide) => string;
  stockOf: (itemId: string) => Promise<{ global: number; warehouse: number }>;
  entryOf: (invoiceId: string) => Promise<{ debit: number; credit: number; lines: any[] } | null>;
  close: () => Promise<void>;
}

const ACCOUNTS: Record<string, string> = {
  customer_receivable: '430000',
  sales_revenue: '700000',
  tax_output: '477000',
  supplier_payable: '400000',
  purchase_expense: '600000',
  tax_input: '472000',
  withholding_receivable: '473000',
  withholding_payable: '475100',
  bank: '572000',
  cash: '570000',
};

export async function startDocumentsHarness(): Promise<DocumentsHarness> {
  const tenant = await createTestTenant();
  const { tenantId, schemaName, suffix, db, publicDb, query, drop } = tenant;

  // De verdad en la base: la auditoría apunta a un usuario que tiene que existir.
  const ADMIN: HarnessUser = { id: `test-admin-${suffix}`, role: 'ADMIN' };
  await publicDb.execute(
    sql`INSERT INTO public."GlobalUser" (id, email, username, password) VALUES (${ADMIN.id}, ${`${ADMIN.id}@example.com`}, ${ADMIN.id}, 'x')`,
  );

  // Importados aquí: los routers leen `ClientFactory` y conviene que la URL ya esté puesta.
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { default: salesInvoices } = require('../../../api/documentos/salesInvoices');
  const { default: purchaseInvoices } = require('../../../api/documentos/purchaseInvoices');
  const { default: salesDeliveryNotes } = require('../../../api/documentos/salesDeliveryNotes');
  const { default: documents } = require('../../../api/documentos/documentRouter');
  const { default: payments } = require('../../../api/payments');
  const { default: reports } = require('../../../api/reports');
  const { default: customFields } = require('../../../api/customFields');
  const { default: linkedObjects } = require('../../../api/linkedObjects');
  const { default: documentLinks } = require('../../../api/documentLinks');
  const { default: items } = require('../../../api/items');
  const { default: partners } = require('../../../api/partners');
  const { default: partnerCredit } = require('../../../api/partnerCredit');
  const { default: salesSettings } = require('../../../api/salesSettings');
  const { default: dunning } = require('../../../api/dunning');
  const { default: recurringDocuments } = require('../../../api/recurringDocuments');
  const { default: series } = require('../../../api/series');
  const { default: logistics } = require('../../../api/logistics');
  const {
    goodsReceiptsRouter,
    goodsIssuesRouter,
    transferNotesRouter,
  } = require('../../../api/stockMovements');
  const {
    bankAccountOptionsRouter,
    bankAccountsRouter,
    bankStatementsRouter,
    paymentBatchesRouter,
  } = require('../../../api/banking');
  const { hideItemCosts } = require('../../../api/middleware/hideItemCosts');
  /* eslint-enable @typescript-eslint/no-var-requires */

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', (req: any, _res, next) => {
    req.tenantClient = db;
    req.tenantId = tenantId;
    req.tenantSchema = schemaName;
    const header = req.headers['x-test-user'];
    req.user = header ? JSON.parse(String(header)) : ADMIN;
    const token = req.headers['x-test-token'];
    if (token) req.apiToken = { id: 'token-de-prueba', scopes: JSON.parse(String(token)) };
    next();
  });
  app.use('/api', hideItemCosts);
  app.use('/api/items', items);
  app.use('/api/partners', partners);
  app.use('/api/partner-credit', partnerCredit);
  app.use('/api/sales-settings', salesSettings);
  app.use('/api/dunning', dunning);
  app.use('/api/recurring-documents', recurringDocuments);
  app.use('/api/series', series);
  app.use('/api/logistics', logistics);
  app.use('/api/goods-receipts', goodsReceiptsRouter);
  app.use('/api/goods-issues', goodsIssuesRouter);
  app.use('/api/transfer-notes', transferNotesRouter);
  app.use('/api/sales/invoices', salesInvoices);
  app.use('/api/purchases/invoices', purchaseInvoices);
  app.use('/api/sales/delivery-notes', salesDeliveryNotes);
  app.use('/api/documents', documents);
  app.use('/api/payments', payments);
  app.use('/api/bank-accounts', bankAccountsRouter);
  app.use('/api/bank-account-options', bankAccountOptionsRouter);
  app.use('/api/bank-statements', bankStatementsRouter);
  app.use('/api/payment-batches', paymentBatchesRouter);
  app.use('/api/reports', reports);
  app.use('/api/custom-fields', customFields);
  app.use('/api/linked-objects', linkedObjects);
  app.use('/api/document-links', documentLinks);

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;

  const api: DocumentsHarness['api'] = async (method, path, body, user, tokenScopes) => {
    const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(user ? { 'x-test-user': JSON.stringify(user) } : {}),
        ...(tokenScopes ? { 'x-test-token': JSON.stringify(tokenScopes) } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* texto o PDF */
    }
    return { status: res.status, data };
  };

  const periodId = `per-${suffix}`;
  const warehouseId = `wh-${suffix}`;
  const uomId = `uom-${suffix}`;
  const seriesId: Record<InvoiceSide, string> = {
    sales: `ser-s-${suffix}`,
    purchase: `ser-p-${suffix}`,
  };
  const tax = { general: `tax-g-${suffix}`, reduced: `tax-r-${suffix}` };

  await query(
    `INSERT INTO "AccountingPeriod" (id, code, name, "startDate", "endDate") VALUES ('${periodId}', 'P${suffix}', 'Periodo', '2026-01-01', '2026-12-31')`,
  );
  await query(`INSERT INTO "Warehouse" (id, name) VALUES ('${warehouseId}', 'Almacén')`);
  await query(
    `INSERT INTO "UnitOfMeasure" (id, code, name) VALUES ('${uomId}', 'U${suffix}', 'Unidad')`,
  );
  await query(
    `INSERT INTO "DocumentSeries" (id, name, "periodId", "docType", "firstNumber", "nextNumber", "lastNumber") VALUES
      ('${seriesId.sales}', 'Ventas', '${periodId}', 'SINV', 1, 1, 9999),
      ('${seriesId.purchase}', 'Compras', '${periodId}', 'PINV', 1, 1, 9999),
      ('sdn-${suffix}', 'Albaranes de venta', '${periodId}', 'SDN', 1, 1, 9999),
      ('pdn-${suffix}', 'Albaranes de compra', '${periodId}', 'PDN', 1, 1, 9999)`,
  );
  await query(
    `INSERT INTO "TaxGroup" (id, code, rate, category) VALUES
      ('${tax.general}', 'G${suffix}', 21, 'tax'),
      ('${tax.reduced}', 'R${suffix}', 10, 'tax')`,
  );
  for (const [kind, code] of Object.entries(ACCOUNTS)) {
    const accountId = `acc-${code}-${suffix}`;
    await query(
      `INSERT INTO "ChartOfAccount" (id, code, name, type, "isAnalytical", "isActive", "updatedAt") VALUES ('${accountId}', '${code}', '${kind}', 'asset', true, true, now())`,
    );
    await query(
      `INSERT INTO "AccountMapping" (id, kind, key, "accountId") VALUES ('${crypto.randomUUID()}', '${kind}', 'default', '${accountId}')`,
    );
  }

  let seq = 0;
  const seedPartner = async () => {
    const id = `bp-${suffix}-${++seq}`;
    await query(
      `INSERT INTO "BusinessPartner" (id, code, name) VALUES ('${id}', 'C${suffix}${seq}', 'Interlocutor ${seq}')`,
    );
    return id;
  };

  const seedItem: DocumentsHarness['seedItem'] = async (options = {}) => {
    const id = `item-${suffix}-${++seq}`;
    const { stock = 0, manageBy = 'N' } = options;
    await query(
      `INSERT INTO "Item" (id, code, name, "basePrice", "uomId", stock, "manageBy") VALUES ('${id}', 'A${suffix}${seq}', 'Artículo ${seq}', 50, '${uomId}', ${stock}, '${manageBy}')`,
    );
    if (stock > 0) {
      await query(
        `INSERT INTO "ItemWarehouseStock" ("itemId", "warehouseId", stock) VALUES ('${id}', '${options.warehouseId ?? warehouseId}', ${stock})`,
      );
    }
    return id;
  };

  const invoicePath = (side: InvoiceSide) =>
    side === 'sales' ? '/sales/invoices' : '/purchases/invoices';

  const invoice: DocumentsHarness['invoice'] = async (side, lines, extra = {}) => {
    const partnerId = (extra.partnerId as string) ?? (await seedPartner());
    const result = await api('POST', invoicePath(side), {
      seriesId: seriesId[side],
      periodId,
      partnerId,
      date: '2026-06-15',
      warehouseId,
      externalRef: `REF-${crypto.randomUUID().slice(0, 8)}`,
      lines: lines.map((line) => ({ taxGroupId: tax.general, quantity: 1, price: 50, ...line })),
      ...extra,
    });
    if (result.status !== 200) throw new Error(`No se pudo crear: ${JSON.stringify(result.data)}`);
    return result.data.id;
  };

  const post: DocumentsHarness['post'] = async (side, id) => {
    const result = await api('POST', `${invoicePath(side)}/${id}/post`);
    if (result.status !== 200) throw new Error(`No se pudo emitir: ${JSON.stringify(result.data)}`);
    return result.data;
  };

  const stockOf: DocumentsHarness['stockOf'] = async (itemId) => {
    const [item] = await query(`SELECT stock FROM "Item" WHERE id = '${itemId}'`);
    const rows = await query(
      `SELECT COALESCE(SUM(stock), 0) AS stock FROM "ItemWarehouseStock" WHERE "itemId" = '${itemId}'`,
    );
    return { global: Number(item.stock), warehouse: Number(rows[0].stock) };
  };

  const entryOf: DocumentsHarness['entryOf'] = async (invoiceId) => {
    const [entry] = await query(
      `SELECT id FROM "JournalEntry" WHERE "sourceDocumentId" = '${invoiceId}' AND status = 'posted' ORDER BY "createdAt" DESC LIMIT 1`,
    );
    if (!entry) return null;
    const lines = await query(
      `SELECT l.debit, l.credit, a.name AS kind FROM "JournalEntryLine" l JOIN "ChartOfAccount" a ON a.id = l."accountId" WHERE l."entryId" = '${entry.id}'`,
    );
    const sum = (key: string) =>
      Math.round(lines.reduce((total, l) => total + Number(l[key]), 0) * 10000) / 10000;
    return { debit: sum('debit'), credit: sum('credit'), lines };
  };

  const seedUser: DocumentsHarness['seedUser'] = async (id, permissions) => {
    const userId = `${id}-${suffix}`;
    await publicDb.execute(
      sql`INSERT INTO public."GlobalUser" (id, email, username, password) VALUES (${userId}, ${`${userId}@example.com`}, ${userId}, 'x')`,
    );
    await publicDb.execute(
      sql`INSERT INTO public."UserTenantMembership" (id, "userId", "tenantId", role, permissions)
          VALUES (${crypto.randomUUID()}, ${userId}, ${tenantId}, 'USER', ${JSON.stringify(permissions)})`,
    );
    invalidatePermissions(userId);
    return { id: userId, role: 'USER' };
  };

  const seedAdmin: DocumentsHarness['seedAdmin'] = async (id) => {
    const userId = `${id}-${suffix}`;
    await publicDb.execute(
      sql`INSERT INTO public."GlobalUser" (id, email, username, password) VALUES (${userId}, ${`${userId}@example.com`}, ${userId}, 'x')`,
    );
    await publicDb.execute(
      sql`INSERT INTO public."UserTenantMembership" (id, "userId", "tenantId", role) VALUES (${crypto.randomUUID()}, ${userId}, ${tenantId}, 'ADMIN')`,
    );
    return { id: userId, role: 'ADMIN' };
  };

  const close = async () => {
    await new Promise((resolve) => server.close(resolve));
    await drop();
  };

  return {
    tenantId,
    schemaName,
    db,
    publicDb,
    query,
    api,
    seedUser,
    seedAdmin,
    warehouseId,
    periodId,
    seriesId,
    tax,
    seedPartner,
    seedItem,
    invoice,
    post,
    invoicePath,
    stockOf,
    entryOf,
    close,
  };
}
