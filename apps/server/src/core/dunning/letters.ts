/**
 * Preparar y enviar la reclamación a un cliente.
 *
 * El nivel solo sube con el correo aceptado: la carta se apunta como `sending`, y pasa a
 * `sent` o a `failed` según lo que diga el servidor de correo. El correo va fuera de la
 * transacción; un índice único por cliente impide dos envíos a la vez.
 */
import crypto from 'crypto';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { getCompanyConfig } from '../config/companyConfig';
import { readConfig, sendMail } from '../email/Mailer';
import { localeForCountry } from '../email/recipientLocale';
import { buildDocumentAttachment } from '../documents/documentAttachment';
import { hydrate } from '../documents/documentChain';
import { logAudit } from '../../utils/audit';
import { renderDunningLetter } from './dunningEmail';
import {
  letterLevelOf,
  listOverdue,
  type OverdueCustomer,
  type OverdueInvoice,
} from './overdueList';
import { getDunningSettings } from './settings';

const SENDING_TIMEOUT_MINUTES = 10;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function httpError(statusCode: number, message: string): Error {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function baseCurrency(db: any): Promise<string> {
  const [row] = await db
    .select({ code: schema.currencies.code })
    .from(schema.currencies)
    .where(eq(schema.currencies.isBase, true))
    .limit(1);
  return row?.code || 'EUR';
}

export interface LetterDraft {
  partnerId: string;
  name: string;
  to: string | null;
  level: number;
  total: number;
  subject: string;
  html: string;
  text: string;
  invoices: OverdueInvoice[];
  customer: OverdueCustomer;
}

/** La carta tal como saldría hoy. No envía ni apunta nada. */
export async function prepareLetter(db: any, partnerId: string): Promise<LetterDraft> {
  const settings = await getDunningSettings(db);
  const [customer] = await listOverdue(db, { partnerId, levels: settings.levels });
  if (!customer) throw httpError(409, 'Este cliente no tiene nada vencido.');
  const invoices = customer.invoices.filter((invoice) => invoice.reachedLevel >= 1);
  if (invoices.length === 0) throw httpError(409, 'Aún no toca reclamarle nada a este cliente.');

  const [partner] = await db
    .select({ countryCode: schema.businessPartners.countryCode })
    .from(schema.businessPartners)
    .where(eq(schema.businessPartners.id, partnerId));
  const company = await getCompanyConfig(db);
  const locale = await localeForCountry(partner?.countryCode || company.country);
  const level = customer.level;
  const total = customer.claimable;
  const letter = renderDunningLetter({
    locale,
    level,
    template: settings.levels[Math.min(level, settings.levels.length) - 1],
    company: company.name,
    partner: customer.name,
    currency: await baseCurrency(db),
    total,
    invoices: invoices.map((invoice) => ({
      code: invoice.code,
      dueDate: invoice.dueDate,
      days: invoice.days,
      amount: invoice.overdue,
    })),
  });
  return {
    partnerId,
    name: customer.name,
    to: customer.email,
    level,
    total,
    invoices,
    customer,
    ...letter,
  };
}

/** ¿Hay con qué enviar? Un mensaje claro si no; `null` si todo está en orden. */
export async function mailProblem(db: any): Promise<string | null> {
  const config = await readConfig(db);
  if (!config.enabled) return 'El envío de correo está deshabilitado en Ajustes → Correo.';
  if (!config.host)
    return 'No hay SMTP configurado. Completa host/puerto/usuario en Ajustes → Correo.';
  return null;
}

export interface SendContext {
  tenantId: string;
  user?: any;
  auto?: boolean;
}

export async function sendLetter(
  db: any,
  context: SendContext,
  partnerId: string,
  options: { to?: string } = {},
): Promise<{ id: string; level: number; to: string; total: number }> {
  const draft = await prepareLetter(db, partnerId);
  if (draft.customer.excluded) {
    throw httpError(409, 'Este cliente está excluido de las reclamaciones.');
  }
  const to = String(options.to ?? draft.to ?? '').trim();
  if (!to) throw httpError(400, 'Este cliente no tiene correo: indica uno.');
  if (!EMAIL_RE.test(to)) throw httpError(400, 'La dirección de correo no es válida.');
  const problem = await mailProblem(db);
  if (problem) throw httpError(409, problem);

  const attachments = [];
  for (const invoice of draft.invoices) {
    const built = await buildDocumentAttachment('SINV', invoice.id, db);
    if (!built) throw httpError(409, `No hay plantilla para el PDF de ${invoice.code}.`);
    attachments.push(built);
  }

  // Lo que se quedó a medias por una caída no puede bloquear al cliente para siempre.
  const letters = schema.dunningLetters;
  await db
    .update(letters)
    .set({ status: 'failed', error: 'Interrumpido' })
    .where(
      and(
        eq(letters.partnerId, partnerId),
        eq(letters.status, 'sending'),
        lt(letters.createdAt, sql`NOW() - (${SENDING_TIMEOUT_MINUTES} * INTERVAL '1 minute')`),
      ),
    );

  const id = crypto.randomUUID();
  try {
    await db.transaction(async (tx: any) => {
      await tx.insert(letters).values({
        id,
        partnerId,
        level: draft.level,
        status: 'sending',
        toAddress: to,
        subject: draft.subject,
        html: draft.html,
        total: String(draft.total),
        auto: !!context.auto,
        createdBy: context.user?.id ?? null,
      });
      await tx.insert(schema.dunningLetterLines).values(
        draft.invoices.map((invoice) => ({
          id: crypto.randomUUID(),
          letterId: id,
          invoiceId: invoice.id,
          level: letterLevelOf(invoice),
          amount: String(invoice.overdue),
          dueDate: invoice.dueDate,
          daysOverdue: invoice.days,
        })),
      );
    });
  } catch (error: any) {
    const code = error?.cause?.code ?? error?.code;
    if (code === '23505')
      throw httpError(409, 'Ya se está enviando una reclamación a este cliente.');
    throw error;
  }

  try {
    const result = await sendMail(context.tenantId, db, {
      to,
      subject: draft.subject,
      html: draft.html,
      text: draft.text,
      attachments,
    });
    if (result.accepted.length === 0)
      throw new Error('El servidor de correo no aceptó la dirección.');
  } catch (error: any) {
    const message = error?.message || 'Error al enviar';
    await db.update(letters).set({ status: 'failed', error: message }).where(eq(letters.id, id));
    throw httpError(502, `No se pudo enviar la reclamación: ${message}`);
  }

  await db.update(letters).set({ status: 'sent', sentAt: new Date() }).where(eq(letters.id, id));
  await logAudit({
    tenantClient: db,
    tenantId: context.tenantId,
    userId: context.user?.id,
    entityType: 'DunningLetter',
    entityId: id,
    action: 'CREATE',
    newValue: { partnerId, level: draft.level, to, total: draft.total, auto: !!context.auto },
  });
  return { id, level: draft.level, to, total: draft.total };
}

export async function listLetters(db: any, options: { partnerId?: string } = {}) {
  const letters = schema.dunningLetters;
  return db
    .select({
      id: letters.id,
      partnerId: letters.partnerId,
      name: schema.businessPartners.name,
      level: letters.level,
      status: letters.status,
      toAddress: letters.toAddress,
      subject: letters.subject,
      total: letters.total,
      auto: letters.auto,
      error: letters.error,
      createdAt: letters.createdAt,
      sentAt: letters.sentAt,
    })
    .from(letters)
    .innerJoin(schema.businessPartners, eq(letters.partnerId, schema.businessPartners.id))
    .where(options.partnerId ? eq(letters.partnerId, options.partnerId) : undefined)
    .orderBy(desc(letters.createdAt))
    .limit(200);
}

export async function getLetter(db: any, id: string) {
  const [letter] = await db
    .select()
    .from(schema.dunningLetters)
    .where(eq(schema.dunningLetters.id, id));
  if (!letter) throw httpError(404, 'Reclamación no encontrada.');
  const lines = await db
    .select()
    .from(schema.dunningLetterLines)
    .where(eq(schema.dunningLetterLines.letterId, id));
  const refs = await hydrate(
    db,
    'SINV' as any,
    lines.map((line: any) => line.invoiceId),
  );
  return {
    ...letter,
    lines: lines.map((line: any) => ({
      ...line,
      code: refs.find((ref: any) => ref.id === line.invoiceId)?.code ?? line.invoiceId,
    })),
  };
}
