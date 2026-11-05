/**
 * Facturas que se repiten. Cada periodo crea un documento por `DocumentEngine`, igual que
 * si lo hiciera alguien a mano: el stock, los impuestos y el límite de crédito no cambian.
 *
 * La fila del periodo, el documento y la fecha siguiente se escriben en la misma
 * transacción: o está todo, o no está nada y se vuelve a intentar. Por eso ni se repite un
 * periodo ni se salta uno. Emitir y enviar van después, y solo si se ha pedido; si fallan,
 * la factura ya existe y se avisa.
 */
import crypto from 'crypto';
import { and, asc, desc, eq, lte, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { DocumentEngine } from '../documents/DocumentEngine';
import { DocumentRegistry } from '../documents/DocumentRegistry';
import { buildDocumentAttachment } from '../documents/documentAttachment';
import { sendMail } from '../email/Mailer';
import { openPeriodsFor } from '../accounting/periodRules';
import { notifyAdmins } from '../realtime/notifyAdmins';
import { logAudit } from '../../utils/audit';
import { FREQUENCIES, firstAfter, firstOnOrAfter, isIsoDate, type Frequency } from './schedule';

/** Los tipos que admiten repetirse. Una factura de compra pide además la referencia del proveedor. */
const RECURRING_DOC_TYPES = ['SINV'];

/** Tope por pasada: si el servidor pasó años parado, que no salgan todas de golpe. */
const MAX_CATCH_UP = 24;

const HEADER_FIELDS = [
  'documentTypeId',
  'paymentMethodId',
  'paymentTermId',
  'withholdingRate',
  'internalOrderId',
  'externalRef',
  'notes',
  'internalNotes',
  'salesAgentId',
];
const LINE_FIELDS = [
  'itemId',
  'description',
  'quantity',
  'price',
  'taxGroupId',
  'discountRate',
  'discountAmount',
  'uomId',
  'uomFactor',
  'warehouseId',
  'zoneId',
  'withholdingRate',
  'internalOrderId',
];

const round2 = (n: number) => Math.round(n * 100) / 100;

export const todayIso = () => new Date().toISOString().slice(0, 10);

function httpError(statusCode: number, message: string): Error {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  return err;
}

const pick = (source: any, fields: string[]) =>
  Object.fromEntries(
    fields
      .filter((field) => source?.[field] !== undefined && source?.[field] !== '')
      .map((field) => [field, source[field]]),
  );

interface CleanInput {
  name: string;
  docType: string;
  partnerId: string;
  seriesId: string | null;
  warehouseId: string | null;
  header: Record<string, unknown>;
  lines: Array<Record<string, unknown>>;
  frequency: Frequency;
  startDate: string;
  endDate: string | null;
  autoPost: boolean;
  autoSend: boolean;
}

async function cleanInput(db: any, input: any): Promise<CleanInput> {
  const name = String(input?.name ?? '').trim();
  if (!name) throw httpError(400, 'Ponle un nombre.');
  const docType = input?.docType ?? 'SINV';
  if (!RECURRING_DOC_TYPES.includes(docType)) {
    throw httpError(400, 'Este tipo de documento no se puede repetir.');
  }
  if (!input?.partnerId) throw httpError(400, 'Elige un cliente.');
  const [partner] = await db
    .select({ id: schema.businessPartners.id })
    .from(schema.businessPartners)
    .where(eq(schema.businessPartners.id, input.partnerId));
  if (!partner) throw httpError(400, 'Ese cliente no existe.');
  if (!(FREQUENCIES as readonly string[]).includes(input?.frequency)) {
    throw httpError(400, 'Elige cada cuánto se repite.');
  }
  if (!isIsoDate(input?.startDate)) throw httpError(400, 'La fecha de inicio no es válida.');
  const endDate = input?.endDate || null;
  if (endDate !== null) {
    if (!isIsoDate(endDate)) throw httpError(400, 'La fecha de fin no es válida.');
    if (endDate < input.startDate) {
      throw httpError(400, 'La fecha de fin no puede ser anterior a la de inicio.');
    }
  }
  const lines = Array.isArray(input?.lines) ? input.lines : [];
  if (lines.length === 0) throw httpError(400, 'Añade al menos una línea.');
  for (const line of lines) {
    if (!line?.itemId) throw httpError(400, 'Hay una línea sin artículo.');
    if (!(Number(line.quantity) > 0))
      throw httpError(400, 'La cantidad tiene que ser mayor que cero.');
    if (!Number.isFinite(Number(line.price))) throw httpError(400, 'El precio no es válido.');
  }
  if (netOf(lines) < 0) throw httpError(400, 'El total no puede ser negativo.');
  const autoPost = input?.autoPost === true;
  const autoSend = input?.autoSend === true;
  if (autoSend && !autoPost) throw httpError(400, 'Para enviarla sola también hay que emitirla.');
  return {
    name,
    docType,
    partnerId: input.partnerId,
    seriesId: input?.seriesId || null,
    warehouseId: input?.warehouseId || null,
    header: pick(input?.header, HEADER_FIELDS),
    lines: lines.map((line: any) => pick(line, LINE_FIELDS)),
    frequency: input.frequency,
    startDate: input.startDate,
    endDate,
    autoPost,
    autoSend,
  };
}

async function lastPeriodOf(db: any, id: string): Promise<string | null> {
  const [run] = await db
    .select({ periodDate: schema.recurringDocumentRuns.periodDate })
    .from(schema.recurringDocumentRuns)
    .where(eq(schema.recurringDocumentRuns.recurringId, id))
    .orderBy(desc(schema.recurringDocumentRuns.periodDate))
    .limit(1);
  return run?.periodDate ?? null;
}

/**
 * La próxima fecha al crear, cambiar o reanudar: no se recupera lo que ya pasó. Una
 * recurrente con inicio en enero creada en noviembre no dispara diez facturas.
 */
function nextFromToday(
  input: { startDate: string; frequency: Frequency; endDate: string | null },
  today: string,
  lastPeriod: string | null,
): string | null {
  const base =
    lastPeriod && lastPeriod >= today
      ? firstAfter(input.startDate, input.frequency, lastPeriod)
      : today;
  const next = firstOnOrAfter(input.startDate, input.frequency, base);
  return input.endDate && next > input.endDate ? null : next;
}

export async function createRecurring(
  db: any,
  user: any,
  input: any,
  options: { today?: string } = {},
) {
  const clean = await cleanInput(db, input);
  const nextDate = nextFromToday(clean, options.today ?? todayIso(), null);
  if (!nextDate) throw httpError(400, 'Con esas fechas no llegaría a generar ninguna.');
  const [row] = await db
    .insert(schema.recurringDocuments)
    .values({
      id: crypto.randomUUID(),
      ...clean,
      nextDate,
      status: 'active',
      createdBy: user?.id ?? null,
    })
    .returning();
  return row;
}

async function loadOr404(db: any, id: string) {
  const [row] = await db
    .select()
    .from(schema.recurringDocuments)
    .where(eq(schema.recurringDocuments.id, id));
  if (!row) throw httpError(404, 'Recurrente no encontrada.');
  return row;
}

export async function updateRecurring(
  db: any,
  id: string,
  input: any,
  options: { today?: string } = {},
) {
  const current = await loadOr404(db, id);
  const clean = await cleanInput(db, input);
  const today = options.today ?? todayIso();
  const scheduleChanged =
    clean.startDate !== current.startDate || clean.frequency !== current.frequency;
  let nextDate = current.nextDate;
  if (scheduleChanged || !nextDate) {
    nextDate = nextFromToday(clean, today, await lastPeriodOf(db, id));
  } else if (clean.endDate && nextDate > clean.endDate) {
    nextDate = null;
  }
  const status =
    current.status === 'paused'
      ? nextDate
        ? 'paused'
        : 'finished'
      : nextDate
        ? 'active'
        : 'finished';
  const [row] = await db
    .update(schema.recurringDocuments)
    .set({ ...clean, nextDate, status })
    .where(eq(schema.recurringDocuments.id, id))
    .returning();
  return row;
}

export async function setRecurringStatus(
  db: any,
  id: string,
  action: 'pause' | 'resume' | 'finish',
  options: { today?: string } = {},
) {
  const current = await loadOr404(db, id);
  const table = schema.recurringDocuments;
  if (action === 'pause') {
    if (current.status !== 'active') throw httpError(409, 'Solo se pausa una recurrente activa.');
    const [row] = await db
      .update(table)
      .set({ status: 'paused' })
      .where(eq(table.id, id))
      .returning();
    return row;
  }
  if (action === 'finish') {
    const [row] = await db
      .update(table)
      .set({ status: 'finished', nextDate: null })
      .where(eq(table.id, id))
      .returning();
    return row;
  }
  if (current.status !== 'paused') throw httpError(409, 'Solo se reanuda una recurrente en pausa.');
  const nextDate = nextFromToday(current, options.today ?? todayIso(), await lastPeriodOf(db, id));
  const [row] = await db
    .update(table)
    .set({ status: nextDate ? 'active' : 'finished', nextDate, lastError: null, lastErrorAt: null })
    .where(eq(table.id, id))
    .returning();
  return row;
}

/** Solo si nunca generó nada: lo generado tiene que seguir diciendo de dónde salió. */
export async function deleteRecurring(db: any, id: string) {
  await loadOr404(db, id);
  if (await lastPeriodOf(db, id)) {
    throw httpError(409, 'Ya ha generado facturas: termínala en vez de borrarla.');
  }
  await db.delete(schema.recurringDocuments).where(eq(schema.recurringDocuments.id, id));
}

const netOf = (lines: any[]) =>
  round2(
    lines.reduce((sum, line) => {
      const gross = Number(line.quantity) * Number(line.price);
      const discount =
        Number(line.discountAmount) || (gross * (Number(line.discountRate) || 0)) / 100;
      return sum + gross - discount;
    }, 0),
  );

export async function listRecurring(db: any) {
  const table = schema.recurringDocuments;
  const runs = schema.recurringDocumentRuns;
  const rows = await db
    .select({
      recurring: table,
      partnerName: schema.businessPartners.name,
      runCount: sql<number>`(SELECT COUNT(*) FROM ${runs} WHERE ${runs.recurringId} = ${table.id})`,
    })
    .from(table)
    .innerJoin(schema.businessPartners, eq(table.partnerId, schema.businessPartners.id))
    .orderBy(asc(table.nextDate), asc(table.name));
  return rows.map((row: any) => ({
    ...row.recurring,
    partnerName: row.partnerName,
    runCount: Number(row.runCount),
    net: netOf(row.recurring.lines),
  }));
}

export async function getRecurring(db: any, id: string) {
  const row = await loadOr404(db, id);
  const runs = await db
    .select()
    .from(schema.recurringDocumentRuns)
    .where(eq(schema.recurringDocumentRuns.recurringId, id))
    .orderBy(desc(schema.recurringDocumentRuns.periodDate));
  const [partner] = await db
    .select({ name: schema.businessPartners.name })
    .from(schema.businessPartners)
    .where(eq(schema.businessPartners.id, row.partnerId));
  return { ...row, partnerName: partner?.name ?? '', net: netOf(row.lines), runs };
}

/**
 * La serie de ese periodo. Las series son por ejercicio: al cambiar de año se busca la que
 * lleva el mismo prefijo que la elegida, y si no, la predeterminada. Nunca una manual: nadie
 * teclearía el número.
 */
async function seriesAndPeriodFor(tx: any, row: any, date: string) {
  const open = await openPeriodsFor(tx, date);
  if (open.length === 0)
    throw httpError(409, `No hay un periodo contable abierto para el ${date}.`);

  const all = await tx
    .select()
    .from(schema.documentSeries)
    .where(
      and(
        eq(schema.documentSeries.docType, row.docType),
        eq(schema.documentSeries.numberingMode, 'AUTO'),
      ),
    );
  const inPeriod = all.filter((series: any) => open.some((p: any) => p.id === series.periodId));
  const chosen = all.find((series: any) => series.id === row.seriesId);
  const series =
    inPeriod.find((s: any) => s.id === row.seriesId) ??
    (chosen ? inPeriod.find((s: any) => s.prefix === chosen.prefix) : undefined) ??
    inPeriod.find((s: any) => s.isDefault) ??
    inPeriod[0];
  if (!series)
    throw httpError(409, `No hay una serie de numeración para el periodo ${open[0].code}.`);
  return { period: open.find((p: any) => p.id === series.periodId), series };
}

const definitionOf = (config: any) => ({
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

const systemUserOf = (row: any) => ({ id: row.createdBy ?? undefined, role: 'SYSTEM' });

interface GeneratedDocument {
  recurring: any;
  documentId: string;
  docNum: number;
  periodDate: string;
  runId: string;
}

/** Genera el periodo que toca, o nada si no toca. Todo o nada. */
async function generateOne(
  db: any,
  tenantId: string,
  id: string,
  today: string,
): Promise<GeneratedDocument | null> {
  const table = schema.recurringDocuments;
  const runs = schema.recurringDocumentRuns;
  return db.transaction(async (tx: any) => {
    const [row] = await tx.select().from(table).where(eq(table.id, id)).for('update');
    if (!row || row.status !== 'active' || !row.nextDate || row.nextDate > today) return null;
    const periodDate = row.nextDate;
    const following = firstAfter(row.startDate, row.frequency, periodDate);
    const finished = !!row.endDate && following > row.endDate;
    const advance = {
      nextDate: finished ? null : following,
      status: finished ? 'finished' : 'active',
      lastError: null,
      lastErrorAt: null,
    };

    // Ya generado por lo que sea: se avanza y no se vuelve a crear.
    const [existing] = await tx
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.recurringId, id), eq(runs.periodDate, periodDate)));
    if (existing) {
      await tx.update(table).set(advance).where(eq(table.id, id));
      return null;
    }

    const { period, series } = await seriesAndPeriodFor(tx, row, periodDate);
    const config = DocumentRegistry.get(row.docType as any);
    const created = await DocumentEngine.create(
      tenantId,
      tx,
      systemUserOf(row),
      definitionOf(config),
      {
        ...(row.header as Record<string, unknown>),
        seriesId: series.id,
        periodId: period.id,
        partnerId: row.partnerId,
        date: periodDate,
        warehouseId: row.warehouseId ?? undefined,
        lines: row.lines as any[],
      },
    );

    const runId = crypto.randomUUID();
    await tx.insert(runs).values({
      id: runId,
      recurringId: id,
      periodDate,
      documentId: created.id,
      docNum: created.docNum,
      note: created.creditWarning ? 'Supera el límite de crédito del cliente.' : null,
    });
    await tx.update(table).set(advance).where(eq(table.id, id));
    return { recurring: row, documentId: created.id, docNum: created.docNum, periodDate, runId };
  });
}

/** Lo opcional de después de crearla. Si falla, la factura ya existe: se apunta y se avisa. */
async function finishDocument(db: any, tenantId: string, generated: GeneratedDocument) {
  const { recurring, documentId, docNum, periodDate, runId } = generated;
  const config = DocumentRegistry.get(recurring.docType as any);
  const user = systemUserOf(recurring);

  await logAudit({
    tenantClient: db,
    tenantId,
    userId: recurring.createdBy ?? undefined,
    entityType: config.headerPgName,
    entityId: documentId,
    action: 'CREATE',
    newValue: { docNum, partnerId: recurring.partnerId, recurringId: recurring.id, periodDate },
  });
  if (!recurring.autoPost) return;

  const problem = async (message: string) => {
    await db
      .update(schema.recurringDocumentRuns)
      .set({ note: message })
      .where(eq(schema.recurringDocumentRuns.id, runId));
    await notifyAdmins(tenantId, db, {
      title: `Factura recurrente «${recurring.name}»`,
      body: message.slice(0, 200),
      level: 'warn',
      link: `/sales/recurring/${recurring.id}`,
    });
  };

  try {
    await DocumentEngine.post(tenantId, db, user, definitionOf(config), documentId);
  } catch (error: any) {
    await problem(`Se creó en borrador y no se pudo emitir: ${error?.message}`);
    return;
  }
  if (!recurring.autoSend) return;

  try {
    const [partner] = await db
      .select({ email: schema.businessPartners.email })
      .from(schema.businessPartners)
      .where(eq(schema.businessPartners.id, recurring.partnerId));
    if (!partner?.email) throw new Error('El cliente no tiene correo.');
    const attachment = await buildDocumentAttachment(recurring.docType, documentId, db);
    if (!attachment) throw new Error('No hay plantilla para el PDF.');
    await sendMail(tenantId, db, {
      to: partner.email,
      subject: attachment.filename.replace(/\.pdf$/, ''),
      text: attachment.filename.replace(/\.pdf$/, ''),
      attachments: [attachment],
    });
  } catch (error: any) {
    await problem(`Se emitió y no se pudo enviar: ${error?.message}`);
  }
}

/**
 * Genera todo lo pendiente de una recurrente, un periodo cada vez. Si uno falla se para ahí
 * y lanza: el siguiente intento empieza por ese mismo periodo.
 */
export async function generateDue(
  db: any,
  tenantId: string,
  id: string,
  options: { today?: string } = {},
): Promise<GeneratedDocument[]> {
  const today = options.today ?? todayIso();
  const generated: GeneratedDocument[] = [];
  for (let i = 0; i < MAX_CATCH_UP; i++) {
    const [before] = await db
      .select({ nextDate: schema.recurringDocuments.nextDate })
      .from(schema.recurringDocuments)
      .where(eq(schema.recurringDocuments.id, id));
    const one = await generateOne(db, tenantId, id, today);
    if (one) {
      generated.push(one);
      await finishDocument(db, tenantId, one);
      continue;
    }
    // Sin documento pero avanzó: ese periodo ya estaba generado, puede quedar otro.
    const [after] = await db
      .select({ nextDate: schema.recurringDocuments.nextDate })
      .from(schema.recurringDocuments)
      .where(eq(schema.recurringDocuments.id, id));
    if (!before || after?.nextDate === before.nextDate) break;
  }
  return generated;
}

/** Apunta el fallo. Devuelve si es el primero de hoy, para avisar una sola vez al día. */
export async function recordFailure(db: any, id: string, message: string, today: string) {
  const table = schema.recurringDocuments;
  const [row] = await db.select({ at: table.lastErrorAt }).from(table).where(eq(table.id, id));
  const first = !row?.at || new Date(row.at).toISOString().slice(0, 10) !== today;
  await db
    .update(table)
    .set({ lastError: message, lastErrorAt: new Date(`${today}T12:00:00Z`) })
    .where(eq(table.id, id));
  return first;
}

/** Una pasada por las recurrentes de una empresa. Lo que falla no para a las demás. */
export async function runRecurringForTenant(
  tenantId: string,
  db: any,
  options: { today?: string } = {},
): Promise<void> {
  const today = options.today ?? todayIso();
  const table = schema.recurringDocuments;
  const due = await db
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(and(eq(table.status, 'active'), lte(table.nextDate, today)));
  for (const { id, name } of due) {
    try {
      await generateDue(db, tenantId, id, { today });
    } catch (error: any) {
      const message = error?.message || 'Error al generar';
      console.warn(`[recurringCron] ${id}:`, message);
      if (await recordFailure(db, id, message, today)) {
        await notifyAdmins(tenantId, db, {
          title: `No se pudo generar la factura recurrente «${name}»`,
          body: message.slice(0, 200),
          level: 'error',
          link: `/sales/recurring/${id}`,
        });
      }
    }
  }
}
