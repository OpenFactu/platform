/**
 * Cambio de etapa de una oportunidad: lo usan el router (tablero, formulario)
 * y los hooks que la mueven solos (p. ej. presupuesto aceptado → ganada).
 * Mantiene closedAt y el motivo de pérdida, apunta el historial y emite los
 * eventos del CRM.
 */
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { emitCrmEvent } from './events';

/** closedAt sigue a la etapa: se fija al entrar en ganada/perdida y se limpia al reabrir. */
export function closedAtFor(stage: { kind: string }, current: Date | null): Date | null {
  if (stage.kind === 'open') return null;
  return current ?? new Date();
}

export async function moveOpportunityToStage(
  db: any,
  ctx: { tenantId?: string; user?: any },
  opportunity: any,
  stage: any,
  extra: Record<string, any> = {},
): Promise<any> {
  const lostReason =
    stage.kind === 'lost'
      ? (extra.lostReason ?? opportunity.lostReason ?? null)
      : stage.kind === 'open'
        ? null
        : opportunity.lostReason;

  const [row] = await db
    .update(schema.opportunities)
    .set({
      ...extra,
      stageId: stage.id,
      lostReason,
      closedAt: closedAtFor(stage, opportunity.closedAt),
      updatedAt: new Date(),
    })
    .where(eq(schema.opportunities.id, opportunity.id))
    .returning();

  await db.insert(schema.opportunityStageHistory).values({
    id: crypto.randomUUID(),
    opportunityId: opportunity.id,
    fromStageId: opportunity.stageId,
    toStageId: stage.id,
    userId: ctx.user?.id ?? null,
  });

  const evCtx = { tenantId: ctx.tenantId, db, user: ctx.user };
  const data = {
    ...row,
    stageName: stage.name,
    stageKind: stage.kind,
    fromStageId: opportunity.stageId,
  };
  await emitCrmEvent('crm.opportunity.stageChanged', evCtx, data);
  if (stage.kind === 'won') await emitCrmEvent('crm.opportunity.won', evCtx, data);
  if (stage.kind === 'lost') await emitCrmEvent('crm.opportunity.lost', evCtx, data);
  return row;
}
