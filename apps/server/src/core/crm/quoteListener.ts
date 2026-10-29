/**
 * Reacción del CRM a los cambios de estado de un presupuesto.
 *
 *   Aceptado  → la oportunidad de la que salió pasa a la primera etapa «ganada».
 *   Rechazado → tarea para el responsable; no se da por perdida sola, porque un
 *               rechazo suele acabar en otro presupuesto.
 *
 * `salesQuote.statusChanged` lo emiten el cambio manual de estado y los hooks
 * de pedido y factura que aceptan el presupuesto (dentro de su transacción:
 * `db` es entonces la transacción y todo se deshace junto).
 */
import crypto from 'crypto';
import { and, asc, eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { HookManager } from '../plugins/HookManager';
import { moveOpportunityToStage } from './opportunityStage';
import { emitCrmEvent } from './events';

export const QUOTE_STATUS_EVENT = 'salesQuote.statusChanged';

interface QuoteStatusContext {
  tenantId: string;
  db: any;
  user?: any;
  data: { quoteId: string; status: string };
}

/** Dispara el evento; nunca rompe la operación que cambió el estado. */
export async function emitQuoteStatusChanged(
  ctx: { tenantId: string; db: any; user?: any },
  quoteId: string,
  status: string,
) {
  try {
    await HookManager.trigger(QUOTE_STATUS_EVENT, { ...ctx, data: { quoteId, status } });
  } catch (err: any) {
    console.error('[CRM] Error reaccionando al cambio de estado del presupuesto:', err?.message);
  }
}

async function onQuoteStatusChanged({ tenantId, db, user, data }: QuoteStatusContext) {
  const [quote] = await db
    .select({
      opportunityId: schema.salesQuotes.opportunityId,
      docNum: schema.salesQuotes.docNum,
    })
    .from(schema.salesQuotes)
    .where(eq(schema.salesQuotes.id, data.quoteId));
  if (!quote?.opportunityId) return;
  const [opp] = await db
    .select()
    .from(schema.opportunities)
    .where(eq(schema.opportunities.id, quote.opportunityId));
  if (!opp) return;

  if (data.status === 'A') {
    const [current] = await db
      .select({ kind: schema.opportunityStages.kind })
      .from(schema.opportunityStages)
      .where(eq(schema.opportunityStages.id, opp.stageId));
    if (current?.kind === 'won') return;
    const [won] = await db
      .select()
      .from(schema.opportunityStages)
      .where(eq(schema.opportunityStages.kind, 'won'))
      .orderBy(asc(schema.opportunityStages.sortOrder))
      .limit(1);
    if (won) await moveOpportunityToStage(db, { tenantId, user }, opp, won);
    return;
  }

  if (data.status === 'R') {
    const [existing] = await db
      .select({ id: schema.crmActivities.id })
      .from(schema.crmActivities)
      .where(
        and(
          eq(schema.crmActivities.opportunityId, opp.id),
          eq(
            schema.crmActivities.subject,
            `Presupuesto ${quote.docNum} rechazado: ¿siguiente paso?`,
          ),
        ),
      );
    if (existing) return;
    const [activity] = await db
      .insert(schema.crmActivities)
      .values({
        id: crypto.randomUUID(),
        type: 'task',
        subject: `Presupuesto ${quote.docNum} rechazado: ¿siguiente paso?`,
        partnerId: opp.partnerId,
        opportunityId: opp.id,
        ownerUserId: opp.ownerUserId,
        dueAt: new Date(Date.now() + 86_400_000),
      })
      .returning();
    await emitCrmEvent('crm.activity.created', { tenantId, db, user }, activity);
  }
}

let registered = false;
export function registerCrmQuoteListener() {
  if (registered) return;
  registered = true;
  HookManager.register(QUOTE_STATUS_EVENT, onQuoteStatusChanged);
}
