/**
 * Eventos del CRM.
 *
 * Pasan por HookManager (así los ven las automatizaciones y los plugins) y se
 * difunden por el websocket para que el tablero de otros usuarios se refresque.
 * Nunca rompen la operación que los origina.
 */
import { HookManager } from '../plugins/HookManager';
import { broadcastEvent } from '../realtime/EventSocket';

export const CRM_EVENTS = [
  'crm.opportunity.created',
  'crm.opportunity.stageChanged',
  'crm.opportunity.won',
  'crm.opportunity.lost',
  'crm.activity.created',
] as const;

export type CrmEvent = (typeof CRM_EVENTS)[number];

export async function emitCrmEvent(
  event: CrmEvent | string,
  ctx: { tenantId?: string; db: any; user?: any },
  data: Record<string, any>,
): Promise<void> {
  if (!ctx.tenantId) return;
  try {
    await HookManager.trigger(event, { tenantId: ctx.tenantId, db: ctx.db, user: ctx.user, data });
  } catch (err: any) {
    console.error(`[CRM] Error en los hooks de ${event}:`, err?.message || err);
  }
  broadcastEvent(ctx.tenantId, {
    type: event,
    timestamp: Date.now(),
    payload: { id: data?.id },
  } as any);
}
