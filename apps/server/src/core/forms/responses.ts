/**
 * Guardar y actualizar respuestas: archivos, nota del cuestionario, enlace de
 * edición, CRM, avisos y eventos. La validación la hace el motor antes.
 */
import crypto from 'crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { HookManager } from '../plugins/HookManager';
import { notifyTenant } from '../realtime/notifyTenant';
import { enqueueMail } from '../email/MailQueue';
import { ClientFactory } from '../tenant/ClientFactory';
import {
  allQuestions,
  gradeResponse,
  normalizeDefinition,
  type Answers,
  type FormDefinition,
} from './engine';
import { normalizeSettings, type FormSettings } from './settings';
import { readUploadToken } from './uploadToken';
import { answersAsText, applyCrm } from './crmBridge';

export const FORM_RESPONSE_EVENT = 'forms.response.created';
/** Nombre antiguo (formularios del CRM), se sigue emitiendo para no romper automatizaciones. */
export const LEGACY_FORM_EVENT = 'crm.form.submitted';

export function formParts(form: any): { def: FormDefinition; settings: FormSettings } {
  return {
    def: normalizeDefinition(form.definition, form.fields),
    settings: normalizeSettings(form.settings),
  };
}

export async function countResponses(db: any, formId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.formResponses)
    .where(eq(schema.formResponses.formId, formId));
  return r?.n ?? 0;
}

/**
 * Las preguntas de archivo llegan con tokens de subida. Se verifican, los
 * adjuntos pasan a ser de la respuesta y en la respuesta queda su id.
 * Lanza si algún token no vale.
 */
async function bindFiles(
  db: any,
  form: any,
  def: FormDefinition,
  answers: Answers,
  responseId: string,
) {
  for (const q of allQuestions(def)) {
    if (q.type !== 'file' || !Array.isArray(answers[q.id])) continue;
    const ids: string[] = [];
    for (const token of answers[q.id] as string[]) {
      // Al editar, los ya ligados llegan como id (no token): se conservan si son de esta respuesta.
      const id = readUploadToken(token, form.id) ?? token;
      ids.push(id);
    }
    const rows = ids.length
      ? await db
          .select({
            id: schema.attachments.id,
            entityType: schema.attachments.entityType,
            entityId: schema.attachments.entityId,
          })
          .from(schema.attachments)
          .where(inArray(schema.attachments.id, ids))
      : [];
    const ok = rows.filter(
      (r: any) =>
        (r.entityType === 'FormUploadPending' && r.entityId === form.id) ||
        (r.entityType === 'FormResponse' && r.entityId === responseId),
    );
    if (ok.length !== ids.length)
      throw new Error('Algún archivo no es válido o ha caducado; vuelve a subirlo');
    await db
      .update(schema.attachments)
      .set({ entityType: 'FormResponse', entityId: responseId })
      .where(inArray(schema.attachments.id, ids));
    answers[q.id] = ids;
  }
}

/** Avisos de respuesta nueva a los usuarios elegidos en el formulario. */
async function notifyOwners(
  tenantId: string,
  db: any,
  form: any,
  settings: FormSettings,
  def: FormDefinition,
  answers: Answers,
) {
  const userIds = settings.notifyUserIds.length
    ? settings.notifyUserIds
    : form.ownerUserId
      ? [form.ownerUserId]
      : [];
  if (userIds.length === 0) return;
  const link = `/forms/${form.id}?tab=responses`;
  await notifyTenant({
    tenantId,
    tenantClient: db,
    userIds,
    title: `Nueva respuesta en «${form.name}»`,
    link,
  });
  if (!settings.notifyEmail) return;
  const users = await ClientFactory.getClient('public')
    .select({ id: schema.globalUsers.id, email: schema.globalUsers.email })
    .from(schema.globalUsers)
    .where(inArray(schema.globalUsers.id, userIds));
  for (const u of users)
    if (u.email)
      enqueueMail(tenantId, {
        to: u.email,
        subject: `Nueva respuesta en «${form.name}»`,
        text: answersAsText(def, answers),
      });
}

export interface SubmitResult {
  responseId: string;
  editToken: string | null;
  opportunityId: string | null;
  grade: { score: number; maxScore: number; pending: boolean } | null;
}

export async function submitResponse(
  ctx: { tenantId: string; db: any },
  form: any,
  answers: Answers,
  opts: {
    invite?: any;
    email?: string | null;
    browserKey?: string | null;
    meta?: Record<string, any>;
  } = {},
): Promise<SubmitResult> {
  const { db, tenantId } = ctx;
  const { def, settings } = formParts(form);
  const responseId = crypto.randomUUID();
  await bindFiles(db, form, def, answers, responseId);

  const grade = settings.quiz.enabled ? gradeResponse(def, answers) : null;
  const editToken = settings.allowEdit ? crypto.randomBytes(18).toString('base64url') : null;
  const { opportunityId } = await applyCrm(ctx, form, def, settings, answers, {
    invite: opts.invite,
    email: opts.email,
  });

  await db.insert(schema.formResponses).values({
    id: responseId,
    formId: form.id,
    inviteId: opts.invite?.id ?? null,
    answers,
    respondentEmail: opts.email ?? opts.invite?.email ?? null,
    partnerId: opts.invite?.partnerId ?? null,
    contactId: opts.invite?.contactId ?? null,
    opportunityId,
    score: grade ? String(grade.score) : null,
    maxScore: grade ? String(grade.maxScore) : null,
    editToken,
    browserKey: opts.browserKey ?? null,
    meta: opts.meta ?? {},
  });
  if (opts.invite)
    await db
      .update(schema.formInvites)
      .set({ respondedAt: new Date() })
      .where(eq(schema.formInvites.id, opts.invite.id));

  try {
    await notifyOwners(tenantId, db, form, settings, def, answers);
  } catch (err: any) {
    console.error('[Formularios] Aviso de respuesta:', err?.message);
  }
  const data = { formId: form.id, formName: form.name, responseId, answers, opportunityId };
  for (const ev of [FORM_RESPONSE_EVENT, LEGACY_FORM_EVENT]) {
    try {
      await HookManager.trigger(ev, { tenantId, db, data });
    } catch (err: any) {
      console.error(`[Formularios] Hooks de ${ev}:`, err?.message);
    }
  }
  return {
    responseId,
    editToken,
    opportunityId,
    grade: grade ? { score: grade.score, maxScore: grade.maxScore, pending: grade.pending } : null,
  };
}

/** Quien respondió cambia su respuesta con su enlace de edición. */
export async function updateResponse(
  ctx: { tenantId: string; db: any },
  form: any,
  response: any,
  answers: Answers,
) {
  const { def, settings } = formParts(form);
  await bindFiles(ctx.db, form, def, answers, response.id);
  const grade = settings.quiz.enabled ? gradeResponse(def, answers, response.grades ?? {}) : null;
  await ctx.db
    .update(schema.formResponses)
    .set({
      answers,
      score: grade ? String(grade.score) : null,
      maxScore: grade ? String(grade.maxScore) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.formResponses.id, response.id), eq(schema.formResponses.formId, form.id)));
  return { grade };
}
