/**
 * Tareas periódicas del CRM, por empresa y solo con el CRM activo.
 * Mismo esquema que periodCloseCron: setInterval tras un calentamiento y un
 * try/catch por empresa para que una no tumbe a las demás.
 *
 * Cada tarea apunta lo que ya avisó (expiryNotifiedAt, notifiedAt…) para no
 * repetir el aviso en la siguiente vuelta.
 */
import { and, eq, isNotNull, isNull, lt } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { ClientFactory } from '../tenant/ClientFactory';
import { getConfigSection } from '../config/systemConfigSection';
import { FLAGS_DEFAULTS } from '../config/appConfig';
import { notifyTenant } from '../realtime/notifyTenant';

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

const jobs: Array<{ name: string; run: CrmJob }> = [
  { name: 'presupuestos caducados', run: notifyExpiredQuotes },
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
