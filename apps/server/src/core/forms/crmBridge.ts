/**
 * Lo que el CRM hace con una respuesta, si la empresa lo tiene activo:
 *   - formulario con «crear prospecto»: crea o completa la oportunidad con los
 *     campos mapeados (`mapTo`);
 *   - respuesta a una invitación de un contacto: nota en su ficha.
 * Sin CRM, no hace nada: los formularios funcionan igual.
 */
import crypto from 'crypto';
import * as schema from '../../db/schema';
import { getConfigSection } from '../config/systemConfigSection';
import { FLAGS_DEFAULTS } from '../config/appConfig';
import { createLeadFromSubmission } from '../crm/leads';
import {
  allQuestions,
  formatAnswer,
  type Answers,
  type FormDefinition,
  type MapTarget,
} from './engine';
import type { FormSettings } from './settings';

export async function crmEnabled(db: any): Promise<boolean> {
  const flags = await getConfigSection(db, 'flags', FLAGS_DEFAULTS);
  return !!flags.crmEnabled;
}

/** Respuestas en texto, una por línea (para notas y avisos). */
export function answersAsText(def: FormDefinition, answers: Answers): string {
  return allQuestions(def)
    .map((q) => {
      const v = formatAnswer(q, answers);
      return v ? `${q.title}: ${v}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

export async function applyCrm(
  ctx: { tenantId: string; db: any },
  form: { id: string; name: string },
  def: FormDefinition,
  settings: FormSettings,
  answers: Answers,
  opts: { invite?: any; email?: string | null },
): Promise<{ opportunityId: string | null }> {
  if (!(await crmEnabled(ctx.db))) return { opportunityId: null };

  if (opts.invite && (opts.invite.partnerId || opts.invite.contactId)) {
    await ctx.db.insert(schema.crmActivities).values({
      id: crypto.randomUUID(),
      type: 'note',
      subject: `Respuesta a «${form.name}»`,
      body: answersAsText(def, answers),
      partnerId: opts.invite.partnerId,
      contactId: opts.invite.contactId,
      doneAt: new Date(),
    });
    return { opportunityId: null };
  }

  if (!settings.crm.createLead) return { opportunityId: null };
  const mapped: Partial<Record<MapTarget, string>> = {};
  for (const q of allQuestions(def)) {
    const v = formatAnswer(q, answers);
    if (q.mapTo && v) mapped[q.mapTo] = v;
  }
  const others = allQuestions(def)
    .filter((q) => !q.mapTo)
    .map((q) => {
      const v = formatAnswer(q, answers);
      return v ? `${q.title}: ${v}` : '';
    })
    .filter(Boolean)
    .join('\n');
  const lead = await createLeadFromSubmission(ctx, {
    name: mapped.prospectName ?? null,
    email: mapped.prospectEmail ?? opts.email ?? null,
    message: [mapped.message, others].filter(Boolean).join('\n\n'),
    fields: {
      ...(mapped.prospectCompany ? { Empresa: mapped.prospectCompany } : {}),
      ...(mapped.prospectPhone ? { Teléfono: mapped.prospectPhone } : {}),
    },
    source: settings.crm.source,
    stageId: settings.crm.stageId,
    ownerUserId: settings.crm.ownerUserId,
    via: `el formulario «${form.name}»`,
    titlePrefix: form.name,
  });
  return { opportunityId: lead?.opportunityId ?? null };
}
