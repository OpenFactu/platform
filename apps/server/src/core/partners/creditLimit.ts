/**
 * El límite de crédito de un cliente.
 *
 * Deuda: facturas pendientes (también borradores, que ya movieron el stock), más albaranes
 * sin facturar sin lo que ya ha vuelto, más lo que falta por servir de los pedidos, menos lo
 * que tenga a favor.
 *
 * Se mide antes y después de crear el documento, en la misma transacción: así un albarán
 * que sale de un pedido no añade nada, porque esa deuda ya estaba, y no hace falta saber
 * de dónde sale cada línea.
 */
import { and, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { getConfigSection } from '../config/systemConfigSection';
import { resolveEffectivePermissions } from '../auth/resolveEffectivePermissions';
import { logAudit } from '../../utils/audit';

export const CREDIT_MODES = ['off', 'warn', 'block'] as const;
export type CreditMode = (typeof CREDIT_MODES)[number];

/** Fuera de `/partners`: si colgara de ahí, darlo enseñaría también el menú de interlocutores. */
export const CREDIT_OVERRIDE_PERMISSION = '/credit-override';

export const CREDIT_LIMIT_EXCEEDED = 'CREDIT_LIMIT_EXCEEDED';

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getCreditMode(db: any): Promise<CreditMode> {
  const { mode } = await getConfigSection(db, 'credit', { mode: 'warn' });
  return (CREDIT_MODES as readonly string[]).includes(mode) ? (mode as CreditMode) : 'warn';
}

export interface CreditExposure {
  invoices: number;
  deliveryNotes: number;
  orders: number;
  creditBalance: number;
  used: number;
}

export async function partnerExposure(db: any, partnerId: string): Promise<CreditExposure> {
  const invoice = schema.salesInvoices;
  const note = schema.salesDeliveryNotes;
  const order = schema.salesOrders;
  const orderLine = schema.salesOrderLines;

  const [invoices] = await db
    .select({
      value: sql<string>`COALESCE(SUM(GREATEST(${invoice.total} - COALESCE(${invoice.amountPaid}, 0), 0) * COALESCE(${invoice.exchangeRate}, 1)), 0)`,
    })
    .from(invoice)
    .where(
      and(
        eq(invoice.partnerId, partnerId),
        inArray(invoice.status, ['D', 'O']),
        isNull(invoice.rectifiesInvoiceId),
      ),
    );
  const [balance] = await db
    .select({
      value: sql<string>`COALESCE(SUM(GREATEST(ABS(${invoice.total}) - ABS(COALESCE(${invoice.amountPaid}, 0)), 0) * COALESCE(${invoice.exchangeRate}, 1)), 0)`,
    })
    .from(invoice)
    .where(
      and(
        eq(invoice.partnerId, partnerId),
        eq(invoice.status, 'O'),
        isNotNull(invoice.rectifiesInvoiceId),
      ),
    );
  const [notes] = await db
    .select({ value: sql<string>`COALESCE(SUM(${note.total}), 0)` })
    .from(note)
    .where(and(eq(note.partnerId, partnerId), inArray(note.status, ['O', 'P'])));
  // Lo que ha vuelto con su entrada: su parte de cada línea, que ya lleva el impuesto.
  const noteLine = schema.salesDeliveryNoteLines;
  const receipt = schema.goodsReceipts;
  const receiptLine = schema.goodsReceiptLines;
  const [returned] = await db
    .select({
      value: sql<string>`COALESCE(SUM(${noteLine.lineTotal} * ${receiptLine.quantity} / NULLIF(${noteLine.quantity} * COALESCE(${noteLine.uomFactor}, 1), 0)), 0)`,
    })
    .from(receiptLine)
    .innerJoin(receipt, eq(receiptLine.receiptId, receipt.id))
    .innerJoin(noteLine, eq(receiptLine.sourceLineId, noteLine.id))
    .innerJoin(note, eq(noteLine.deliveryId, note.id))
    .where(
      and(
        eq(note.partnerId, partnerId),
        inArray(note.status, ['O', 'P']),
        ne(receipt.status, 'cancelled'),
      ),
    );
  const [orders] = await db
    .select({
      value: sql<string>`COALESCE(SUM(${orderLine.lineTotal} * GREATEST(${orderLine.orderedQty} - ${orderLine.deliveredQty}, 0) / NULLIF(${orderLine.orderedQty}, 0)), 0)`,
    })
    .from(orderLine)
    .innerJoin(order, eq(orderLine.orderId, order.id))
    .where(and(eq(order.partnerId, partnerId), inArray(order.status, ['O', 'P'])));

  const amounts = {
    invoices: round2(Number(invoices.value)),
    deliveryNotes: Math.max(0, round2(Number(notes.value) - Number(returned.value))),
    orders: round2(Number(orders.value)),
    creditBalance: round2(Number(balance.value)),
  };
  return {
    ...amounts,
    used: round2(amounts.invoices + amounts.deliveryNotes + amounts.orders - amounts.creditBalance),
  };
}

/** ¿Puede este usuario saltarse el límite o cambiarlo? */
export async function canOverrideCredit(user: any, tenantId: string): Promise<boolean> {
  if (!user?.id) return false;
  const permissions = await resolveEffectivePermissions(user.id, tenantId, user.role);
  return permissions === null || !!permissions[CREDIT_OVERRIDE_PERMISSION]?.write;
}

export interface CreditStatus extends CreditExposure {
  mode: CreditMode;
  limit: number | null;
  available: number | null;
  /** Con el importe preguntado, se pasaría. */
  wouldExceed: boolean;
  canOverride: boolean;
}

/** Lo usado y lo disponible de un cliente; `null` si no existe. */
export async function partnerCreditStatus(
  db: any,
  partnerId: string,
  options: { amount?: number; user?: any; tenantId: string },
): Promise<CreditStatus | null> {
  const [partner] = await db
    .select({ limit: schema.businessPartners.creditLimit })
    .from(schema.businessPartners)
    .where(eq(schema.businessPartners.id, partnerId));
  if (!partner) return null;
  const limit = partner.limit == null ? null : Number(partner.limit);
  const exposure = await partnerExposure(db, partnerId);
  const amount = Number(options.amount) || 0;
  return {
    ...exposure,
    mode: await getCreditMode(db),
    limit,
    available: limit === null ? null : round2(limit - exposure.used),
    wouldExceed: limit !== null && amount > 0 && round2(exposure.used + amount) > limit,
    canOverride: await canOverrideCredit(options.user, options.tenantId),
  };
}

export interface CreditGuard {
  partnerId: string;
  mode: CreditMode;
  limit: number;
  before: number;
}

/**
 * Al empezar a crear un documento: apunta la deuda. Bloqueando, se queda además con la
 * fila del cliente, para que dos ventas a la vez no se vean la una a la otra sin contar.
 * `null` si no hay nada que mirar.
 */
export async function openCreditGuard(tx: any, partnerId?: string): Promise<CreditGuard | null> {
  if (!partnerId) return null;
  const mode = await getCreditMode(tx);
  if (mode === 'off') return null;
  const partners = schema.businessPartners;
  const [partner] = await tx
    .select({ limit: partners.creditLimit })
    .from(partners)
    .where(eq(partners.id, partnerId));
  if (partner?.limit == null) return null;
  if (mode === 'block') {
    await tx
      .select({ id: partners.id })
      .from(partners)
      .where(eq(partners.id, partnerId))
      .for('no key update');
  }
  const { used } = await partnerExposure(tx, partnerId);
  return { partnerId, mode, limit: Number(partner.limit), before: used };
}

export interface CreditWarning {
  limit: number;
  used: number;
  added: number;
  over: number;
}

/**
 * Al terminar de crearlo: si ha añadido deuda y se pasa, avisa o lanza. Lanzar deshace la
 * transacción entera. Un documento que no añade nada nunca se detiene: lo que ya se aceptó
 * se puede servir y facturar aunque luego hayan bajado el límite.
 */
export async function settleCreditGuard(
  tx: any,
  guard: CreditGuard,
  context: {
    tenantId: string;
    user: any;
    documentId: string;
    entityType: string;
    override?: boolean;
  },
): Promise<CreditWarning | undefined> {
  const { used } = await partnerExposure(tx, guard.partnerId);
  const added = round2(used - guard.before);
  if (added <= 0 || used <= guard.limit) return undefined;

  const credit: CreditWarning = {
    limit: guard.limit,
    used,
    added,
    over: round2(used - guard.limit),
  };
  if (guard.mode === 'warn') return credit;

  const canOverride = await canOverrideCredit(context.user, context.tenantId);
  if (context.override === true && canOverride) {
    await logAudit({
      tenantClient: tx,
      tenantId: context.tenantId,
      userId: context.user?.id,
      entityType: context.entityType,
      entityId: context.documentId,
      action: 'OVERRIDE',
      newValue: { ...credit, partnerId: guard.partnerId },
    });
    return undefined;
  }

  const err: any = new Error(
    `Este cliente supera su límite de crédito de ${guard.limit.toFixed(2)}: con este documento debería ${used.toFixed(2)}.`,
  );
  err.statusCode = 409;
  err.body = { code: CREDIT_LIMIT_EXCEEDED, credit, canOverride };
  throw err;
}

/**
 * Valida el límite que llega de la ficha. Devuelve el valor que se guarda; poner o cambiar
 * el límite pide el mismo permiso que saltárselo, porque subirlo sería saltárselo.
 */
export async function resolveCreditLimitChange(
  raw: unknown,
  current: unknown,
  context: { user: any; tenantId: string; apiToken?: unknown },
): Promise<number | null> {
  const value = raw === '' || raw === null ? null : Number(raw);
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    const err: any = new Error('El límite de crédito tiene que ser un importe positivo.');
    err.statusCode = 400;
    throw err;
  }
  const before = current === null || current === undefined ? null : Number(current);
  if (value === before || context.apiToken) return value;
  if (!(await canOverrideCredit(context.user, context.tenantId))) {
    const err: any = new Error('No tienes permiso para cambiar el límite de crédito.');
    err.statusCode = 403;
    throw err;
  }
  return value;
}
