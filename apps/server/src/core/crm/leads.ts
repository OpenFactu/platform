/**
 * Leads que entran solos (formularios de la web): se convierten en una
 * oportunidad de prospecto en la primera etapa abierta, con origen «Web».
 *
 * Si ya hay una oportunidad abierta del mismo correo, no se duplica: el nuevo
 * mensaje se apunta como nota en ella.
 */
import crypto from 'crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { HookManager } from '../plugins/HookManager';
import { getConfigSection } from '../config/systemConfigSection';
import { FLAGS_DEFAULTS } from '../config/appConfig';
import { notifyTenant } from '../realtime/notifyTenant';
import { getCrmSettings } from './settings';
import { emitCrmEvent } from './events';

export const WEBSITE_FORM_EVENT = 'website.formSubmitted';

export interface IncomingLead {
  name?: string | null;
  email?: string | null;
  message?: string | null;
  /** Campos extra del formulario, tal cual llegan. */
  fields?: Record<string, string>;
  /** Origen a apuntar; por defecto el de la web. */
  source?: string;
  /** Para el texto de la nota: «formulario de contacto», «encuesta X»… */
  via?: string;
}

/** Busca en los campos extra el primero cuyo nombre case con el patrón. */
function pickField(fields: Record<string, string> | undefined, re: RegExp): string | null {
  if (!fields) return null;
  for (const [k, v] of Object.entries(fields)) if (re.test(k) && v?.trim()) return v.trim();
  return null;
}

/** Elige del catálogo de orígenes el que sea «web» (por si la empresa lo renombró). */
function webSource(sources: string[]): string {
  return sources.find((s) => /web/i.test(s)) ?? 'Web';
}

export async function createLeadFromSubmission(
  ctx: { tenantId: string; db: any },
  lead: IncomingLead,
): Promise<{ opportunityId: string; created: boolean } | null> {
  const { db, tenantId } = ctx;
  const flags = await getConfigSection(db, 'flags', FLAGS_DEFAULTS);
  if (!flags.crmEnabled) return null;

  const email = lead.email?.trim().toLowerCase() || null;
  const name = lead.name?.trim() || null;
  const company = pickField(lead.fields, /empresa|company|compa[ñn][ií]a|organiza/i);
  const phone = pickField(lead.fields, /tel|phone|m[óo]vil|mobile/i);
  if (!email && !name && !company && !phone) return null;

  const settings = await getCrmSettings(db);
  const extras = Object.entries(lead.fields ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const body = [lead.message?.trim(), extras].filter(Boolean).join('\n\n') || null;

  // ¿Ya hay una oportunidad abierta de este correo?
  let existing: any = null;
  if (email) {
    [existing] = await db
      .select({ id: schema.opportunities.id, ownerUserId: schema.opportunities.ownerUserId })
      .from(schema.opportunities)
      .innerJoin(
        schema.opportunityStages,
        eq(schema.opportunities.stageId, schema.opportunityStages.id),
      )
      .where(
        and(
          eq(schema.opportunityStages.kind, 'open'),
          sql`lower(${schema.opportunities.prospectEmail}) = ${email}`,
        ),
      )
      .orderBy(desc(schema.opportunities.createdAt))
      .limit(1);
  }

  let opportunityId: string;
  let ownerUserId: string | null;
  if (existing) {
    opportunityId = existing.id;
    ownerUserId = existing.ownerUserId;
  } else {
    const [stage] = await db
      .select()
      .from(schema.opportunityStages)
      .where(eq(schema.opportunityStages.kind, 'open'))
      .orderBy(asc(schema.opportunityStages.sortOrder))
      .limit(1);
    if (!stage) return null;
    opportunityId = crypto.randomUUID();
    ownerUserId = settings.defaultOwnerUserId || null;
    const [opp] = await db
      .insert(schema.opportunities)
      .values({
        id: opportunityId,
        title: `Contacto web: ${company || name || email}`.slice(0, 200),
        stageId: stage.id,
        prospectName: name,
        prospectCompany: company,
        prospectEmail: email,
        prospectPhone: phone,
        source: lead.source ?? webSource(settings.sources),
        ownerUserId,
        lastActivityAt: new Date(),
      })
      .returning();
    await emitCrmEvent(
      'crm.opportunity.created',
      { tenantId, db },
      { ...opp, stageName: stage.name, stageKind: stage.kind },
    );
  }

  const [activity] = await db
    .insert(schema.crmActivities)
    .values({
      id: crypto.randomUUID(),
      type: 'note',
      subject: `Mensaje recibido por ${lead.via ?? 'el formulario de la web'}`,
      body,
      opportunityId,
      ownerUserId,
      doneAt: new Date(),
    })
    .returning();
  await db
    .update(schema.opportunities)
    .set({ lastActivityAt: new Date() })
    .where(eq(schema.opportunities.id, opportunityId));
  await emitCrmEvent('crm.activity.created', { tenantId, db }, activity);

  if (ownerUserId) {
    await notifyTenant({
      tenantId,
      tenantClient: db,
      userIds: [ownerUserId],
      title: existing ? 'Nuevo mensaje de un prospecto' : 'Nuevo lead desde la web',
      body: `${name || company || email} ha escrito desde la web.`,
      link: `/crm/opportunities/${opportunityId}`,
    });
  }
  return { opportunityId, created: !existing };
}

let registered = false;
/** El CRM escucha los formularios de la web (los emite publicSite). */
export function registerCrmLeadListener() {
  if (registered) return;
  registered = true;
  HookManager.register(WEBSITE_FORM_EVENT, async (ctx: any) => {
    try {
      await createLeadFromSubmission({ tenantId: ctx.tenantId, db: ctx.db }, ctx.data ?? {});
    } catch (err: any) {
      console.error('[CRM] No se pudo crear el lead del formulario:', err?.message);
    }
  });
}
