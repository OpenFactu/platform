/**
 * Formularios y encuestas del CRM: definición de campos, validación de
 * respuestas, resumen de resultados y lo que pasa al enviar.
 *
 * Las funciones de validación y resumen son puras (sin BD) para poder
 * probarlas sin servidor; `submitForm` es la única que escribe.
 */
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { HookManager } from '../plugins/HookManager';
import { createLeadFromSubmission } from './leads';

export const FIELD_TYPES = [
  'text',
  'textarea',
  'email',
  'phone',
  'number',
  'date',
  'select',
  'radio',
  'checkbox',
  'rating',
  'nps',
  'section',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** A qué dato del prospecto va una respuesta en los formularios de captación. */
export const MAP_TARGETS = [
  'prospectName',
  'prospectCompany',
  'prospectEmail',
  'prospectPhone',
  'message',
] as const;
export type MapTarget = (typeof MAP_TARGETS)[number];

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  help?: string;
  required?: boolean;
  /** Opciones de select / radio / checkbox. */
  options?: string[];
  mapTo?: MapTarget;
}

export interface FormSettings {
  submitLabel?: string;
  successMessage?: string;
  /** Formularios de captación: crear (o completar) un prospecto con la respuesta. */
  createLead?: boolean;
  stageId?: string;
  ownerUserId?: string;
  source?: string;
}

export const FORM_SUBMITTED_EVENT = 'crm.form.submitted';

const CHOICE_TYPES: FieldType[] = ['select', 'radio', 'checkbox'];

/** Limpia una definición de campos que llega del editor. Lanza con un mensaje legible. */
export function sanitizeFields(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) throw new Error('Los campos deben ser una lista');
  if (raw.length > 60) throw new Error('Un formulario admite como mucho 60 campos');
  const ids = new Set<string>();
  return raw.map((f: any, i) => {
    const type = FIELD_TYPES.includes(f?.type) ? (f.type as FieldType) : null;
    if (!type) throw new Error(`Campo ${i + 1}: tipo no válido`);
    const label = String(f?.label ?? '')
      .trim()
      .slice(0, 300);
    if (!label) throw new Error(`Campo ${i + 1}: falta el texto de la pregunta`);
    let id =
      String(f?.id ?? '')
        .trim()
        .slice(0, 60) || crypto.randomUUID();
    if (ids.has(id)) id = crypto.randomUUID();
    ids.add(id);
    const field: FormField = { id, type, label };
    if (f.help) field.help = String(f.help).slice(0, 500);
    if (f.required && type !== 'section') field.required = true;
    if (CHOICE_TYPES.includes(type)) {
      const options: string[] = Array.isArray(f.options)
        ? f.options
            .map((o: any) =>
              String(o ?? '')
                .trim()
                .slice(0, 200),
            )
            .filter(Boolean)
        : [];
      if (options.length === 0) throw new Error(`«${label}»: añade al menos una opción`);
      field.options = Array.from(new Set(options)).slice(0, 50);
    }
    if (f.mapTo && MAP_TARGETS.includes(f.mapTo)) field.mapTo = f.mapTo;
    return field;
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valida y normaliza las respuestas contra la definición. Lo que no es un
 * campo del formulario se descarta; los errores van por id de campo.
 */
export function validateAnswers(
  fields: FormField[],
  raw: Record<string, unknown>,
): { answers: Record<string, string | number | string[]>; errors: Record<string, string> } {
  const answers: Record<string, string | number | string[]> = {};
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (f.type === 'section') continue;
    const v = raw?.[f.id];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty) {
      if (f.required) errors[f.id] = 'Obligatorio';
      continue;
    }
    switch (f.type) {
      case 'email': {
        const s = String(v).trim().slice(0, 200);
        if (!EMAIL_RE.test(s)) errors[f.id] = 'Correo no válido';
        else answers[f.id] = s;
        break;
      }
      case 'number': {
        const n = Number(v);
        if (!Number.isFinite(n)) errors[f.id] = 'Número no válido';
        else answers[f.id] = n;
        break;
      }
      case 'rating':
      case 'nps': {
        const n = Number(v);
        const [min, max] = f.type === 'rating' ? [1, 5] : [0, 10];
        if (!Number.isInteger(n) || n < min || n > max)
          errors[f.id] = `Elige un valor entre ${min} y ${max}`;
        else answers[f.id] = n;
        break;
      }
      case 'date': {
        const s = String(v).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) errors[f.id] = 'Fecha no válida';
        else answers[f.id] = s;
        break;
      }
      case 'select':
      case 'radio': {
        const s = String(v);
        if (!f.options?.includes(s)) errors[f.id] = 'Opción no válida';
        else answers[f.id] = s;
        break;
      }
      case 'checkbox': {
        const list = (Array.isArray(v) ? v : [v]).map(String);
        const valid = list.filter((x) => f.options?.includes(x));
        if (valid.length === 0) errors[f.id] = 'Opción no válida';
        else answers[f.id] = Array.from(new Set(valid));
        break;
      }
      default:
        answers[f.id] = String(v).slice(0, f.type === 'textarea' ? 5000 : 500);
    }
  }
  return { answers, errors };
}

export interface FieldResult {
  fieldId: string;
  label: string;
  type: FieldType;
  answered: number;
  /** select / radio / checkbox / rating / nps: recuento por valor. */
  counts?: Record<string, number>;
  /** rating / nps / number: media. */
  average?: number | null;
  /** nps: % promotores − % detractores (−100 a 100). */
  nps?: number | null;
  /** Textos: las últimas respuestas. */
  samples?: string[];
}

/** Resumen por pregunta de un conjunto de respuestas (las más recientes primero). */
export function summarizeResponses(
  fields: FormField[],
  responses: Array<{ answers: Record<string, any> }>,
): FieldResult[] {
  return fields
    .filter((f) => f.type !== 'section')
    .map((f) => {
      const values = responses
        .map((r) => r.answers?.[f.id])
        .filter((v) => v !== undefined && v !== null && v !== '');
      const result: FieldResult = {
        fieldId: f.id,
        label: f.label,
        type: f.type,
        answered: values.length,
      };
      if (CHOICE_TYPES.includes(f.type) || f.type === 'rating' || f.type === 'nps') {
        const counts: Record<string, number> = {};
        if (f.options) for (const o of f.options) counts[o] = 0;
        if (f.type === 'rating') for (let i = 1; i <= 5; i++) counts[String(i)] = 0;
        if (f.type === 'nps') for (let i = 0; i <= 10; i++) counts[String(i)] = 0;
        for (const v of values)
          for (const x of Array.isArray(v) ? v : [v])
            counts[String(x)] = (counts[String(x)] ?? 0) + 1;
        result.counts = counts;
      }
      if (f.type === 'rating' || f.type === 'nps' || f.type === 'number') {
        const nums = values.map(Number).filter(Number.isFinite);
        result.average = nums.length
          ? Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 100) / 100
          : null;
      }
      if (f.type === 'nps') {
        const nums = values.map(Number);
        result.nps = nums.length
          ? Math.round(
              ((nums.filter((n) => n >= 9).length - nums.filter((n) => n <= 6).length) /
                nums.length) *
                100,
            )
          : null;
      }
      if (['text', 'textarea', 'email', 'phone', 'date'].includes(f.type)) {
        result.samples = values.slice(0, 20).map(String);
      }
      return result;
    });
}

/** Texto legible de las respuestas, para la nota que se apunta en el CRM. */
export function answersAsText(fields: FormField[], answers: Record<string, any>): string {
  return fields
    .filter((f) => f.type !== 'section' && answers[f.id] !== undefined)
    .map((f) => {
      const v = answers[f.id];
      return `${f.label}: ${Array.isArray(v) ? v.join(', ') : v}`;
    })
    .join('\n');
}

/**
 * Guarda una respuesta y hace lo que el formulario tenga configurado:
 *   - con invitación (encuesta personal): queda ligada a su contacto y cliente
 *     y se apunta como nota en el CRM;
 *   - formulario de captación con `createLead`: crea o completa un prospecto
 *     con los campos mapeados.
 * Emite `crm.form.submitted` para las automatizaciones.
 */
export async function submitForm(
  ctx: { tenantId: string; db: any },
  form: any,
  answers: Record<string, any>,
  opts: { invite?: any; meta?: Record<string, any> } = {},
): Promise<{ responseId: string; opportunityId: string | null }> {
  const { db, tenantId } = ctx;
  const fields: FormField[] = form.fields ?? [];
  const settings: FormSettings = form.settings ?? {};
  const invite = opts.invite;
  let opportunityId: string | null = null;

  if (!invite && form.kind === 'form' && settings.createLead) {
    const mapped: Partial<Record<MapTarget, string>> = {};
    for (const f of fields) {
      if (f.mapTo && answers[f.id] !== undefined) mapped[f.mapTo] = String(answers[f.id]);
    }
    const lead = await createLeadFromSubmission(ctx, {
      name: mapped.prospectName ?? null,
      email: mapped.prospectEmail ?? null,
      message: [
        mapped.message,
        answersAsText(
          fields.filter((f) => !f.mapTo),
          answers,
        ),
      ]
        .filter(Boolean)
        .join('\n\n'),
      fields: {
        ...(mapped.prospectCompany ? { Empresa: mapped.prospectCompany } : {}),
        ...(mapped.prospectPhone ? { Teléfono: mapped.prospectPhone } : {}),
      },
      source: settings.source || undefined,
      stageId: settings.stageId || undefined,
      ownerUserId: settings.ownerUserId || undefined,
      via: `el formulario «${form.name}»`,
      titlePrefix: form.name,
    });
    opportunityId = lead?.opportunityId ?? null;
  }

  const responseId = crypto.randomUUID();
  await db.insert(schema.crmFormResponses).values({
    id: responseId,
    formId: form.id,
    inviteId: invite?.id ?? null,
    answers,
    partnerId: invite?.partnerId ?? null,
    contactId: invite?.contactId ?? null,
    opportunityId,
    meta: opts.meta ?? {},
  });

  if (invite) {
    await db
      .update(schema.crmFormInvites)
      .set({ respondedAt: new Date() })
      .where(eq(schema.crmFormInvites.id, invite.id));
    if (invite.partnerId || invite.contactId) {
      await db.insert(schema.crmActivities).values({
        id: crypto.randomUUID(),
        type: 'note',
        subject: `Respuesta a «${form.name}»`,
        body: answersAsText(fields, answers),
        partnerId: invite.partnerId,
        contactId: invite.contactId,
        doneAt: new Date(),
      });
    }
  }

  try {
    await HookManager.trigger(FORM_SUBMITTED_EVENT, {
      tenantId,
      db,
      data: {
        formId: form.id,
        formName: form.name,
        kind: form.kind,
        responseId,
        answers,
        opportunityId,
      },
    });
  } catch (err: any) {
    console.error('[CRM] Error en los hooks del formulario:', err?.message);
  }
  return { responseId, opportunityId };
}
