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

  await createStageFollowUp(db, ctx, row, stage);

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

/**
 * Seguimiento de la etapa: «al entrar en Propuesta, llamar a los 3 días». Se
 * crea para el responsable de la oportunidad al entrar en la etapa (también
 * al crearla directamente en ella).
 */
export async function createStageFollowUp(
  db: any,
  ctx: { tenantId?: string; user?: any },
  opportunity: any,
  stage: any,
): Promise<void> {
  if (!stage.followUpType || stage.followUpDays == null) return;
  const [activity] = await db
    .insert(schema.crmActivities)
    .values({
      id: crypto.randomUUID(),
      type: stage.followUpType,
      subject: stage.followUpSubject || `Seguimiento: ${opportunity.title}`,
      partnerId: opportunity.partnerId,
      contactId: opportunity.contactId,
      opportunityId: opportunity.id,
      ownerUserId: opportunity.ownerUserId,
      dueAt: new Date(Date.now() + stage.followUpDays * 86_400_000),
    })
    .returning();
  await emitCrmEvent(
    'crm.activity.created',
    { tenantId: ctx.tenantId, db, user: ctx.user },
    activity,
  );
}
