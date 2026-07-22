import { DocumentEngine, type DocumentCreateRequest } from '../documents/DocumentEngine';
import { DocumentRegistry } from '../documents/DocumentRegistry';
import { PluginFieldManager } from './PluginFieldManager';
import { ClientFactory } from '../tenant/ClientFactory';
import { AuthService } from '../auth/AuthService';
import { eq, and, asc, gte, lte } from 'drizzle-orm';
import * as crypto from 'crypto';
import * as schema from '../../db/schema';
import {
  JournalEngine,
  type JournalEntryInput,
  type JournalLineInput,
} from '../accounting/JournalEngine';
import { PeriodCloseEngine } from '../accounting/PeriodCloseEngine';
type DocType = 'SINV' | 'PINV' | 'SO' | 'PO' | 'SDN' | 'PDN';

/**
 * Línea de un documento DI API.
 */
interface DiLine {
  itemId: string;
  quantity: number;
  price: number;
  taxGroupId: string;
  warehouseId?: string;
  zoneId?: string;
  uomId?: string;
  uomFactor?: number;
  batchDetails?: Array<{ batchNum: string; quantity: number; expiryDate?: Date; zoneId?: string }>;
  pluginData?: Record<string, any>;
  [key: string]: any;
}

/**
 * Clase base para todos los objetos de negocio de tipo Documento.
 * Los tipos concretos (SalesInvoice, PurchaseOrder, etc.) heredan de aquí
 * y sólo definen su configuración — toda la lógica la comparten.
 *
 * Uso (desde un plugin):
 *   const inv = diApi.salesInvoice();
 *   inv.partnerId = '...';
 *   inv.addLine({ itemId: '...', quantity: 5, price: 100 });
 *   const result = await inv.save();
 *
 * Uso (desde la DI REST API):
 *   POST /api/di/documents/SINV → internamente crea una instancia y llama save()
 */
export abstract class DiDocument {
  /** ID del documento — se asigna al crear la instancia, antes de save(). */
  readonly id: string = crypto.randomUUID();

  partnerId = '';
  seriesId = '';
  periodId = '';
  date: Date | string = new Date();
  warehouseId?: string;
  billToAddress?: string;
  shipToAddress?: string;
  deliveryDate?: Date | string;
  orderId?: string;
  customFields: Record<string, any> = {};
  protected _lines: DiLine[] = [];

  abstract readonly docType: DocType;
  abstract readonly tableName: string;
  abstract readonly schemaTable: any;
  abstract readonly lineSchemaTable: any;
  abstract readonly batchSchemaTable: any | null;
  abstract readonly eventPrefix: string;
  abstract readonly stockAction: 'IN' | 'OUT' | 'NONE';
  abstract readonly closeBaseDocuments: boolean;
  abstract readonly initialStatus: string;

  addLine(line: DiLine): this {
    this._lines.push(line);
    return this;
  }

  get lines(): readonly DiLine[] {
    return this._lines;
  }

  /**
   * Construye el request body para DocumentEngine.create
   */
  toCreateRequest(): DocumentCreateRequest & Record<string, any> {
    return {
      id: this.id,
      seriesId: this.seriesId,
      periodId: this.periodId,
      partnerId: this.partnerId,
      date: this.date,
      warehouseId: this.warehouseId,
      billToAddress: this.billToAddress,
      shipToAddress: this.shipToAddress,
      deliveryDate: this.deliveryDate,
      orderId: this.orderId,
      lines: this._lines,
      ...this.customFields,
    };
  }

  /**
   * Guarda el documento en la base de datos usando DocumentEngine.
   */
  async save(tenantId: string, db: any, user: any): Promise<{ id: string; docNum: number }> {
    const pluginFields = await PluginFieldManager.validateAndExtract(
      this.eventPrefix.charAt(0).toUpperCase() + this.eventPrefix.slice(1),
      this.customFields,
      tenantId,
    );

    const request = this.toCreateRequest();
    Object.assign(request, pluginFields);

    return DocumentEngine.create(
      tenantId,
      db,
      user,
      {
        tableName: this.tableName,
        schemaTable: this.schemaTable,
        lineSchemaTable: this.lineSchemaTable,
        batchSchemaTable: this.batchSchemaTable,
        eventPrefix: this.eventPrefix,
        stockAction: this.stockAction,
        closeBaseDocuments: this.closeBaseDocuments,
        initialStatus: this.initialStatus,
        // Hooks del tipo desde el registry — sin esto, un documento creado
        // vía FactuApi (plugins, IA) se saltaría las validaciones de stock
        // y el fulfillment del pedido origen que sí aplica la UI.
        hooks: DocumentRegistry.get(this.docType).hooks,
      },
      request,
    );
  }

  /**
   * Rellena desde un body JSON (REST API).
   */
  fromBody(body: any): this {
    if (body.partnerId) this.partnerId = body.partnerId;
    if (body.seriesId) this.seriesId = body.seriesId;
    if (body.periodId) this.periodId = body.periodId;
    if (body.date) this.date = body.date;
    if (body.warehouseId) this.warehouseId = body.warehouseId;
    if (body.billToAddress) this.billToAddress = body.billToAddress;
    if (body.shipToAddress) this.shipToAddress = body.shipToAddress;
    if (body.deliveryDate) this.deliveryDate = body.deliveryDate;
    if (body.orderId) this.orderId = body.orderId;
    if (body.customFields) this.customFields = body.customFields;
    if (Array.isArray(body.lines)) {
      for (const l of body.lines) this.addLine(l);
    }
    return this;
  }
}

// ============================================================
//  Implementaciones concretas — una por tipo de documento
// ============================================================

export class SalesInvoice extends DiDocument {
  readonly docType: DocType = 'SINV';
  readonly tableName = 'salesInvoices';
  readonly schemaTable = schema.salesInvoices;
  readonly lineSchemaTable = schema.salesInvoiceLines;
  readonly batchSchemaTable = schema.salesInvoiceLineBatches;
  readonly eventPrefix = 'salesInvoice';
  readonly stockAction = 'OUT' as const;
  readonly closeBaseDocuments = true;
  readonly initialStatus = 'D';
}

export class PurchaseInvoice extends DiDocument {
  readonly docType: DocType = 'PINV';
  readonly tableName = 'purchaseInvoices';
  readonly schemaTable = schema.purchaseInvoices;
  readonly lineSchemaTable = schema.purchaseInvoiceLines;
  readonly batchSchemaTable = schema.purchaseInvoiceLineBatches;
  readonly eventPrefix = 'purchaseInvoice';
  readonly stockAction = 'IN' as const;
  readonly closeBaseDocuments = true;
  readonly initialStatus = 'D';
}

export class SalesOrder extends DiDocument {
  readonly docType: DocType = 'SO';
  readonly tableName = 'salesOrders';
  readonly schemaTable = schema.salesOrders;
  readonly lineSchemaTable = schema.salesOrderLines;
  readonly batchSchemaTable = null;
  readonly eventPrefix = 'salesOrder';
  readonly stockAction = 'NONE' as const;
  readonly closeBaseDocuments = false;
  readonly initialStatus = 'O';
}

export class PurchaseOrder extends DiDocument {
  readonly docType: DocType = 'PO';
  readonly tableName = 'purchaseOrders';
  readonly schemaTable = schema.purchaseOrders;
  readonly lineSchemaTable = schema.purchaseOrderLines;
  readonly batchSchemaTable = null;
  readonly eventPrefix = 'purchaseOrder';
  readonly stockAction = 'NONE' as const;
  readonly closeBaseDocuments = false;
  readonly initialStatus = 'O';
}

export class SalesDeliveryNote extends DiDocument {
  readonly docType: DocType = 'SDN';
  readonly tableName = 'salesDeliveryNotes';
  readonly schemaTable = schema.salesDeliveryNotes;
  readonly lineSchemaTable = schema.salesDeliveryNoteLines;
  readonly batchSchemaTable = schema.salesDeliveryNoteLineBatches;
  readonly eventPrefix = 'salesDeliveryNote';
  readonly stockAction = 'OUT' as const;
  readonly closeBaseDocuments = false;
  readonly initialStatus = 'O';
}

export class PurchaseDeliveryNote extends DiDocument {
  readonly docType: DocType = 'PDN';
  readonly tableName = 'purchaseDeliveryNotes';
  readonly schemaTable = schema.purchaseDeliveryNotes;
  readonly lineSchemaTable = schema.purchaseDeliveryNoteLines;
  readonly batchSchemaTable = schema.purchaseDeliveryNoteLineBatches;
  readonly eventPrefix = 'purchaseDeliveryNote';
  readonly stockAction = 'IN' as const;
  readonly closeBaseDocuments = false;
  readonly initialStatus = 'O';
}

// ============================================================
//  Factory — punto de entrada para crear cualquier documento
// ============================================================

const DOC_CLASSES: Record<DocType, new () => DiDocument> = {
  SINV: SalesInvoice,
  PINV: PurchaseInvoice,
  SO: SalesOrder,
  PO: PurchaseOrder,
  SDN: SalesDeliveryNote,
  PDN: PurchaseDeliveryNote,
};

/**
 * Contexto transaccional de FactuAPI.
 * Permite crear y guardar documentos dentro de una misma transacción de BD,
 * y expone helpers para consultar datos del tenant.
 */
export class FactuApiTransaction {
  constructor(
    private _tenantId: string,
    private _db: any,
    private _user: any,
  ) {}

  get tenantId() {
    return this._tenantId;
  }
  get db() {
    return this._db;
  }
  get user() {
    return this._user;
  }

  // ── Factory de documentos ──────────────────────────────────
  salesInvoice(): SalesInvoice {
    return new SalesInvoice();
  }
  purchaseInvoice(): PurchaseInvoice {
    return new PurchaseInvoice();
  }
  salesOrder(): SalesOrder {
    return new SalesOrder();
  }
  purchaseOrder(): PurchaseOrder {
    return new PurchaseOrder();
  }
  salesDeliveryNote(): SalesDeliveryNote {
    return new SalesDeliveryNote();
  }
  purchaseDeliveryNote(): PurchaseDeliveryNote {
    return new PurchaseDeliveryNote();
  }
  create(docType: DocType): DiDocument {
    const Cls = DOC_CLASSES[docType];
    if (!Cls) throw new Error(`Tipo de documento no soportado en FactuAPI: ${docType}`);
    return new Cls();
  }

  // ── Persistencia (usa la tx actual) ────────────────────────
  async save(doc: DiDocument): Promise<{ id: string; docNum: number }> {
    return doc.save(this._tenantId, this._db, this._user);
  }

  // ── Helpers de consulta ────────────────────────────────────
  async getPartner(idOrCode: string) {
    const [byId] = await this._db
      .select()
      .from(schema.businessPartners)
      .where(eq(schema.businessPartners.id, idOrCode));
    if (byId) return byId;
    const [byCode] = await this._db
      .select()
      .from(schema.businessPartners)
      .where(eq(schema.businessPartners.code, idOrCode));
    return byCode || null;
  }

  async getPartners() {
    return this._db.select().from(schema.businessPartners);
  }

  async getItem(idOrCode: string) {
    const [byId] = await this._db.select().from(schema.items).where(eq(schema.items.id, idOrCode));
    if (byId) return byId;
    const [byCode] = await this._db
      .select()
      .from(schema.items)
      .where(eq(schema.items.code, idOrCode));
    return byCode || null;
  }

  async getItems() {
    return this._db.select().from(schema.items);
  }

  async getCategories() {
    return this._db.select().from(schema.categories);
  }

  async getWarehouses() {
    return this._db.select().from(schema.warehouses);
  }

  async getSeries(docType?: string) {
    if (docType) {
      return this._db
        .select()
        .from(schema.documentSeries)
        .where(eq(schema.documentSeries.docType, docType));
    }
    return this._db.select().from(schema.documentSeries);
  }

  async getTaxGroups() {
    return this._db.select().from(schema.taxGroups);
  }

  async getCurrencies() {
    return this._db.select().from(schema.currencies);
  }

  async getPaymentMethods() {
    return this._db.select().from(schema.paymentMethods);
  }

  async getPaymentTerms() {
    return this._db.select().from(schema.paymentTerms);
  }

  async getDocumentTypes() {
    return this._db.select().from(schema.documentTypes);
  }

  async getOpenPeriods() {
    return this._db
      .select()
      .from(schema.accountingPeriods)
      .where(eq(schema.accountingPeriods.status, 'O'));
  }

  async getPeriods() {
    return this._db.select().from(schema.accountingPeriods);
  }

  // ── Pagos ──────────────────────────────────────────────────
  /**
   * Registra un cobro/pago sobre una factura. `direction` infiere el tipo
   * (sales=cobro, purchase=pago). Genera asiento automáticamente si hay
   * mapeos y una factura posted. Devuelve { id, journalEntryId }.
   */
  async registerPayment(opts: {
    invoiceId: string;
    direction: 'sales' | 'purchase';
    amount: number;
    date?: Date | string;
    reference: string; // obligatorio
    paymentMethodId?: string | null;
    notes?: string | null;
  }): Promise<{ id: string; journalEntryId: string | null }> {
    if (!opts.reference || !String(opts.reference).trim()) {
      throw new Error('reference es obligatorio');
    }
    if (!opts.amount || opts.amount <= 0) throw new Error('amount debe ser > 0');

    const invoiceTable =
      opts.direction === 'sales' ? schema.salesInvoices : schema.purchaseInvoices;
    const [invoice] = await this._db
      .select()
      .from(invoiceTable)
      .where(eq(invoiceTable.id, opts.invoiceId));
    if (!invoice) throw new Error('Factura no encontrada');

    const id = crypto.randomUUID();
    const date = opts.date
      ? typeof opts.date === 'string'
        ? opts.date
        : opts.date.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    await this._db.insert(schema.payments).values({
      id,
      salesInvoiceId: opts.direction === 'sales' ? opts.invoiceId : null,
      purchaseInvoiceId: opts.direction === 'purchase' ? opts.invoiceId : null,
      date,
      amount: String(opts.amount),
      currencyId: null,
      exchangeRate: '1',
      amountBase: String(opts.amount),
      paymentMethodId: opts.paymentMethodId || null,
      reference: opts.reference.trim(),
      notes: opts.notes || null,
      source: 'manual',
      sourceRef: null,
      createdBy: this._user?.id || null,
    });

    let journalEntryId: string | null = null;
    try {
      const je = await JournalEngine.createFromPayment(
        this._db,
        { id, amount: opts.amount, date, paymentMethodId: opts.paymentMethodId || null },
        {
          id: invoice.id,
          partnerId: invoice.partnerId,
          periodId: invoice.periodId,
          docNum: invoice.docNum,
        },
        opts.direction,
        this._user?.id,
      );
      if (je) {
        await JournalEngine.post(this._db, je.id, this._user?.id);
        journalEntryId = je.id;
      }
    } catch (err: any) {
      // best-effort — no bloquea el registro del pago
      console.warn('[FactuApi.registerPayment] No se pudo generar asiento:', err.message);
    }

    return { id, journalEntryId };
  }

  // ── Plan contable y dimensiones analíticas ─────────────────────
  async getChartOfAccounts() {
    return this._db.select().from(schema.chartOfAccounts);
  }

  async getAccount(idOrCode: string) {
    const [byId] = await this._db
      .select()
      .from(schema.chartOfAccounts)
      .where(eq(schema.chartOfAccounts.id, idOrCode));
    if (byId) return byId;
    const [byCode] = await this._db
      .select()
      .from(schema.chartOfAccounts)
      .where(eq(schema.chartOfAccounts.code, idOrCode));
    return byCode || null;
  }

  async getCostCenter(idOrCode: string) {
    const [byId] = await this._db
      .select()
      .from(schema.costCenters)
      .where(eq(schema.costCenters.id, idOrCode));
    if (byId) return byId;
    const [byCode] = await this._db
      .select()
      .from(schema.costCenters)
      .where(eq(schema.costCenters.code, idOrCode));
    return byCode || null;
  }

  async getProfitCenter(idOrCode: string) {
    const [byId] = await this._db
      .select()
      .from(schema.profitCenters)
      .where(eq(schema.profitCenters.id, idOrCode));
    if (byId) return byId;
    const [byCode] = await this._db
      .select()
      .from(schema.profitCenters)
      .where(eq(schema.profitCenters.code, idOrCode));
    return byCode || null;
  }

  async getInternalOrder(idOrCode: string) {
    const [byId] = await this._db
      .select()
      .from(schema.internalOrders)
      .where(eq(schema.internalOrders.id, idOrCode));
    if (byId) return byId;
    const [byCode] = await this._db
      .select()
      .from(schema.internalOrders)
      .where(eq(schema.internalOrders.code, idOrCode));
    return byCode || null;
  }

  // ── Asientos contables ─────────────────────────────────────────
  /** Factory de asiento — se usa como los documentos. */
  journalEntry(): JournalEntry {
    return new JournalEntry();
  }

  /** Postea un asiento draft. */
  async postJournalEntry(entryId: string) {
    return JournalEngine.post(this._db, entryId, this._user?.id);
  }

  /** Reversa un asiento posted. */
  async reverseJournalEntry(entryId: string, description?: string) {
    return JournalEngine.reverse(this._db, entryId, this._user?.id, description);
  }

  /** Resuelve cuenta por kind (+key opcional). */
  async resolveAccount(kind: string, key?: string | null) {
    return JournalEngine.resolveAccount(this._db, kind, key);
  }

  /** Genera y postea asiento desde una factura de venta ya cargada. */
  async createEntryFromSalesInvoice(invoice: any, lines: any[] = []) {
    const r = await JournalEngine.createFromSalesInvoice(this._db, invoice, lines, this._user?.id);
    if (r) await JournalEngine.post(this._db, r.id, this._user?.id);
    return r;
  }

  /** Genera y postea asiento desde una factura de compra. */
  async createEntryFromPurchaseInvoice(invoice: any, lines: any[] = []) {
    const r = await JournalEngine.createFromPurchaseInvoice(
      this._db,
      invoice,
      lines,
      this._user?.id,
    );
    if (r) await JournalEngine.post(this._db, r.id, this._user?.id);
    return r;
  }

  /** Genera y postea asiento desde un cobro/pago. */
  async createEntryFromPayment(
    payment: any,
    invoice: { id: string; partnerId: string; periodId: string; docNum?: number },
    direction: 'sales' | 'purchase',
  ) {
    const r = await JournalEngine.createFromPayment(
      this._db,
      payment,
      invoice,
      direction,
      this._user?.id,
    );
    if (r) await JournalEngine.post(this._db, r.id, this._user?.id);
    return r;
  }

  // ── Cierre de período ──────────────────────────────────────────
  async previewPeriodClose(periodId: string) {
    return PeriodCloseEngine.preview(this._db, periodId);
  }

  async closePeriod(periodId: string) {
    return PeriodCloseEngine.close(this._db, periodId, this._user?.id);
  }

  // ── RRHH ───────────────────────────────────────────────────────
  async getEmployees() {
    return this._db.select().from(schema.employees);
  }

  async getEmployee(idOrCode: string) {
    const [byId] = await this._db
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.id, idOrCode));
    if (byId) return byId;
    const [byCode] = await this._db
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.code, idOrCode));
    return byCode || null;
  }

  async getDepartment(idOrCode: string) {
    const [byId] = await this._db
      .select()
      .from(schema.departments)
      .where(eq(schema.departments.id, idOrCode));
    if (byId) return byId;
    const [byCode] = await this._db
      .select()
      .from(schema.departments)
      .where(eq(schema.departments.code, idOrCode));
    return byCode || null;
  }

  /**
   * Aprueba una nómina y genera asiento. Equivalente a POST /hr/payrolls/:id/approve
   * pero usable desde plugins.
   */
  async approvePayroll(payrollId: string, periodId?: string) {
    const [payroll] = await this._db
      .select()
      .from(schema.payrolls)
      .where(eq(schema.payrolls.id, payrollId));
    if (!payroll) throw new Error('Nómina no existe');
    const [employee] = await this._db
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.id, payroll.employeeId));
    if (!employee) throw new Error('Empleado no existe');
    let pid = periodId;
    if (!pid) {
      const [open] = await this._db
        .select()
        .from(schema.accountingPeriods)
        .where(eq(schema.accountingPeriods.status, 'O'))
        .limit(1);
      pid = open?.id;
    }
    if (!pid) throw new Error('No hay período abierto');
    const entry = await JournalEngine.createFromPayroll(
      this._db,
      payroll,
      {
        id: employee.id,
        costCenterId: employee.costCenterId,
        profitCenterId: employee.profitCenterId,
      },
      pid,
      this._user?.id,
    );
    if (entry) await JournalEngine.post(this._db, entry.id, this._user?.id);
    await this._db
      .update(schema.payrolls)
      .set({
        status: 'approved',
        journalEntryId: entry?.id || null,
        approvedAt: new Date(),
        approvedBy: this._user?.id,
      })
      .where(eq(schema.payrolls.id, payrollId));
    return entry;
  }

  async getDimensionRule(accountId: string) {
    const [r] = await this._db
      .select()
      .from(schema.dimensionRules)
      .where(eq(schema.dimensionRules.accountId, accountId));
    return r || null;
  }

  // ── RRHH avanzado ──────────────────────────────────────────────
  /** Lista contratos. Si pasas employeeId, devuelve sólo los de ese empleado. */
  async getContracts(opts?: { employeeId?: string; activeOnly?: boolean }) {
    const conds: any[] = [];
    if (opts?.employeeId) conds.push(eq(schema.contracts.employeeId, opts.employeeId));
    if (opts?.activeOnly) conds.push(eq(schema.contracts.isActive, true));
    return this._db
      .select()
      .from(schema.contracts)
      .where(conds.length ? and(...conds) : undefined);
  }

  /** Catálogo de conceptos de nómina. */
  async getPayrollConcepts(opts?: { activeOnly?: boolean }) {
    if (opts?.activeOnly) {
      return this._db
        .select()
        .from(schema.payrollConcepts)
        .where(eq(schema.payrollConcepts.isActive, true));
    }
    return this._db.select().from(schema.payrollConcepts);
  }

  /** Lista nóminas con filtros opcionales. */
  async getPayrolls(opts?: { employeeId?: string; year?: number; month?: number }) {
    const conds: any[] = [];
    if (opts?.employeeId) conds.push(eq(schema.payrolls.employeeId, opts.employeeId));
    if (opts?.year != null) conds.push(eq(schema.payrolls.periodYear, opts.year));
    if (opts?.month != null) conds.push(eq(schema.payrolls.periodMonth, opts.month));
    return this._db
      .select()
      .from(schema.payrolls)
      .where(conds.length ? and(...conds) : undefined);
  }

  /** Devuelve la nómina con sus líneas resueltas. */
  async getPayroll(id: string) {
    const [p] = await this._db.select().from(schema.payrolls).where(eq(schema.payrolls.id, id));
    if (!p) return null;
    const lines = await this._db
      .select()
      .from(schema.payrollLines)
      .where(eq(schema.payrollLines.payrollId, id));
    return { ...p, lines };
  }

  /** Añade una línea a una nómina existente (devengo/deducción/aportación). */
  async addPayrollLine(
    payrollId: string,
    line: {
      conceptId?: string | null;
      concept: string;
      type: 'earning' | 'deduction' | 'employer_cost';
      quantity?: number | null;
      rate?: number | null;
      baseAmount?: number | null;
      amount: number;
      accountId?: string | null;
    },
  ) {
    const id = crypto.randomUUID();
    const [row] = await this._db
      .insert(schema.payrollLines)
      .values({
        id,
        payrollId,
        conceptId: line.conceptId || null,
        concept: line.concept,
        type: line.type,
        quantity: line.quantity != null ? String(line.quantity) : null,
        rate: line.rate != null ? String(line.rate) : null,
        baseAmount: line.baseAmount != null ? String(line.baseAmount) : null,
        amount: String(line.amount),
        accountId: line.accountId || null,
      })
      .returning();
    return row;
  }

  /** Lee fichajes con filtros opcionales (rango, empleado, tipo). */
  async getTimeclockEntries(opts?: {
    employeeId?: string;
    from?: Date | string;
    to?: Date | string;
    kind?: 'in' | 'out' | 'break_start' | 'break_end';
  }) {
    const conds: any[] = [];
    if (opts?.employeeId) conds.push(eq(schema.timeclockEntries.employeeId, opts.employeeId));
    if (opts?.from)
      conds.push(
        gte(
          schema.timeclockEntries.at,
          typeof opts.from === 'string' ? new Date(opts.from) : opts.from,
        ),
      );
    if (opts?.to)
      conds.push(
        lte(schema.timeclockEntries.at, typeof opts.to === 'string' ? new Date(opts.to) : opts.to),
      );
    if (opts?.kind) conds.push(eq(schema.timeclockEntries.kind, opts.kind));
    return this._db
      .select()
      .from(schema.timeclockEntries)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(schema.timeclockEntries.at));
  }

  /** Registra un fichaje sin pasar por la state-machine (uso administrativo). */
  async addTimeclockEntry(entry: {
    employeeId: string;
    kind: 'in' | 'out' | 'break_start' | 'break_end';
    at?: Date | string;
    source?: 'web' | 'kiosk' | 'admin';
    notes?: string;
  }) {
    const id = crypto.randomUUID();
    const [row] = await this._db
      .insert(schema.timeclockEntries)
      .values({
        id,
        employeeId: entry.employeeId,
        kind: entry.kind,
        at: entry.at ? (typeof entry.at === 'string' ? new Date(entry.at) : entry.at) : new Date(),
        source: entry.source || 'admin',
        notes: entry.notes || null,
        userId: this._user?.id || null,
      })
      .returning();
    return row;
  }

  /** Asignaciones de turno en un rango (planificación materializada). */
  async getShiftAssignments(opts?: { employeeId?: string; from?: string; to?: string }) {
    const conds: any[] = [];
    if (opts?.employeeId) conds.push(eq(schema.shiftAssignments.employeeId, opts.employeeId));
    if (opts?.from) conds.push(gte(schema.shiftAssignments.date, opts.from));
    if (opts?.to) conds.push(lte(schema.shiftAssignments.date, opts.to));
    return this._db
      .select()
      .from(schema.shiftAssignments)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(schema.shiftAssignments.date));
  }

  /** Plantillas de turno (catálogo). */
  async getShiftTemplates() {
    return this._db.select().from(schema.shiftTemplates);
  }

  /** Tipos de incidencia (catálogo). */
  async getIncidentTypes() {
    return this._db.select().from(schema.incidentTypes);
  }

  /** Incidencias con filtros opcionales. */
  async getIncidents(opts?: {
    employeeId?: string;
    status?: 'pending' | 'approved' | 'rejected' | 'covered';
    from?: Date | string;
    to?: Date | string;
  }) {
    const conds: any[] = [];
    if (opts?.employeeId) conds.push(eq(schema.incidents.employeeId, opts.employeeId));
    if (opts?.status) conds.push(eq(schema.incidents.status, opts.status));
    if (opts?.from)
      conds.push(
        gte(
          schema.incidents.startAt,
          typeof opts.from === 'string' ? new Date(opts.from) : opts.from,
        ),
      );
    if (opts?.to)
      conds.push(
        lte(schema.incidents.startAt, typeof opts.to === 'string' ? new Date(opts.to) : opts.to),
      );
    return this._db
      .select()
      .from(schema.incidents)
      .where(conds.length ? and(...conds) : undefined);
  }

  // ── RRHH avanzado+ ─────────────────────────────────────────────
  async getCollectiveAgreements() {
    return this._db.select().from(schema.collectiveAgreements);
  }

  async getEvaluations(opts?: { cycleId?: string; employeeId?: string }) {
    const conds: any[] = [];
    if (opts?.cycleId) conds.push(eq(schema.employeeEvaluations.cycleId, opts.cycleId));
    if (opts?.employeeId) conds.push(eq(schema.employeeEvaluations.employeeId, opts.employeeId));
    return this._db
      .select()
      .from(schema.employeeEvaluations)
      .where(conds.length ? and(...conds) : undefined);
  }

  async getObjectives(opts?: { employeeId?: string; status?: string }) {
    const conds: any[] = [];
    if (opts?.employeeId) conds.push(eq(schema.employeeObjectives.employeeId, opts.employeeId));
    if (opts?.status) conds.push(eq(schema.employeeObjectives.status, opts.status));
    return this._db
      .select()
      .from(schema.employeeObjectives)
      .where(conds.length ? and(...conds) : undefined);
  }

  async getCommissionRules() {
    return this._db.select().from(schema.commissionRules);
  }

  async getCommissionAccruals(opts?: {
    employeeId?: string;
    status?: 'pending' | 'paid' | 'cancelled';
    year?: number;
    month?: number;
  }) {
    const conds: any[] = [];
    if (opts?.employeeId) conds.push(eq(schema.commissionAccruals.employeeId, opts.employeeId));
    if (opts?.status) conds.push(eq(schema.commissionAccruals.status, opts.status));
    if (opts?.year != null) conds.push(eq(schema.commissionAccruals.periodYear, opts.year));
    if (opts?.month != null) conds.push(eq(schema.commissionAccruals.periodMonth, opts.month));
    return this._db
      .select()
      .from(schema.commissionAccruals)
      .where(conds.length ? and(...conds) : undefined);
  }

  async getTasks(opts?: { assigneeId?: string; status?: string; projectId?: string }) {
    const conds: any[] = [];
    if (opts?.assigneeId) conds.push(eq(schema.tasks.assigneeId, opts.assigneeId));
    if (opts?.status) conds.push(eq(schema.tasks.status, opts.status));
    if (opts?.projectId) conds.push(eq(schema.tasks.internalOrderId, opts.projectId));
    return this._db
      .select()
      .from(schema.tasks)
      .where(conds.length ? and(...conds) : undefined);
  }

  async createTask(task: {
    title: string;
    description?: string;
    status?: string;
    priority?: string;
    assigneeId?: string;
    internalOrderId?: string;
    departmentId?: string;
    startDate?: string;
    dueDate?: string;
    estimatedHours?: number;
  }) {
    const id = crypto.randomUUID();
    // Próximo código TSK-NNNNN secuencial.
    const [last] = await this._db
      .select({ code: schema.tasks.code })
      .from(schema.tasks)
      .orderBy(eq(schema.tasks.code, schema.tasks.code))
      .limit(1);
    const code = `TSK-${String(Date.now()).slice(-5)}`;
    void last;
    const [row] = await this._db
      .insert(schema.tasks)
      .values({
        id,
        code,
        title: task.title,
        description: task.description || null,
        status: task.status || 'todo',
        priority: task.priority || 'normal',
        assigneeId: task.assigneeId || null,
        internalOrderId: task.internalOrderId || null,
        departmentId: task.departmentId || null,
        startDate: task.startDate || null,
        dueDate: task.dueDate || null,
        estimatedHours: task.estimatedHours != null ? String(task.estimatedHours) : null,
      })
      .returning();
    return row;
  }

  async updateTask(id: string, patch: Record<string, any>) {
    const [row] = await this._db
      .update(schema.tasks)
      .set(patch)
      .where(eq(schema.tasks.id, id))
      .returning();
    return row;
  }

  async getGantt(opts?: { from?: string; to?: string; projectId?: string }) {
    const conds: any[] = [];
    if (opts?.projectId) conds.push(eq(schema.tasks.internalOrderId, opts.projectId));
    if (opts?.from) conds.push(gte(schema.tasks.startDate, opts.from));
    if (opts?.to) conds.push(lte(schema.tasks.dueDate, opts.to));
    const tasks = await this._db
      .select()
      .from(schema.tasks)
      .where(conds.length ? and(...conds) : undefined);
    const dependencies = await this._db.select().from(schema.taskDependencies);
    return { tasks, dependencies };
  }
}

// ============================================================
//  JournalEntry — objeto de negocio fluido para asientos
// ============================================================

/**
 * Asiento contable fluido, análogo a `DiDocument`. Uso:
 *
 *   const je = tx.journalEntry();
 *   je.date = new Date();
 *   je.periodId = '...';
 *   je.description = 'Asiento manual';
 *   je.addLine({ accountId: '430...', debit: 121, partnerId: '...' });
 *   je.addLine({ accountId: '700...', credit: 100 });
 *   je.addLine({ accountId: '477...', credit: 21 });
 *   const { id } = await je.save(tx.db);
 *   await tx.postJournalEntry(id);
 */
export class JournalEntry {
  readonly id: string = crypto.randomUUID();
  date: Date | string = new Date();
  periodId = '';
  description: string | null = null;
  source: JournalEntryInput['source'] = 'manual';
  sourceDocumentId: string | null = null;
  protected _lines: JournalLineInput[] = [];

  addLine(line: JournalLineInput): this {
    this._lines.push(line);
    return this;
  }

  get lines(): readonly JournalLineInput[] {
    return this._lines;
  }

  async save(db: any, userId?: string | null): Promise<{ id: string }> {
    return JournalEngine.create(db, {
      date: this.date,
      periodId: this.periodId,
      description: this.description,
      source: this.source,
      sourceDocumentId: this.sourceDocumentId,
      createdBy: userId,
      lines: this._lines,
    });
  }
}

/**
 * Factory principal de FactuAPI.
 *
 *   const doc = FactuApi.create('SINV');
 *   doc.partnerId = '...';
 *   doc.addLine({ ... });
 *   await doc.save(tenantId, db, user);
 *
 * Transacción atómica:
 *   await FactuApi.transaction(tenantId, db, user, async (tx) => {
 *     const sdn = tx.salesDeliveryNote();
 *     sdn.partnerId = '...';
 *     sdn.addLine({ ... });
 *     await tx.save(sdn);
 *
 *     const inv = tx.salesInvoice();
 *     inv.addLine({ baseType: 'SDN', baseId: sdn.id, ... });
 *     await tx.save(inv);
 *   });
 */
export class FactuApi {
  static create(docType: DocType): DiDocument {
    const Cls = DOC_CLASSES[docType];
    if (!Cls) throw new Error(`Tipo de documento no soportado en FactuAPI: ${docType}`);
    return new Cls();
  }

  static salesInvoice(): SalesInvoice {
    return new SalesInvoice();
  }
  static purchaseInvoice(): PurchaseInvoice {
    return new PurchaseInvoice();
  }
  static salesOrder(): SalesOrder {
    return new SalesOrder();
  }
  static purchaseOrder(): PurchaseOrder {
    return new PurchaseOrder();
  }
  static salesDeliveryNote(): SalesDeliveryNote {
    return new SalesDeliveryNote();
  }
  static purchaseDeliveryNote(): PurchaseDeliveryNote {
    return new PurchaseDeliveryNote();
  }

  /**
   * Ejecuta un callback dentro de una transacción de BD.
   * Si el callback lanza un error, se hace rollback de todo.
   */
  static async transaction<T>(
    tenantId: string,
    db: any,
    user: any,
    fn: (tx: FactuApiTransaction) => Promise<T>,
  ): Promise<T> {
    return db.transaction(async (txClient: any) => {
      const txApi = new FactuApiTransaction(tenantId, txClient, user);
      return fn(txApi);
    });
  }

  /**
   * Conecta a la BD de un tenant para consultas (sin transacción explícita).
   */
  static connect(tenantId: string, db: any, user: any): FactuApiTransaction {
    return new FactuApiTransaction(tenantId, db, user);
  }

  // ── Tenant & Auth ──────────────────────────────────────────

  /**
   * Lista todos los tenants disponibles.
   *
   *   const tenants = await FactuApi.getTenants();
   *   // [{ id: 'abc-123', name: 'Mi Empresa', schemaName: 'tenant_mi_empresa' }, ...]
   */
  static async getTenants() {
    const publicDb = ClientFactory.getClient('public');
    return publicDb.select().from(schema.tenants);
  }

  /**
   * Obtiene un tenant por ID.
   *
   *   const tenant = await FactuApi.getTenant('abc-123');
   */
  static async getTenant(tenantId: string) {
    const publicDb = ClientFactory.getClient('public');
    const [tenant] = await publicDb
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId));
    return tenant || null;
  }

  /**
   * Busca un tenant por nombre.
   *
   *   const tenant = await FactuApi.getTenantByName('Mi Empresa');
   */
  static async getTenantByName(name: string) {
    const publicDb = ClientFactory.getClient('public');
    const [tenant] = await publicDb
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.name, name));
    return tenant || null;
  }

  /**
   * Obtiene el cliente de BD para un tenant (resuelve tenantId → schema → drizzle client).
   *
   *   const db = await FactuApi.getTenantDb('abc-123');
   *   // Ahora puedes usar: FactuApi.connect('abc-123', db, user)
   */
  static async getTenantDb(tenantId: string) {
    return ClientFactory.getTenantClient(tenantId);
  }

  /**
   * Autentica un usuario por email/username y password.
   * Devuelve el usuario y los tenants a los que tiene acceso.
   *
   *   const session = await FactuApi.login('admin@openfactu.com', 'admin123');
   *   // session.user     → { id, email, username, role }
   *   // session.tenants  → [{ tenantId, tenantName, role, permissions }]
   *   // session.token    → JWT string
   */
  static async login(emailOrUsername: string, password: string) {
    const publicDb = ClientFactory.getClient('public');

    // Buscar usuario por email o username
    const [byEmail] = await publicDb
      .select()
      .from(schema.globalUsers)
      .where(eq(schema.globalUsers.email, emailOrUsername));
    const [byUsername] = !byEmail
      ? await publicDb
          .select()
          .from(schema.globalUsers)
          .where(eq(schema.globalUsers.username, emailOrUsername))
      : [byEmail];

    const user = byEmail || byUsername;
    if (!user) throw new Error('Usuario no encontrado');

    const valid = await AuthService.verifyPassword(password, user.password);
    if (!valid) throw new Error('Contraseña incorrecta');

    // Resolver tenants accesibles
    let accessibleTenants: Array<{
      tenantId: string;
      tenantName: string;
      role: string;
      permissions: any;
    }> = [];

    if (user.role === 'SUPERUSER') {
      // Superuser accede a todo
      const allTenants = await publicDb.select().from(schema.tenants);
      accessibleTenants = allTenants.map((t: any) => ({
        tenantId: t.id,
        tenantName: t.name,
        role: 'SUPERUSER',
        permissions: null,
      }));
    } else {
      // Buscar membresías
      const memberships = await publicDb
        .select()
        .from(schema.userTenantMemberships)
        .where(eq(schema.userTenantMemberships.userId, user.id));

      if (memberships.length > 0) {
        const allTenants = await publicDb.select().from(schema.tenants);
        const tenantMap = new Map(allTenants.map((t: any) => [t.id, t]));

        accessibleTenants = memberships.map((m: any) => ({
          tenantId: m.tenantId,
          tenantName: (tenantMap.get(m.tenantId) as any)?.name || 'Unknown',
          role: m.role,
          permissions: m.permissions ? JSON.parse(m.permissions) : null,
        }));
      } else if (user.tenantId) {
        // Fallback legacy: user.tenantId directo
        const tenant = await FactuApi.getTenant(user.tenantId);
        if (tenant) {
          accessibleTenants = [
            {
              tenantId: tenant.id,
              tenantName: tenant.name,
              role: user.role,
              permissions: user.permissions ? JSON.parse(user.permissions) : null,
            },
          ];
        }
      }
    }

    // Generar token JWT (con el primer tenant por defecto)
    const defaultTenantId = accessibleTenants[0]?.tenantId || null;
    const token = AuthService.generateToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      tenantId: defaultTenantId,
    });

    return {
      user: { id: user.id, email: user.email, username: user.username, role: user.role },
      tenants: accessibleTenants,
      token,
    };
  }

  /**
   * Flujo completo: login + seleccionar tenant + obtener conexión lista para operar.
   *
   *   const ctx = await FactuApi.session('admin@openfactu.com', 'admin123', 'Mi Empresa');
   *   // ctx.tenantId  → 'abc-123'
   *   // ctx.db        → drizzle client del tenant
   *   // ctx.user      → { id, email, username, role }
   *   // ctx.api       → FactuApiTransaction lista para usar
   *
   *   // Crear factura directamente:
   *   const inv = ctx.api.salesInvoice();
   *   inv.partnerId = '...';
   *   await ctx.api.save(inv);
   *
   *   // O usar transacción:
   *   await FactuApi.transaction(ctx.tenantId, ctx.db, ctx.user, async (tx) => { ... });
   */
  static async session(emailOrUsername: string, password: string, tenantName?: string) {
    const loginResult = await FactuApi.login(emailOrUsername, password);

    if (loginResult.tenants.length === 0) {
      throw new Error('El usuario no tiene acceso a ningún tenant');
    }

    // Seleccionar tenant por nombre o usar el primero
    let selected = loginResult.tenants[0];
    if (tenantName) {
      const found = loginResult.tenants.find(
        (t) => t.tenantName.toLowerCase() === tenantName.toLowerCase(),
      );
      if (!found) {
        const available = loginResult.tenants.map((t) => t.tenantName).join(', ');
        throw new Error(`Tenant "${tenantName}" no accesible. Disponibles: ${available}`);
      }
      selected = found;
    }

    const db = await FactuApi.getTenantDb(selected.tenantId);
    const user = { ...loginResult.user, tenantId: selected.tenantId };
    const api = new FactuApiTransaction(selected.tenantId, db, user);

    return {
      tenantId: selected.tenantId,
      tenantName: selected.tenantName,
      db,
      user,
      token: loginResult.token,
      api,
    };
  }

  /**
   * Cierra todas las conexiones. Llamar al finalizar la aplicación.
   */
  static async disconnect() {
    await ClientFactory.disconnectAll();
  }
}
