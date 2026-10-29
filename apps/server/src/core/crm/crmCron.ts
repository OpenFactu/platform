/**
 * Tareas periódicas del CRM, por empresa y solo con el CRM activo.
 * Mismo esquema que periodCloseCron: setInterval tras un calentamiento y un
 * try/catch por empresa para que una no tumbe a las demás.
 *
 * Cada tarea apunta lo que ya avisó (expiryNotifiedAt, notifiedAt…) para no
 * repetir el aviso en la siguiente vuelta.
 */
import crypto from 'crypto';
import { and, desc, eq, gte, isNotNull, isNull, like, lt, lte } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { ClientFactory } from '../tenant/ClientFactory';
import { getConfigSection } from '../config/systemConfigSection';
import { FLAGS_DEFAULTS } from '../config/appConfig';
import { notifyTenant } from '../realtime/notifyTenant';
import { getCrmSettings } from './settings';
import { findDormantPartners } from './partner360';

const INTERVAL_MS = 15 * 60 * 1000;
const WARMUP_MS = 45 * 1000;

export interface CrmCronContext {
  tenantId: string;
  db: any;
}

type CrmJob = (ctx: CrmCronContext) => Promise<void>;

/** Presupuestos de una oportunidad que siguen abiertos pasada su validez. */
async function notifyExpiredQuotes({ tenantId, db }: CrmCronContext) {
  const rows = await db
    .select({
      id: schema.salesQuotes.id,
      docNum: schema.salesQuotes.docNum,
      createdBy: schema.salesQuotes.createdBy,
      ownerUserId: schema.opportunities.ownerUserId,
      title: schema.opportunities.title,
    })
    .from(schema.salesQuotes)
    .innerJoin(schema.opportunities, eq(schema.salesQuotes.opportunityId, schema.opportunities.id))
    .where(
      and(
        eq(schema.salesQuotes.status, 'O'),
        isNotNull(schema.salesQuotes.validUntil),
        lt(schema.salesQuotes.validUntil, new Date()),
        isNull(schema.salesQuotes.expiryNotifiedAt),
      ),
    );
  for (const q of rows) {
    const to = q.ownerUserId || q.createdBy;
    if (to) {
      await notifyTenant({
        tenantId,
        tenantClient: db,
        userIds: [to],
        level: 'warn',
        title: `El presupuesto ${q.docNum} ha caducado`,
        body: `Sigue abierto y ha pasado su validez («${q.title}»).`,
        link: `/sales/quotes/${q.id}`,
      });
    }
    await db
      .update(schema.salesQuotes)
      .set({ expiryNotifiedAt: new Date() })
      .where(eq(schema.salesQuotes.id, q.id));
  }
}

/** Actividades pendientes que ya han vencido: un aviso al responsable, una sola vez. */
async function notifyDueActivities({ tenantId, db }: CrmCronContext) {
  const a = schema.crmActivities;
  const rows = await db
    .select()
    .from(a)
    .where(
      and(
        isNull(a.doneAt),
        isNull(a.notifiedAt),
        isNotNull(a.ownerUserId),
        isNotNull(a.dueAt),
        lte(a.dueAt, new Date()),
      ),
    )
    .limit(200);
  for (const act of rows) {
    await notifyTenant({
      tenantId,
      tenantClient: db,
      userIds: [act.ownerUserId],
      title: `Pendiente: ${act.subject}`,
      body: 'Actividad comercial con fecha de hoy o anterior.',
      link: act.opportunityId ? `/crm/opportunities/${act.opportunityId}` : '/crm/today',
    });
    await db.update(a).set({ notifiedAt: new Date() }).where(eq(a.id, act.id));
  }
}

const DORMANT_PREFIX = 'Reactivar cliente';

/**
 * Clientes habituales que han dejado de comprar: una tarea de reactivación
 * para el responsable de su última oportunidad (o el responsable por defecto).
 * No se repite mientras haya una creada en el mismo plazo.
 */
async function createDormantTasks({ db }: CrmCronContext) {
  const settings = await getCrmSettings(db);
  if (!settings.dormantEnabled) return;
  const dormant = await findDormantPartners(db, settings.dormantDays);
  const since = new Date(Date.now() - settings.dormantDays * 86_400_000);
  for (const d of dormant) {
    const [recent] = await db
      .select({ id: schema.crmActivities.id })
      .from(schema.crmActivities)
      .where(
        and(
          eq(schema.crmActivities.partnerId, d.partnerId),
          like(schema.crmActivities.subject, `${DORMANT_PREFIX}%`),
          gte(schema.crmActivities.createdAt, since),
        ),
      )
      .limit(1);
    if (recent) continue;
    const [lastOpp] = await db
      .select({ ownerUserId: schema.opportunities.ownerUserId })
      .from(schema.opportunities)
      .where(eq(schema.opportunities.partnerId, d.partnerId))
      .orderBy(desc(schema.opportunities.createdAt))
      .limit(1);
    const [partner] = await db
      .select({ name: schema.businessPartners.name })
      .from(schema.businessPartners)
      .where(eq(schema.businessPartners.id, d.partnerId));
    const days = Math.round((Date.now() - d.lastAt.getTime()) / 86_400_000);
    await db.insert(schema.crmActivities).values({
      id: crypto.randomUUID(),
      type: 'task',
      subject: `${DORMANT_PREFIX}: ${partner?.name ?? ''}`.trim(),
      body: `Compraba con regularidad (${d.count} facturas) y lleva ${days} días sin comprar.`,
      partnerId: d.partnerId,
      ownerUserId: lastOpp?.ownerUserId || settings.defaultOwnerUserId || null,
      dueAt: new Date(),
    });
  }
  if (dormant.length) console.log(`[crmCron] ${dormant.length} cliente(s) dormido(s) revisados`);
}

const jobs: Array<{ name: string; run: CrmJob }> = [
  { name: 'presupuestos caducados', run: notifyExpiredQuotes },
  { name: 'actividades vencidas', run: notifyDueActivities },
  { name: 'clientes dormidos', run: createDormantTasks },
];

/** Para que otras fases añadan sus tareas sin tocar el bucle. */
export function registerCrmJob(name: string, run: CrmJob) {
  jobs.push({ name, run });
}

async function runOnce() {
  try {
    const publicDb = ClientFactory.getClient('public');
    const tenantsList = await publicDb.select().from(schema.tenants);
    for (const tenant of tenantsList) {
      try {
        const db = ClientFactory.getClient(tenant.schemaName);
        const flags = await getConfigSection(db, 'flags', FLAGS_DEFAULTS);
        if (!flags.crmEnabled) continue;
        for (const job of jobs) {
          try {
            await job.run({ tenantId: tenant.id, db });
          } catch (err: any) {
            console.warn(`[crmCron] ${job.name} en ${tenant.schemaName}:`, err?.message);
          }
        }
      } catch (err: any) {
        console.warn(`[crmCron] Error procesando ${tenant.schemaName}:`, err?.message);
      }
    }
  } catch (err: any) {
    console.error('[crmCron] Fallo global:', err?.message);
  }
}

let started = false;
export function startCrmCron() {
  if (started) return;
  started = true;
  setTimeout(() => {
    runOnce();
    setInterval(runOnce, INTERVAL_MS);
  }, WARMUP_MS);
  console.log('[crmCron] Scheduler armado (warmup 45s, intervalo 15 min)');
}
