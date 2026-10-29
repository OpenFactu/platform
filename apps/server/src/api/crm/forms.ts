import { Router } from 'express';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import crypto from 'crypto';
import * as schema from '../../db/schema';
import { logAudit } from '../../utils/audit';
import { publicBaseUrl } from '../../utils/publicBaseUrl';
import { sendMail } from '../../core/email/Mailer';
import { sanitizeFields, summarizeResponses, type FormField } from '../../core/crm/forms';
import { pick, errorDetail } from './shared';

/** Administración de formularios y encuestas del CRM (/api/crm/forms). */
const router = Router();

const F = schema.crmForms;

/** slug de URL: minúsculas, sin acentos, con guiones, y un sufijo para que no choque. */
function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'formulario'}-${crypto.randomBytes(3).toString('hex')}`;
}

function sanitizeSettings(raw: any): Record<string, any> {
  const s = raw && typeof raw === 'object' ? raw : {};
  const str = (v: any, max = 300) => (v == null || v === '' ? undefined : String(v).slice(0, max));
  return {
    submitLabel: str(s.submitLabel, 60),
    successMessage: str(s.successMessage, 1000),
    createLead: !!s.createLead,
    stageId: str(s.stageId, 100),
    ownerUserId: str(s.ownerUserId, 100),
    source: str(s.source, 100),
  };
}

async function loadForm(req: any, res: any) {
  const [form] = await req.tenantClient.select().from(F).where(eq(F.id, req.params.id));
  if (!form) res.status(404).json({ error: 'Formulario no encontrado' });
  return form;
}

/** Enlace público del formulario (con token si es una invitación). */
async function formLink(req: any, form: any, token?: string) {
  const base = await publicBaseUrl(req);
  return `${base}/f/${req.tenantId}/${form.slug}${token ? `?t=${token}` : ''}`;
}

router.get('/', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select({
        form: F,
        responses: sql<number>`(select count(*)::int from "CrmFormResponse" r where r."formId" = ${F.id})`,
        lastResponseAt: sql<Date | null>`(select max(r."createdAt") from "CrmFormResponse" r where r."formId" = ${F.id})`,
      })
      .from(F)
      .orderBy(desc(F.updatedAt));
    res.json(
      rows.map((r: any) => ({
        ...r.form,
        responses: r.responses,
        lastResponseAt: r.lastResponseAt,
      })),
    );
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const kind = req.body?.kind === 'survey' ? 'survey' : 'form';
    // Un punto de partida útil: captación pide nombre y correo; una encuesta, NPS.
    const fields: FormField[] =
      kind === 'form'
        ? [
            { id: 'nombre', type: 'text', label: 'Nombre', required: true, mapTo: 'prospectName' },
            { id: 'empresa', type: 'text', label: 'Empresa', mapTo: 'prospectCompany' },
            {
              id: 'correo',
              type: 'email',
              label: 'Correo',
              required: true,
              mapTo: 'prospectEmail',
            },
            { id: 'telefono', type: 'phone', label: 'Teléfono', mapTo: 'prospectPhone' },
            {
              id: 'mensaje',
              type: 'textarea',
              label: '¿En qué podemos ayudarte?',
              mapTo: 'message',
            },
          ]
        : [
            {
              id: 'nps',
              type: 'nps',
              label: '¿Con qué probabilidad nos recomendarías?',
              required: true,
            },
            { id: 'comentario', type: 'textarea', label: '¿Qué podríamos mejorar?' },
          ];
    const [row] = await req.tenantClient
      .insert(F)
      .values({
        id: crypto.randomUUID(),
        name: name.slice(0, 200),
        kind,
        slug: slugify(name),
        title: name.slice(0, 200),
        fields,
        settings: kind === 'form' ? { createLead: true } : {},
        createdBy: req.user?.id ?? null,
      })
      .returning();
    res.json(row);
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const form = await loadForm(req, res);
    if (!form) return;
    res.json({ ...form, publicUrl: await formLink(req, form) });
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

router.patch('/:id', async (req: any, res) => {
  try {
    const old = await loadForm(req, res);
    if (!old) return;
    const patch: Record<string, any> = pick(req.body, ['name', 'title', 'intro', 'isActive']);
    if ('name' in patch && !String(patch.name ?? '').trim())
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    if ('fields' in (req.body ?? {})) patch.fields = sanitizeFields(req.body.fields);
    if ('settings' in (req.body ?? {})) patch.settings = sanitizeSettings(req.body.settings);
    if (req.body?.slug !== undefined) {
      const slug = String(req.body.slug)
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .slice(0, 60);
      if (slug.length < 3) return res.status(400).json({ error: 'El enlace es demasiado corto' });
      patch.slug = slug;
    }
    const [row] = await req.tenantClient
      .update(F)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(F.id, old.id))
      .returning();
    res.json({ ...row, publicUrl: await formLink(req, row) });
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'CrmForm',
      entityId: old.id,
      action: 'UPDATE',
      oldValue: { name: old.name, fields: old.fields?.length },
      newValue: { name: row.name, fields: row.fields?.length },
    });
  } catch (error: any) {
    const msg = errorDetail(error);
    res.status(/duplicate|unique/i.test(msg) ? 409 : 400).json({
      error: /duplicate|unique/i.test(msg) ? 'Ese enlace ya lo usa otro formulario' : msg,
    });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    const [row] = await req.tenantClient.delete(F).where(eq(F.id, req.params.id)).returning();
    if (!row) return res.status(404).json({ error: 'Formulario no encontrado' });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

/** GET /:id/responses — las respuestas con a quién pertenecen. */
router.get('/:id/responses', async (req: any, res) => {
  try {
    const R = schema.crmFormResponses;
    const rows = await req.tenantClient
      .select({
        response: R,
        partnerName: schema.businessPartners.name,
        contactName: schema.contacts.name,
        opportunityTitle: schema.opportunities.title,
      })
      .from(R)
      .leftJoin(schema.businessPartners, eq(R.partnerId, schema.businessPartners.id))
      .leftJoin(schema.contacts, eq(R.contactId, schema.contacts.id))
      .leftJoin(schema.opportunities, eq(R.opportunityId, schema.opportunities.id))
      .where(eq(R.formId, req.params.id))
      .orderBy(desc(R.createdAt))
      .limit(500);
    res.json(rows.map(({ response, ...rest }: any) => ({ ...response, ...rest })));
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

/** GET /:id/results — resumen por pregunta (recuentos, medias, NPS). */
router.get('/:id/results', async (req: any, res) => {
  try {
    const form = await loadForm(req, res);
    if (!form) return;
    const responses = await req.tenantClient
      .select({ answers: schema.crmFormResponses.answers })
      .from(schema.crmFormResponses)
      .where(eq(schema.crmFormResponses.formId, form.id))
      .orderBy(desc(schema.crmFormResponses.createdAt));
    res.json({ total: responses.length, fields: summarizeResponses(form.fields, responses) });
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

const csvCell = (v: unknown) => {
  const s = Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** GET /:id/export — respuestas en CSV (separador `;`, como abre Excel en español). */
router.get('/:id/export', async (req: any, res) => {
  try {
    const form = await loadForm(req, res);
    if (!form) return;
    const fields = (form.fields as FormField[]).filter((f) => f.type !== 'section');
    const rows = await req.tenantClient
      .select({
        response: schema.crmFormResponses,
        partnerName: schema.businessPartners.name,
        contactName: schema.contacts.name,
      })
      .from(schema.crmFormResponses)
      .leftJoin(
        schema.businessPartners,
        eq(schema.crmFormResponses.partnerId, schema.businessPartners.id),
      )
      .leftJoin(schema.contacts, eq(schema.crmFormResponses.contactId, schema.contacts.id))
      .where(eq(schema.crmFormResponses.formId, form.id))
      .orderBy(desc(schema.crmFormResponses.createdAt));
    const header = ['Fecha', 'Cliente', 'Contacto', ...fields.map((f) => f.label)];
    const lines = rows.map((r: any) => [
      new Date(r.response.createdAt).toISOString().slice(0, 16).replace('T', ' '),
      r.partnerName ?? '',
      r.contactName ?? '',
      ...fields.map((f) => r.response.answers?.[f.id]),
    ]);
    const csv = [header, ...lines].map((l) => l.map(csvCell).join(';')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${form.slug}.csv"`);
    res.send('﻿' + csv);
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

/** GET /:id/invites — invitaciones enviadas y si ya han respondido. */
router.get('/:id/invites', async (req: any, res) => {
  try {
    const form = await loadForm(req, res);
    if (!form) return;
    const I = schema.crmFormInvites;
    const rows = await req.tenantClient
      .select({
        invite: I,
        contactName: schema.contacts.name,
        contactEmail: schema.contacts.email,
        partnerName: schema.businessPartners.name,
      })
      .from(I)
      .leftJoin(schema.contacts, eq(I.contactId, schema.contacts.id))
      .leftJoin(schema.businessPartners, eq(I.partnerId, schema.businessPartners.id))
      .where(eq(I.formId, form.id))
      .orderBy(desc(I.createdAt));
    const out = [];
    for (const r of rows)
      out.push({
        ...r.invite,
        contactName: r.contactName,
        contactEmail: r.contactEmail,
        partnerName: r.partnerName,
        link: await formLink(req, form, r.invite.token),
      });
    res.json(out);
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

/**
 * POST /:id/invites — body { contactIds: string[], send?: boolean }.
 * Crea un enlace personal por contacto (reutiliza el pendiente si lo hay) y,
 * con `send`, lo manda por correo con el SMTP de la empresa. Si el correo
 * falla, el enlace queda creado igualmente para copiarlo a mano.
 */
router.post('/:id/invites', async (req: any, res) => {
  try {
    const form = await loadForm(req, res);
    if (!form) return;
    if (!form.isActive) return res.status(400).json({ error: 'Activa antes el formulario' });
    const ids: string[] = Array.isArray(req.body?.contactIds)
      ? req.body.contactIds.map(String).slice(0, 500)
      : [];
    if (ids.length === 0) return res.status(400).json({ error: 'Elige al menos un contacto' });
    const send = req.body?.send === true;
    const I = schema.crmFormInvites;

    const contacts = await req.tenantClient
      .select()
      .from(schema.contacts)
      .where(inArray(schema.contacts.id, ids));
    const pending = await req.tenantClient
      .select()
      .from(I)
      .where(and(eq(I.formId, form.id), inArray(I.contactId, ids), isNull(I.respondedAt)));
    const pendingByContact = new Map(pending.map((p: any) => [p.contactId, p]));

    const results: any[] = [];
    for (const c of contacts) {
      let invite: any = pendingByContact.get(c.id);
      if (!invite) {
        [invite] = await req.tenantClient
          .insert(I)
          .values({
            id: crypto.randomUUID(),
            formId: form.id,
            contactId: c.id,
            partnerId: c.partnerId,
            token: crypto.randomBytes(18).toString('base64url'),
          })
          .returning();
      }
      const link = await formLink(req, form, invite.token);
      let emailed = false;
      let emailError: string | undefined;
      if (send && c.email) {
        try {
          await sendMail(req.tenantId, req.tenantClient, {
            to: c.email,
            subject: form.title || form.name,
            text: `Hola ${c.name}:\n\n${form.intro ? `${form.intro}\n\n` : ''}Puedes responder aquí:\n${link}\n\nGracias.`,
          });
          emailed = true;
          await req.tenantClient.update(I).set({ sentAt: new Date() }).where(eq(I.id, invite.id));
        } catch (err: any) {
          emailError = err?.message || 'No se pudo enviar el correo';
        }
      }
      results.push({
        contactId: c.id,
        contactName: c.name,
        email: c.email,
        link,
        emailed,
        emailError,
      });
    }
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

export default router;
