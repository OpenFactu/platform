/**
 * Runner de automatizaciones.
 *
 * - Cada minuto revisa las automations con `triggerType='schedule'` y
 *   ejecuta las que cumplen la cron.
 * - Se suscribe a eventos del `HookManager` y dispara las que tengan
 *   `triggerType='event'` + el event concreto.
 * - Expone `runNow(automationId, ctx)` para ejecución manual.
 *
 * Cada ejecución se persiste en `AutomationRun` (ok/fail + output/error +
 * durationMs).
 */
import crypto from 'crypto';
import { ClientFactory } from '../tenant/ClientFactory';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';
import { matchesCron } from './cronMatcher';
import {
  executeEmail,
  executeNotification,
  executeWebhook,
  type ActionContext,
} from './actionExecutors';
import { HookManager } from '../plugins/HookManager';

const WHITELIST_EVENTS = [
  'salesInvoice.afterCreate',
  'salesInvoice.afterPost',
  'purchaseInvoice.afterCreate',
  'purchaseInvoice.afterPost',
  'salesOrder.afterCreate',
  'salesDeliveryNote.afterCreate',
  'purchaseOrder.afterCreate',
  'purchaseDeliveryNote.afterCreate',
  'partner.afterCreate',
  'item.afterCreate',
] as const;

class AutomationRunnerImpl {
  private scheduleInterval: NodeJS.Timeout | null = null;
  private hooksRegistered = false;

  async start() {
    if (this.scheduleInterval) return;
    this.scheduleInterval = setInterval(() => this.tickSchedule().catch(() => {}), 60 * 1000);
    // primer tick al arrancar (alineado al minuto actual)
    setTimeout(() => this.tickSchedule().catch(() => {}), 5_000);
    this.registerHooks();
    console.log('[AutomationRunner] iniciado');
  }

  private registerHooks() {
    if (this.hooksRegistered) return;
    this.hooksRegistered = true;
    for (const ev of WHITELIST_EVENTS) {
      HookManager.register(ev, async (ctx: any) => {
        await this.dispatchEvent(ev, ctx);
      });
    }
  }

  private async dispatchEvent(event: string, ctx: any) {
    const tenantId = ctx?.tenantId;
    if (!tenantId) return;
    const publicDb = ClientFactory.getClient('public');
    const rows = await publicDb
      .select()
      .from(schema.automations)
      .where(eq(schema.automations.tenantId, tenantId));
    for (const a of rows as any[]) {
      if (!a.enabled) continue;
      if (a.triggerType !== 'event') continue;
      if (a.triggerConfig?.event !== event) continue;
      this.execute(a, 'event', ctx).catch(() => {});
    }
  }

  private async tickSchedule() {
    const now = new Date();
    const publicDb = ClientFactory.getClient('public');
    const all = await publicDb.select().from(schema.automations);
    for (const a of all as any[]) {
      if (!a.enabled) continue;
      if (a.triggerType !== 'schedule') continue;
      const cronExpr = a.triggerConfig?.cron;
      if (!cronExpr) continue;
      if (!matchesCron(cronExpr, now)) continue;
      this.execute(a, 'schedule', { tenantId: a.tenantId, now: now.toISOString() }).catch(() => {});
    }
  }

  /** Ejecución manual desde un endpoint. */
  async runNow(automationId: string, tenantId: string, extraCtx: ActionContext = {}) {
    const publicDb = ClientFactory.getClient('public');
    const [a] = await publicDb
      .select()
      .from(schema.automations)
      .where(eq(schema.automations.id, automationId));
    if (!a) throw new Error('Automatización no encontrada');
    if ((a as any).tenantId !== tenantId) throw new Error('Automatización de otro tenant');
    return this.execute(a as any, 'manual', { tenantId, ...extraCtx });
  }

  private async execute(a: any, source: 'schedule' | 'event' | 'manual', ctx: ActionContext) {
    const publicDb = ClientFactory.getClient('public');
    const runId = crypto.randomUUID();
    const startedAt = new Date();
    let status: 'ok' | 'fail' = 'ok';
    let output = '';
    let err = '';
    try {
      const [tenantRow] = await publicDb
        .select({ schemaName: schema.tenants.schemaName })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, a.tenantId));
      if (!tenantRow) throw new Error('Tenant no encontrado');
      const tenantDb = ClientFactory.getClient(tenantRow.schemaName);

      const actionCtx: ActionContext = {
        ...ctx,
        automation: { id: a.id, name: a.name },
        now: new Date().toISOString(),
      };

      switch (a.actionType) {
        case 'email':
          output = await executeEmail(a.tenantId, tenantDb, a.actionConfig, actionCtx);
          break;
        case 'webhook':
          output = await executeWebhook(a.actionConfig, actionCtx);
          break;
        case 'notification':
          output = await executeNotification(
            a.tenantId,
            tenantRow.schemaName,
            a.actionConfig,
            actionCtx,
          );
          break;
        default:
          throw new Error(`actionType desconocido: ${a.actionType}`);
      }
    } catch (e: any) {
      status = 'fail';
      err = e?.message || String(e);
      console.warn(`[Automation ${a.name}] FAIL:`, err);
    } finally {
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      try {
        await publicDb.insert(schema.automationRuns).values({
          id: runId,
          automationId: a.id,
          tenantId: a.tenantId,
          status,
          startedAt,
          finishedAt,
          durationMs,
          outputText: output || null,
          errorText: err || null,
          triggerSource: source,
          contextJson: ctx,
        });
      } catch {
        /* log best-effort */
      }
    }
    return { runId, status, output, error: err };
  }

  stop() {
    if (this.scheduleInterval) {
      clearInterval(this.scheduleInterval);
      this.scheduleInterval = null;
    }
  }
}

export const AutomationRunner = new AutomationRunnerImpl();
