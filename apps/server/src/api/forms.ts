import { Router } from 'express';
import multer from 'multer';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import crypto from 'crypto';
import QRCode from 'qrcode';
import * as schema from '../db/schema';
import { logAudit } from '../utils/audit';
import { publicBaseUrl } from '../utils/publicBaseUrl';
import { enqueueMail } from '../core/email/MailQueue';
import {
  allQuestions,
  assertValidDefinition,
  formatAnswer,
  gradeResponse,
  summarize,
} from '../core/forms/engine';
import { normalizeSettings, normalizeTheme } from '../core/forms/settings';
import { TEMPLATES, type TemplateId } from '../core/forms/templates';
import { countResponses, formParts } from '../core/forms/responses';
import { purgeFormFiles, responseFiles, storeUpload, streamFile } from '../core/forms/files';
import { crmEnabled } from '../core/forms/crmBridge';

/** Administración de formularios (/api/forms, permiso /forms). */
const router = Router();
const F = schema.forms;
const R = schema.formResponses;
const upload = multer({ dest: '/tmp/keirost-forms/', limits: { fileSize: 10 * 1024 * 1024 } });

const err = (e: any) => e?.cause?.detail || e?.cause?.message || e?.message || 'Error desconocido';

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

async function loadForm(req: any, res: any) {
  const [form] = await req.tenantClient.select().from(F).where(eq(F.id, req.params.id));
  if (!form) res.status(404).json({ error: 'Formulario no encontrado' });
  return form;
}

async function formLink(req: any, form: any, query = '') {
  return `${await publicBaseUrl(req)}/f/${req.tenantId}/${form.slug}${query}`;
}

/** El formulario como lo usa el editor: definición v2 y ajustes completos. */
async function present(req: any, form: any) {
  const { def, settings } = formParts(form);
  return {
    ...form,
    fields: undefined,
    definition: def,
    settings,
    theme: normalizeTheme(form.theme),
    publicUrl: await formLink(req, form),
    responses: await countResponses(req.tenantClient, form.id),
  };
}

router.get('/', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select({
        form: F,
        responses: sql<number>`(select count(*)::int from "FormResponse" r where r."formId" = ${F.id})`,
        lastResponseAt: sql<Date | null>`(select max(r."createdAt") from "FormResponse" r where r."formId" = ${F.id})`,
      })
      .from(F)
      .orderBy(desc(F.updatedAt));
    res.json(
      rows.map((r: any) => ({
        id: r.form.id,
        name: r.form.name,
        kind: r.form.kind,
        slug: r.form.slug,
        isActive: r.form.isActive,
        updatedAt: r.form.updatedAt,
        responses: r.responses,
        lastResponseAt: r.lastResponseAt,
      })),
    );
  } catch (e: any) {
    res.status(500).json({ error: err(e) });
  }
});

router.get('/templates', (_req, res) => {
  res.json(Object.entries(TEMPLATES).map(([id, t]) => ({ id, label: t.label, kind: t.kind })));
});

/** POST / — { name, template? } */
router.post('/', async (req: any, res) => {
  try {
    const name = String(req.body?.name ?? '')
      .trim()
      .slice(0, 200);
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const t = TEMPLATES[(req.body?.template as TemplateId) ?? 'blank'] ?? TEMPLATES.blank;
    const [row] = await req.tenantClient
      .insert(F)
      .values({
        id: crypto.randomUUID(),
        name,
        kind: t.kind,
        slug: slugify(name),
        title: name,
        definition: t.definition,
        settings: normalizeSettings({ ...t.settings }),
        ownerUserId: req.user?.id ?? null,
        createdBy: req.user?.id ?? null,
      })
      .returning();
    res.json(await present(req, row));
  } catch (e: any) {
    res.status(500).json({ error: err(e) });
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const form = await loadForm(req, res);
    if (form) res.json(await present(req, form));
  } catch (e: any) {
    res.status(500).json({ error: err(e) });
  }
});

/** PATCH /:id — lo que manda el editor (guardado automático). */
router.patch('/:id', async (req: any, res) => {
  try {
    const old = await loadForm(req, res);
    if (!old) return;
    const b = req.body ?? {};
    const patch: Record<string, any> = {};
    if ('name' in b) {
      if (!String(b.name ?? '').trim())
        return res.status(400).json({ error: 'El nombre es obligatorio' });
      patch.name = String(b.name).slice(0, 200);
    }
    if ('title' in b) patch.title = b.title ? String(b.title).slice(0, 300) : null;
    if ('intro' in b) patch.intro = b.intro ? String(b.intro).slice(0, 5000) : null;
    if ('isActive' in b) patch.isActive = !!b.isActive;
    if ('definition' in b) {
      assertValidDefinition(b.definition);
      patch.definition = b.definition;
    }
    if ('settings' in b) patch.settings = normalizeSettings(b.settings);
    if ('theme' in b) patch.theme = normalizeTheme(b.theme);
    if (b.slug !== undefined) {
      const slug = String(b.slug)
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
    res.json(await present(req, row));
  } catch (e: any) {
    const msg = err(e);
    const dup = /duplicate|unique/i.test(msg);
    res.status(dup ? 409 : 400).json({ error: dup ? 'Ese enlace ya lo usa otro formulario' : msg });
  }
});

router.post('/:id/duplicate', async (req: any, res) => {
  try {
    const form = await loadForm(req, res);
    if (!form) return;
    const { def, settings } = formParts(form);
    const name = `${form.name} (copia)`.slice(0, 200);
    const [row] = await req.tenantClient
      .insert(F)
      .values({
        id: crypto.randomUUID(),
        name,
        kind: form.kind,
        slug: slugify(name),
        title: form.title,
        intro: form.intro,
        definition: def,
        settings,
        theme: form.theme,
        isActive: false,
        ownerUserId: req.user?.id ?? null,
        createdBy: req.user?.id ?? null,
      })
      .returning();
    res.json(await present(req, row));
  } catch (e: any) {
    res.status(500).json({ error: err(e) });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    const responses = await req.tenantClient
      .select({ id: R.id })
      .from(R)
      .where(eq(R.formId, req.params.id));
    const [row] = await req.tenantClient.delete(F).where(eq(F.id, req.params.id)).returning();
    if (!row) return res.status(404).json({ error: 'Formulario no encontrado' });
    // Las respuestas caen en cascada; sus archivos y las imágenes del formulario, aquí.
    await purgeFormFiles(
      req.tenantClient,
      req.tenantSchema,
      row.id,
      responses.map((r: any) => r.id),
    );
    res.json({ success: true });
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'Form',
      entityId: row.id,
      action: 'DELETE',
      oldValue: { name: row.name },
    });
  } catch (e: any) {
    res.status(500).json({ error: err(e) });
  }
});

// ── Imágenes del formulario ──────────────────────────────────────────────

router.post('/:id/assets', upload.single('file'), async (req: any, res) => {
  try {
    const form = await loadForm(req, res);
    if (!form) return;
    if (!req.file) return res.status(400).json({ error: 'Falta la imagen' });
    if (!/^image\//.test(req.file.mimetype))
      return res.status(400).json({ error: 'Solo imágenes' });
    res.json(
      await storeUpload(
        req.tenantClient,
        req.tenantSchema,
        req.file,
        'FormAsset',
        form.id,
        req.user?.id ?? null,
      ),
    );
  } catch (e: any) {
    res.status(500).json({ error: err(e) });
  }
});

router.get('/:id/assets/:assetId', async (req: any, res) => {
  try {
    await streamFile(
      req.tenantClient,
      req.tenantSchema,
      res,
      req.params.assetId,
      'FormAsset',
      req.params.id,
      'inline',
    );
  } catch (e: any) {
    res.status(500).json({ error: err(e) });
  }
});

// ── Respuestas ───────────────────────────────────────────────────────────

router.get('/:id/responses', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select({
        response: R,
        partnerName: schema.businessPartners.name,
        contactName: schema.contacts.name,
      })
      .from(R)
      .leftJoin(schema.businessPartners, eq(R.partnerId, schema.businessPartners.id))
      .leftJoin(schema.contacts, eq(R.contactId, schema.contacts.id))
      .where(eq(R.formId, req.params.id))
      .orderBy(desc(R.createdAt))
      .limit(2000);
    res.json(
      rows.map(({ response, ...rest }: any) => ({
        ...response,
        editToken: undefined,
        browserKey: undefined,
        ...rest,
      })),
    );
  } catch (e: any) {
    res.status(500).json({ error: err(e) });
  }
});

router.get('/:id/responses/:rid', async (req: any, res) => {
  try {
    const form = await loadForm(req, res);
    if (!form) return;
    const [row] = await req.tenantClient
      .select()
      .from(R)
      .where(and(eq(R.id, req.params.rid), eq(R.formId, form.id)));
    if (!row) return res.status(404).json({ error: 'Respuesta no encontrada' });
    const { def, settings } = formParts(form);
    res.json({
      ...row,
      editToken: undefined,
      browserKey: undefined,
      files: await responseFiles(req.tenantClient, row.id),
      grading: settings.quiz.enabled ? gradeResponse(def, row.answers, row.grades ?? {}) : null,
    });
  } catch (e: any) {
    res.status(500).json({ error: err(e) });
  }
});

/** PATCH /:id/responses/:rid/grades — { grades: { questionId: puntos } } (corrección manual). */
router.patch('/:id/responses/:rid/grades', async (req: any, res) => {
  try {
    const form = await loadForm(req, res);
    if (!form) return;
    const [row] = await req.tenantClient
      .select()
      .from(R)
      .where(and(eq(R.id, req.params.rid), eq(R.formId, form.id)));
    if (!row) return res.status(404).json({ error: 'Respuesta no encontrada' });
    const grades: Record<string, number> = {};
    for (const [k, v] of Object.entries(req.body?.grades ?? {}))
      if (v !== null && v !== '' && Number.isFinite(Number(v))) grades[k] = Number(v);
    const { def } = formParts(form);
    const g = gradeResponse(def, row.answers, grades);
    await req.tenantClient
      .update(R)
      .set({ grades, score: String(g.score), maxScore: String(g.maxScore), gradedAt: new Date() })
      .where(eq(R.id, row.id));
    res.json(g);
  } catch (e: any) {
    res.status(500).json({ error: err(e) });
  }
});

router.delete('/:id/responses/:rid', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .delete(R)
      .where(and(eq(R.id, req.params.rid), eq(R.formId, req.params.id)))
      .returning({ id: R.id });
    await purgeFormFiles(
      req.tenantClient,
      req.tenantSchema,
      null,
      rows.map((r: any) => r.id),
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: err(e) });
  }
});

/** DELETE /:id/responses — borra todas (con confirmación en la interfaz). */
router.delete('/:id/responses', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .delete(R)
      .where(eq(R.formId, req.params.id))
      .returning({ id: R.id });
    await purgeFormFiles(
      req.tenantClient,
      req.tenantSchema,
      null,
      rows.map((r: any) => r.id),
    );
    res.json({ deleted: rows.length });
  } catch (e: any) {
    res.status(500).json({ error: err(e) });
  }
});

router.get('/:id/responses/:rid/files/:fileId', async (req: any, res) => {
  try {
    await streamFile(
      req.tenantClient,
      req.tenantSchema,
      res,
      req.params.fileId,
      'FormResponse',
      req.params.rid,
      'attachment',
    );
  } catch (e: any) {
    res.status(500).json({ error: err(e) });
  }
});

router.get('/:id/summary', async (req: any, res) => {
  try {
    const form = await loadForm(req, res);
    if (!form) return;
    const rows = await req.tenantClient
      .select({ answers: R.answers, score: R.score, maxScore: R.maxScore })
      .from(R)
      .where(eq(R.formId, form.id))
      .orderBy(desc(R.createdAt));
    const { def, settings } = formParts(form);
    const scores = rows.filter((r: any) => r.maxScore != null).map((r: any) => Number(r.score));
    res.json({
      total: rows.length,
      questions: summarize(def, rows),
      quiz: settings.quiz.enabled
        ? {
            average: scores.length
              ? Math.round(
                  (scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 100,
                ) / 100
              : null,
            maxScore: rows[0]?.maxScore != null ? Number(rows[0].maxScore) : null,
          }
        : null,
    });
  } catch (e: any) {
    res.status(500).json({ error: err(e) });
  }
});

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** GET /:id/export — CSV con `;` (como lo abre Excel en español). */
router.get('/:id/export', async (req: any, res) => {
  try {
    const form = await loadForm(req, res);
    if (!form) return;
    const { def, settings } = formParts(form);
    const questions = allQuestions(def);
    const rows = await req.tenantClient
      .select()
      .from(R)
      .where(eq(R.formId, form.id))
      .orderBy(desc(R.createdAt));
    const header = [
      'Fecha',
      'Correo',
      ...(settings.quiz.enabled ? ['Nota', 'Máximo'] : []),
      ...questions.map((q) => q.title),
    ];
    const lines = rows.map((r: any) => [
      new Date(r.createdAt).toISOString().slice(0, 16).replace('T', ' '),
      r.respondentEmail ?? '',
      ...(settings.quiz.enabled ? [r.score ?? '', r.maxScore ?? ''] : []),
      ...questions.map((q) => formatAnswer(q, r.answers ?? {})),
    ]);
    const csv = [header, ...lines].map((l) => l.map(csvCell).join(';')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${form.slug}.csv"`);
    res.send('﻿' + csv);
  } catch (e: any) {
    res.status(500).json({ error: err(e) });
  }
});

/** POST /:id/release-scores — publica las notas (cuestionario con «más tarde») y las manda por correo. */
router.post('/:id/release-scores', async (req: any, res) => {
  try {
    const form = await loadForm(req, res);
    if (!form) return;
    const settings = normalizeSettings(form.settings);
    settings.quiz.released = true;
    await req.tenantClient
      .update(F)
      .set({ settings, updatedAt: new Date() })
      .where(eq(F.id, form.id));
    const rows = await req.tenantClient
      .select({ email: R.respondentEmail, score: R.score, maxScore: R.maxScore })
      .from(R)
      .where(and(eq(R.formId, form.id), sql`${R.respondentEmail} is not null`));
    for (const r of rows)
      enqueueMail(req.tenantId, {
        to: r.email,
        subject: `Tu nota en «${form.title || form.name}»`,
        text: `Has obtenido ${Number(r.score)} de ${Number(r.maxScore)} puntos.`,
      });
    res.json({ sent: rows.length });
  } catch (e: any) {
    res.status(500).json({ error: err(e) });
  }
});

// ── Compartir ────────────────────────────────────────────────────────────

router.get('/:id/qr', async (req: any, res) => {
  try {
    const form = await loadForm(req, res);
    if (!form) return;
    const url = await formLink(req, form);
    res.json({ url, dataUrl: await QRCode.toDataURL(url, { width: 512, margin: 2 }) });
  } catch (e: any) {
    res.status(500).json({ error: err(e) });
  }
});

router.get('/:id/invites', async (req: any, res) => {
  try {
    const form = await loadForm(req, res);
    if (!form) return;
    const I = schema.formInvites;
    const rows = await req.tenantClient
      .select({ invite: I, contactName: schema.contacts.name, contactEmail: schema.contacts.email })
      .from(I)
      .leftJoin(schema.contacts, eq(I.contactId, schema.contacts.id))
      .where(eq(I.formId, form.id))
      .orderBy(desc(I.createdAt));
    const out = [];
    for (const r of rows)
      out.push({
        id: r.invite.id,
        name: r.contactName ?? null,
        email: r.invite.email ?? r.contactEmail ?? null,
        sentAt: r.invite.sentAt,
        respondedAt: r.invite.respondedAt,
        link: await formLink(req, form, `?t=${r.invite.token}`),
      });
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: err(e) });
  }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /:id/invites — { emails?: string[], contactIds?: string[], message?, send }.
 * Un enlace personal por destinatario (reutiliza el pendiente) y, con `send`,
 * correo por el SMTP de la empresa. Los contactos solo con el CRM activo.
 */
router.post('/:id/invites', async (req: any, res) => {
  try {
    const form = await loadForm(req, res);
    if (!form) return;
    if (!form.isActive) return res.status(400).json({ error: 'Activa antes el formulario' });
    const I = schema.formInvites;
    const emails: string[] = Array.from(
      new Set(
        (Array.isArray(req.body?.emails) ? req.body.emails : [])
          .map((e: any) => String(e).trim().toLowerCase())
          .filter((e: string) => EMAIL_RE.test(e)),
      ),
    ).slice(0, 500) as string[];
    const contactIds: string[] = Array.isArray(req.body?.contactIds)
      ? req.body.contactIds.map(String).slice(0, 500)
      : [];
    if (!emails.length && !contactIds.length)
      return res.status(400).json({ error: 'Añade al menos un destinatario' });

    const targets: Array<{
      name: string | null;
      email: string | null;
      contactId: string | null;
      partnerId: string | null;
    }> = emails.map((email) => ({ name: null, email, contactId: null, partnerId: null }));
    if (contactIds.length && (await crmEnabled(req.tenantClient))) {
      const cs = await req.tenantClient
        .select()
        .from(schema.contacts)
        .where(inArray(schema.contacts.id, contactIds));
      for (const c of cs)
        targets.push({ name: c.name, email: c.email, contactId: c.id, partnerId: c.partnerId });
    }

    const pending = await req.tenantClient
      .select()
      .from(I)
      .where(and(eq(I.formId, form.id), isNull(I.respondedAt)));
    const send = req.body?.send === true;
    const message = req.body?.message ? String(req.body.message).slice(0, 2000) : form.intro;
    const results = [];
    for (const t of targets) {
      let invite = pending.find(
        (p: any) =>
          (t.contactId && p.contactId === t.contactId) ||
          (!t.contactId && t.email && p.email === t.email),
      );
      if (!invite)
        [invite] = await req.tenantClient
          .insert(I)
          .values({
            id: crypto.randomUUID(),
            formId: form.id,
            contactId: t.contactId,
            partnerId: t.partnerId,
            email: t.email,
            token: crypto.randomBytes(18).toString('base64url'),
          })
          .returning();
      const link = await formLink(req, form, `?t=${invite.token}`);
      let emailed = false;
      if (send && t.email) {
        enqueueMail(req.tenantId, {
          to: t.email,
          subject: form.title || form.name,
          text: `${t.name ? `Hola ${t.name}:\n\n` : ''}${message ? `${message}\n\n` : ''}Puedes responder aquí:\n${link}\n\nGracias.`,
        });
        emailed = true;
        await req.tenantClient.update(I).set({ sentAt: new Date() }).where(eq(I.id, invite.id));
      }
      results.push({ name: t.name, email: t.email, link, emailed });
    }
    res.json(results);
  } catch (e: any) {
    res.status(500).json({ error: err(e) });
  }
});

export default router;
