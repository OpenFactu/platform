/**
 * Abonos: corregir una factura emitida con otra en negativo.
 *
 * Es una factura más, con un tipo `isRectify`, para que series, impuestos, PDF,
 * conectores fiscales y plugins funcionen sin saber nada de esto; y va en negativo para
 * que los informes y el libro de impuestos, que suman líneas, salgan netos.
 *
 * Cada línea apunta a la de su factura (`baseType`, `baseId`, `baseLine`). Como la
 * factura ya movió su stock, el abono no mueve nada salvo que la mercancía vuelva.
 */
import { openPeriodsFor } from '../accounting/periodRules';
import { and, desc, eq, ne, sql, asc } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { DocumentEngine } from './DocumentEngine';
import { lockDeliveryNote, receiptReturnsByLine } from './deliveryReturns';
import { DocumentRegistry, type DocumentTypeConfig } from './DocumentRegistry';
import { hydrate } from './documentChain';
import { remaining } from './creditNoteMoney';

export type InvoiceSide = 'sales' | 'purchase';

const DOC_TYPE: Record<InvoiceSide, 'SINV' | 'PINV'> = { sales: 'SINV', purchase: 'PINV' };

export interface CreditableBatch {
  batchNum: string;
  /** Lo que salió de este lote y aún no ha vuelto. */
  available: number;
}

export interface CreditableLine {
  lineId: string;
  lineNum: number;
  itemId: string;
  itemName: string | null;
  description: string | null;
  price: number;
  invoiced: number;
  credited: number;
  available: number;
  /** Lo que ya ha vuelto por una devolución de logística, en la unidad de la línea. */
  returnedByLogistics: number;
  /** Lo que todavía puede volver con un abono. */
  returnable: number;
  /** Lo que ha vuelto con una entrada y sigue facturado: falta su abono. */
  returnedUncredited: number;
  /** Lo que vale cada unidad facturada, con su descuento: para anunciar el total del abono. */
  unitNet: number;
  unitTax: number;
  unitWithholding: number;
  itemCode: string | null;
  taxGroupId: string | null;
  uomId: string | null;
  uomFactor: number;
  internalOrderId: string | null;
  /** Las columnas `p_*` de la línea: el abono las hereda y se enseñan como en la factura. */
  customFields: Record<string, unknown>;
  warehouseId: string | null;
  /** Se gestiona por lotes o series: devolverlo exige saber de cuáles salió. */
  tracked: boolean;
  batches: CreditableBatch[];
}

export interface CreditNoteInput {
  lines: Array<{
    lineId: string;
    quantity: number;
    returnStock?: boolean;
    warehouseId?: string | null;
    zoneId?: string | null;
  }>;
  reason: string;
  rectifyType?: string;
  documentTypeId?: string;
  seriesId?: string;
  date?: string;
  /** Solo en compras: el número del abono que manda el proveedor. */
  externalRef?: string;
}

function httpError(statusCode: number, message: string): Error {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  return err;
}

const definitionOf = (config: DocumentTypeConfig) => ({
  tableName: config.tableName,
  schemaTable: config.schemaTable,
  lineSchemaTable: config.lineSchemaTable,
  batchSchemaTable: config.batchSchemaTable,
  eventPrefix: config.eventPrefix,
  stockAction: config.stockAction,
  closeBaseDocuments: config.closeBaseDocuments,
  initialStatus: config.initialStatus,
  hooks: config.hooks,
});

/** Las columnas `p_*` de los campos personalizados, que Drizzle no proyecta. */
async function customFieldsById(db: any, pgTable: string, where: any) {
  const result: any = await db.execute(
    sql`SELECT * FROM ${sql.identifier(pgTable)} WHERE ${where}`,
  );
  const byId = new Map<string, Record<string, unknown>>();
  for (const row of result.rows ?? result) {
    const own = Object.entries(row).filter(([key]) => key.startsWith('p_'));
    byId.set(row.id, Object.fromEntries(own));
  }
  return byId;
}

const perUnit = (amount: number, quantity: number) =>
  quantity ? Math.round((amount / quantity) * 1e6) / 1e6 : 0;

/** Lo que hace falta para crear un abono: su factura, las líneas y los tipos rectificativos. */
/**
 * Los abonos de una factura, sin los cancelados, y si queda algo por abonar. `available`
 * es lo que un abono tiene a favor del interlocutor: en borrador todavía nada.
 */
export async function invoiceCreditNotes(db: any, side: InvoiceSide, invoiceId: string) {
  const docType = DOC_TYPE[side];
  const table = DocumentRegistry.get(docType).schemaTable;
  const rows = await db
    .select()
    .from(table)
    .where(and(eq(table.rectifiesInvoiceId, invoiceId), ne(table.status, 'X')))
    .orderBy(asc(table.date));
  const [docs, lines] = await Promise.all([
    rows.length
      ? hydrate(
          db,
          docType as any,
          rows.map((row: any) => row.id),
        )
      : [],
    creditableLines(db, side, invoiceId),
  ]);
  return {
    notes: rows.map((row: any) => {
      const doc: any = docs.find((d: any) => d.id === row.id);
      return {
        id: row.id,
        code: doc?.code ?? String(row.docNum),
        documentTypeName: doc?.documentTypeName ?? null,
        date: row.date,
        status: row.status,
        total: Number(row.total),
        available: row.status === 'O' ? remaining(row) : 0,
      };
    }),
    creditable: lines.some((line) => line.available > 0),
    // Lo que ha vuelto por logística y sigue sin abonar: la factura lo dice hasta que se abona.
    pendingReturn: lines.reduce((sum, line) => sum + line.returnedUncredited, 0),
  };
}

export async function creditNotePreparation(db: any, side: InvoiceSide, invoiceId: string) {
  const docType = DOC_TYPE[side];
  const [invoice] = await hydrate(db, docType as any, [invoiceId]);
  if (!invoice) throw httpError(404, 'Factura no encontrada.');
  const [partner] = await db
    .select({ name: schema.businessPartners.name })
    .from(schema.businessPartners)
    .where(eq(schema.businessPartners.id, invoice.partnerId));
  const [lines, documentTypes] = await Promise.all([
    creditableLines(db, side, invoiceId),
    db
      .select()
      .from(schema.documentTypes)
      .where(and(eq(schema.documentTypes.isRectify, true), eq(schema.documentTypes.isActive, true)))
      .orderBy(asc(schema.documentTypes.sortOrder)),
  ]);
  return { invoice: { ...invoice, partnerName: partner?.name ?? null }, lines, documentTypes };
}

/**
 * Una factura que viene de un albarán no lleva lotes: los movió el albarán. Para
 * devolver la mercancía hay que mirarlos allí.
 */
async function deliveryNoteBatches(db: any, line: any): Promise<any[]> {
  if (!line.baseType || !line.baseId || !line.baseLine) return [];
  if (!DocumentRegistry.has(line.baseType)) return [];
  const base = DocumentRegistry.get(line.baseType);
  if (base.category !== 'delivery_note' || !base.batchSchemaTable) return [];
  const [baseLine] = await db
    .select({ id: base.lineSchemaTable.id })
    .from(base.lineSchemaTable)
    .where(
      and(
        eq(base.lineSchemaTable[base.lineFk], line.baseId),
        eq(base.lineSchemaTable.lineNum, line.baseLine),
      ),
    );
  if (!baseLine) return [];
  return db
    .select()
    .from(base.batchSchemaTable)
    .where(eq(base.batchSchemaTable.deliveryLineId, baseLine.id));
}

/** Lo que ha vuelto por logística de la línea de albarán de la que viene esta. */
async function logisticsReturnOf(db: any, line: any) {
  const none = {
    total: 0,
    byBatch: new Map<string, number>(),
    noteQuantity: null as number | null,
  };
  if (line.baseType !== 'SDN' || !line.baseId || !line.baseLine) return none;
  const noteLines = schema.salesDeliveryNoteLines;
  const [noteLine] = await db
    .select({ id: noteLines.id, quantity: noteLines.quantity, uomFactor: noteLines.uomFactor })
    .from(noteLines)
    .where(and(eq(noteLines.deliveryId, line.baseId), eq(noteLines.lineNum, line.baseLine)));
  if (!noteLine) return none;
  const returned = (await receiptReturnsByLine(db, line.baseId)).get(noteLine.id);
  return {
    total: returned?.total ?? 0,
    byBatch: returned?.byBatch ?? none.byBatch,
    noteQuantity: Number(noteLine.quantity) * Number(noteLine.uomFactor || 1),
  };
}

const roundQuantity = (quantity: number) => Math.round(quantity * 1e6) / 1e6;

export async function creditableLines(
  db: any,
  side: InvoiceSide,
  invoiceId: string,
): Promise<CreditableLine[]> {
  const docType = DOC_TYPE[side];
  const config = DocumentRegistry.get(docType);
  const lines = config.lineSchemaTable;
  const batches = config.batchSchemaTable;

  const rows = await db
    .select({
      line: lines,
      itemName: schema.items.name,
      itemCode: schema.items.code,
      manageBy: schema.items.manageBy,
    })
    .from(lines)
    .leftJoin(schema.items, eq(lines.itemId, schema.items.id))
    .where(eq(lines.invoiceId, invoiceId))
    .orderBy(asc(lines.lineNum));

  // Lo ya abonado por línea, sin contar los abonos cancelados.
  const creditFilter = and(
    eq(lines.baseType, docType),
    eq(lines.baseId, invoiceId),
    ne(config.schemaTable.status, 'X'),
  );
  const credited = await db
    .select({ baseLine: lines.baseLine, quantity: sql<string>`SUM(${lines.quantity})` })
    .from(lines)
    .innerJoin(config.schemaTable, eq(lines.invoiceId, config.schemaTable.id))
    .where(creditFilter)
    .groupBy(lines.baseLine);
  const creditedByLine = new Map<number, number>(
    credited.map((r: any) => [Number(r.baseLine), -Number(r.quantity)]),
  );

  // Lo que ya volvió con abonos, por línea.
  const creditedBack = await db
    .select({ baseLine: lines.baseLine, quantity: sql<string>`SUM(${lines.quantity})` })
    .from(lines)
    .innerJoin(config.schemaTable, eq(lines.invoiceId, config.schemaTable.id))
    .where(and(creditFilter, eq(lines.stockReturned, true)))
    .groupBy(lines.baseLine);
  const creditedBackByLine = new Map<number, number>(
    creditedBack.map((r: any) => [Number(r.baseLine), -Number(r.quantity)]),
  );

  // Lo que ya volvió por lote, para no devolver dos veces el mismo.
  const returned = await db
    .select({
      baseLine: lines.baseLine,
      batchNum: batches.batchNum,
      quantity: sql<string>`SUM(${batches.quantity})`,
    })
    .from(batches)
    .innerJoin(lines, eq(batches.invoiceLineId, lines.id))
    .innerJoin(config.schemaTable, eq(lines.invoiceId, config.schemaTable.id))
    .where(creditFilter)
    .groupBy(lines.baseLine, batches.batchNum);
  const returnedKey = (lineNum: number, batchNum: string) => `${lineNum}|${batchNum}`;
  const returnedByBatch = new Map<string, number>(
    returned.map((r: any) => [returnedKey(Number(r.baseLine), r.batchNum), Number(r.quantity)]),
  );

  const custom = await customFieldsById(db, config.linePgName, sql`"invoiceId" = ${invoiceId}`);

  const result: CreditableLine[] = [];
  for (const { line, itemName, itemCode, manageBy } of rows) {
    const own = await db.select().from(batches).where(eq(batches.invoiceLineId, line.id));
    const out = own.length > 0 ? own : await deliveryNoteBatches(db, line);
    const invoiced = Number(line.quantity);
    const creditedQty = creditedByLine.get(line.lineNum) ?? 0;
    const factor = Number(line.uomFactor || 1);
    const logistics = await logisticsReturnOf(db, line);
    const returnedByLogistics = logistics.total / factor;
    const creditedBack = creditedBackByLine.get(line.lineNum) ?? 0;
    // Lo que sigue en manos del cliente. Lo que volvió antes de facturar ni se ha facturado ni
    // resta de lo facturado: por eso se mira contra lo que salió con el albarán.
    const stillOut =
      (logistics.noteQuantity === null ? invoiced : logistics.noteQuantity / factor) -
      returnedByLogistics -
      creditedBack;
    result.push({
      lineId: line.id,
      lineNum: line.lineNum,
      itemId: line.itemId,
      itemName,
      description: line.description,
      price: Number(line.price),
      invoiced,
      credited: creditedQty,
      available: invoiced - creditedQty,
      returnedByLogistics,
      returnable: Math.max(0, roundQuantity(Math.min(invoiced - creditedBack, stillOut))),
      returnedUncredited: Math.max(0, roundQuantity(invoiced - creditedQty - stillOut)),
      itemCode,
      taxGroupId: line.taxGroupId,
      uomId: line.uomId,
      uomFactor: Number(line.uomFactor || 1),
      internalOrderId: line.internalOrderId,
      customFields: custom.get(line.id) ?? {},
      unitNet: perUnit(invoiced * Number(line.price) - Number(line.discountAmount || 0), invoiced),
      unitTax: perUnit(Number(line.taxAmount || 0), invoiced),
      unitWithholding: perUnit(Number(line.withholdingAmount || 0), invoiced),
      warehouseId: line.warehouseId,
      tracked: manageBy !== 'N',
      batches: out.map((b: any) => ({
        batchNum: b.batchNum,
        available:
          Number(b.quantity) -
          (returnedByBatch.get(returnedKey(line.lineNum, b.batchNum)) ?? 0) -
          (logistics.byBatch.get(b.batchNum) ?? 0),
      })),
    });
  }
  return result;
}

/** Un tipo rectificativo activo: el pedido o, si no, el primero de la empresa. */
async function rectifyTypeOf(db: any, requested?: string) {
  const rows = await db
    .select()
    .from(schema.documentTypes)
    .where(and(eq(schema.documentTypes.isRectify, true), eq(schema.documentTypes.isActive, true)))
    .orderBy(asc(schema.documentTypes.sortOrder));
  const type = requested ? rows.find((r: any) => r.id === requested) : rows[0];
  if (type) return type;
  throw httpError(
    400,
    requested
      ? 'Ese tipo de documento no es rectificativo.'
      : 'No hay ningún tipo de documento rectificativo. Crea uno en los ajustes fiscales.',
  );
}

async function openPeriodOf(db: any, date: Date) {
  const [period] = await openPeriodsFor(db, date);
  if (!period) throw httpError(400, 'No hay ningún periodo abierto para esa fecha.');
  return period;
}

/** La serie pedida; si no, la de la factura si vale para ese periodo; si no, la predeterminada. */
async function seriesOf(
  db: any,
  docType: string,
  periodId: string,
  requested?: string,
  usual?: string,
) {
  const rows = await db
    .select()
    .from(schema.documentSeries)
    .where(
      and(eq(schema.documentSeries.docType, docType), eq(schema.documentSeries.periodId, periodId)),
    )
    .orderBy(desc(schema.documentSeries.isDefault));
  if (requested) {
    const asked = rows.find((r: any) => r.id === requested);
    if (!asked) throw httpError(400, 'Esa serie no vale para este documento y periodo.');
    return asked;
  }
  const series = rows.find((r: any) => r.id === usual) ?? rows[0];
  if (!series) throw httpError(400, 'No hay ninguna serie para el periodo de esta fecha.');
  return series;
}

/** El código con el que se ve la factura en las pantallas (`formatDocCode` en la web). */
const documentCode = (series: any, period: any, docNum: number) =>
  [
    series?.prefix,
    series?.numberingMode === 'MANUAL' ? null : period?.code,
    String(docNum).padStart(6, '0'),
  ]
    .filter(Boolean)
    .join('-');

/** De lo que queda en cada lote, en orden, lo que hace falta para esta cantidad. */
function takeFromBatches(line: CreditableLine, quantity: number) {
  const details: Array<{ batchNum: string; quantity: number }> = [];
  let remaining = quantity;
  for (const batch of line.batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.available, remaining);
    if (take <= 0) continue;
    details.push({ batchNum: batch.batchNum, quantity: take });
    remaining -= take;
  }
  return details;
}

export async function createCreditNote(
  ctx: { tenantId: string; db: any; user: any },
  side: InvoiceSide,
  invoiceId: string,
  input: CreditNoteInput,
): Promise<{ id: string; docNum: number }> {
  const docType = DOC_TYPE[side];
  const config = DocumentRegistry.get(docType);
  const headers = config.schemaTable;
  const reason = String(input?.reason ?? '').trim();
  const requested = Array.isArray(input?.lines) ? input.lines : [];

  return ctx.db.transaction(async (tx: any) => {
    // Bloqueada mientras se crea: dos abonos a la vez no pueden pasarse de lo facturado.
    const [invoice] = await tx
      .select()
      .from(headers)
      .where(eq(headers.id, invoiceId))
      .for('update');
    if (!invoice) throw httpError(404, 'Factura no encontrada.');
    if (invoice.status === 'X') throw httpError(400, 'Esta factura está cancelada.');
    if (!invoice.isLocked) throw httpError(400, 'Solo se abonan facturas emitidas.');
    if (invoice.rectifiesInvoiceId) throw httpError(400, 'Un abono no se puede abonar.');
    if (!reason) throw httpError(400, 'Indica el motivo del abono.');
    if (requested.length === 0) throw httpError(400, 'Elige al menos una línea.');

    const rawLines = await tx
      .select()
      .from(config.lineSchemaTable)
      .where(eq(config.lineSchemaTable.invoiceId, invoiceId));
    // Una devolución de logística a la vez no puede traer lo mismo que este abono.
    const notes = new Set<string>(
      rawLines.filter((l: any) => l.baseType === 'SDN' && l.baseId).map((l: any) => l.baseId),
    );
    for (const noteId of notes) await lockDeliveryNote(tx, noteId);
    const available = await creditableLines(tx, side, invoiceId);
    const customHeader = await customFieldsById(tx, config.headerPgName, sql`id = ${invoiceId}`);
    const customLines = await customFieldsById(
      tx,
      config.linePgName,
      sql`"invoiceId" = ${invoiceId}`,
    );

    let creditedNet = 0;
    let hasLineWithholding = false;
    const lines = requested.map((wanted) => {
      const quantity = Number(wanted.quantity);
      const line = available.find((l) => l.lineId === wanted.lineId);
      const raw = rawLines.find((l: any) => l.id === wanted.lineId);
      if (!line || !raw) throw httpError(400, 'Esa línea no es de esta factura.');
      if (!(quantity > 0))
        throw httpError(400, 'La cantidad a abonar tiene que ser mayor que cero.');
      if (quantity > line.available) {
        throw httpError(
          400,
          `De «${line.itemName ?? line.itemId}» solo quedan ${line.available} por abonar.`,
        );
      }

      if (wanted.returnStock && quantity > line.returnable + 1e-6) {
        throw httpError(
          409,
          line.returnedUncredited > 0
            ? `De «${line.itemName ?? line.itemId}» ya han vuelto ${line.returnedByLogistics} por logística: abónalo sin devolver al stock.`
            : `De «${line.itemName ?? line.itemId}» solo quedan ${line.returnable} por devolver.`,
        );
      }

      const ratio = quantity / line.invoiced;
      const discountRate = Number(raw.discountRate || 0);
      const discountAmount = Number(raw.discountAmount || 0);
      const withholdingRate = Number(raw.withholdingRate || 0);
      const withholdingAmount = Number(raw.withholdingAmount || 0);
      creditedNet += quantity * line.price - discountAmount * ratio;
      if (withholdingRate !== 0 || withholdingAmount !== 0) hasLineWithholding = true;

      const batchDetails = wanted.returnStock ? takeFromBatches(line, quantity) : undefined;
      const located = (batchDetails ?? []).reduce((sum, batch) => sum + batch.quantity, 0);
      if (wanted.returnStock && line.tracked && located < quantity) {
        throw httpError(
          400,
          `De «${line.itemName ?? line.itemId}» no consta de qué lotes salió: no se puede devolver con este abono.`,
        );
      }
      return {
        ...customLines.get(raw.id),
        itemId: raw.itemId,
        description: raw.description,
        quantity: -quantity,
        price: line.price,
        taxGroupId: raw.taxGroupId,
        taxRate: Number(raw.taxRate),
        // El importe guardado ya sale del porcentaje: se copia solo el que se escribió.
        discountRate,
        discountAmount: discountRate === 0 ? -discountAmount * ratio : 0,
        withholdingRate,
        withholdingAmount: withholdingRate === 0 ? -withholdingAmount * ratio : 0,
        uomId: raw.uomId,
        uomFactor: raw.uomFactor,
        warehouseId: wanted.warehouseId || raw.warehouseId || invoice.warehouseId,
        // La ubicación de la factura solo vale si vuelve al mismo almacén.
        zoneId:
          wanted.zoneId ||
          (wanted.warehouseId && wanted.warehouseId !== raw.warehouseId ? null : raw.zoneId),
        projectId: raw.projectId,
        costCenterId: raw.costCenterId,
        profitCenterId: raw.profitCenterId,
        internalOrderId: raw.internalOrderId,
        baseType: docType,
        baseId: invoiceId,
        baseLine: raw.lineNum,
        returnStock: !!wanted.returnStock,
        batchDetails,
      };
    });

    const documentType = await rectifyTypeOf(tx, input.documentTypeId);
    const date = input.date ? new Date(input.date) : new Date();
    if (Number.isNaN(date.getTime())) throw httpError(400, 'Fecha no válida.');
    const period = await openPeriodOf(tx, date);
    const series = await seriesOf(tx, docType, period.id, input.seriesId, invoice.seriesId);
    const [invoiceSeries] = await tx
      .select()
      .from(schema.documentSeries)
      .where(eq(schema.documentSeries.id, invoice.seriesId));
    const [invoicePeriod] = await tx
      .select()
      .from(schema.accountingPeriods)
      .where(eq(schema.accountingPeriods.id, invoice.periodId));

    // La retención de cabecera en importe, en la parte que toca.
    const headerWithholding = Number(invoice.withholdingAmount || 0);
    const headerRate = Number(invoice.withholdingRate || 0);
    const subtotal = Number(invoice.subtotal || 0);

    return DocumentEngine.create(ctx.tenantId, tx, ctx.user, definitionOf(config), {
      ...customHeader.get(invoiceId),
      seriesId: series.id,
      periodId: period.id,
      partnerId: invoice.partnerId,
      date,
      warehouseId: invoice.warehouseId ?? undefined,
      documentTypeId: documentType.id,
      paymentMethodId: invoice.paymentMethodId,
      currencyId: invoice.currencyId,
      billToAddress: invoice.billToAddress,
      shipToAddress: invoice.shipToAddress,
      internalOrderId: invoice.internalOrderId,
      salesAgentId: invoice.salesAgentId,
      externalRef: input.externalRef,
      rectifiesInvoiceId: invoiceId,
      rectifyRef: documentCode(invoiceSeries, invoicePeriod, invoice.docNum),
      rectifyReason: reason,
      rectifyType: input.rectifyType || 'difference',
      ...(hasLineWithholding
        ? {}
        : headerRate > 0
          ? { withholdingRate: headerRate }
          : headerWithholding !== 0 && subtotal !== 0
            ? { withholdingAmount: -headerWithholding * (creditedNet / subtotal) }
            : {}),
      lines,
    });
  });
}
