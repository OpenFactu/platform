/**
 * Formularios, cara pública (sin sesión). Solo con el módulo Formularios
 * activo y el formulario existente:
 *
 *   GET  /:tenantId/:slug[?t=invitación][&e=edición]   definición, marca, estado
 *   POST /:tenantId/:slug                              { answers, email?, t?, browserKey?, website }
 *   PUT  /:tenantId/:slug/edit/:editToken              { answers }  (si el formulario permite editar)
 *   POST /:tenantId/:slug/upload                       multipart `file` + `questionId` → token
 *   GET  /:tenantId/:slug/assets/:id                   imágenes del formulario
 *
 * Antispam: campo trampa `website` y límite de peticiones por IP.
 */
import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import { and, eq, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { getConfigSection } from '../core/config/systemConfigSection';
import { BRANDING_DEFAULTS, FLAGS_DEFAULTS } from '../core/config/appConfig';
import { allQuestions, gradeResponse, validateAnswers } from '../core/forms/engine';
import { closedReason, normalizeTheme } from '../core/forms/settings';
import { countResponses, formParts, submitResponse, updateResponse } from '../core/forms/responses';
import { storeUpload, streamFile } from '../core/forms/files';
import { createUploadToken } from '../core/forms/uploadToken';

const router = Router();
const upload = multer({ dest: '/tmp/keirost-forms/', limits: { fileSize: 10 * 1024 * 1024 } });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map<string, number[]>();
function rateLimited(key: string, max: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= max) return true;
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000)
    for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  return false;
}
const ipOf = (req: any) =>
  String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? '').split(',')[0];

/** Empresa y formulario, o null con la respuesta 404 ya enviada. */
async function resolve(req: any, res: any) {
  const notFound = () => {
    res.status(404).json({ error: 'Este formulario no existe o ya no está disponible.' });
    return null;
  };
  let db: any;
  let tenant: any;
  try {
    db = await ClientFactory.getTenantClient(String(req.params.tenantId));
    [tenant] = await ClientFactory.getClient('public')
      .select({ schemaName: schema.tenants.schemaName })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, String(req.params.tenantId)));
  } catch {
    return notFound();
  }
  const flags = await getConfigSection(db, 'flags', FLAGS_DEFAULTS);
  if (!flags.formsEnabled) return notFound();
  const [form] = await db
    .select()
    .from(schema.forms)
    .where(eq(schema.forms.slug, String(req.params.slug)));
  if (!form) return notFound();
  return { db, form, tenantSchema: tenant.schemaName as string, ...formParts(form) };
}

async function inviteFor(db: any, formId: string, token: string) {
  if (!token) return null;
  const [row] = await db
    .select({ invite: schema.formInvites, contactName: schema.contacts.name })
    .from(schema.formInvites)
    .leftJoin(schema.contacts, eq(schema.formInvites.contactId, schema.contacts.id))
    .where(and(eq(schema.formInvites.token, token), eq(schema.formInvites.formId, formId)));
  return row ? { ...row.invite, contactName: row.contactName } : null;
}

async function responseByEditToken(db: any, formId: string, editToken: string) {
  if (!editToken) return null;
  const [row] = await db
    .select()
    .from(schema.formResponses)
    .where(
      and(eq(schema.formResponses.editToken, editToken), eq(schema.formResponses.formId, formId)),
    );
  return row ?? null;
}

router.get('/:tenantId/:slug', async (req: any, res) => {
  try {
    const r = await resolve(req, res);
    if (!r) return;
    const { form, def, settings, db } = r;
    const invite = await inviteFor(db, form.id, String(req.query.t ?? ''));
    const editing = settings.allowEdit
      ? await responseByEditToken(db, form.id, String(req.query.e ?? ''))
      : null;
    const closed = closedReason(form, settings, await countResponses(db, form.id));
    const branding = await getConfigSection(db, 'branding', BRANDING_DEFAULTS);
    // Lo que no debe ver quien responde: las respuestas correctas y el mapeo al CRM.
    const showAnswers = settings.quiz.enabled && settings.quiz.showCorrect;
    const publicDef = {
      ...def,
      sections: def.sections.map((s) => ({
        ...s,
        items: s.items.map((i: any) =>
          i.kind === 'question'
            ? { ...i, mapTo: undefined, quiz: i.quiz ? { points: i.quiz.points } : undefined }
            : i,
        ),
      })),
    };
    res.json({
      form: {
        id: form.id,
        title: form.title || form.name,
        intro: form.intro,
        definition: publicDef,
        settings: {
          submitLabel: settings.submitLabel ?? null,
          successMessage: settings.successMessage ?? null,
          collectEmail: settings.collectEmail,
          onePerPerson: settings.onePerPerson,
          allowEdit: settings.allowEdit,
          showProgress: settings.showProgress,
          shuffleQuestions: settings.shuffleQuestions,
          quiz: settings.quiz.enabled
            ? { release: settings.quiz.release, showCorrect: showAnswers }
            : null,
        },
        theme: normalizeTheme(form.theme),
      },
      closed,
      invitee: invite
        ? { name: invite.contactName ?? null, responded: !!invite.respondedAt }
        : null,
      editing: editing ? { answers: editing.answers, email: editing.respondentEmail } : null,
      branding: {
        appName: branding.appName,
        logoUrl: branding.logoUrl,
        colorPrimary: branding.colorPrimary,
        colorAccent: branding.colorAccent,
        themeMode: branding.themeMode,
        themePreset: branding.themePreset,
      },
    });
  } catch (error: any) {
    console.error('[publicForms] GET:', error?.message);
    res.status(500).json({ error: 'No se pudo cargar el formulario' });
  }
});

/** Lo que ve quien responde al enviar: mensaje, enlace de edición y, si toca, la nota. */
function afterSubmit(
  req: any,
  r: any,
  result: { editToken?: string | null; grade?: any },
  answers: any,
) {
  const { settings, def } = r;
  const quiz = settings.quiz;
  let score = null;
  if (
    quiz.enabled &&
    result.grade &&
    (quiz.release === 'immediate' || (quiz.release === 'later' && quiz.released))
  ) {
    const full = gradeResponse(def, answers);
    score = {
      score: result.grade.score,
      maxScore: result.grade.maxScore,
      pending: result.grade.pending,
      // Correctas y explicación solo si el formulario lo permite.
      questions: quiz.showCorrect
        ? Object.fromEntries(
            allQuestions(def)
              .filter((q) => full.questions[q.id])
              .map((q) => [
                q.id,
                {
                  ...full.questions[q.id],
                  correctAnswer: q.quiz?.correct ?? null,
                  feedback: full.questions[q.id].correct ? q.quiz?.feedbackOk : q.quiz?.feedbackKo,
                },
              ]),
          )
        : undefined,
    };
  }
  return {
    ok: true,
    message: settings.successMessage ?? null,
    editToken: result.editToken ?? null,
    score,
  };
}

router.post('/:tenantId/:slug', async (req: any, res) => {
  try {
    if (req.body?.website) return res.json({ ok: true });
    if (rateLimited(`post:${ipOf(req)}:${req.params.tenantId}:${req.params.slug}`, 10))
      return res.status(429).json({ error: 'Demasiados envíos seguidos. Prueba en unos minutos.' });
    const r = await resolve(req, res);
    if (!r) return;
    const { form, def, settings, db } = r;

    const closed = closedReason(form, settings, await countResponses(db, form.id));
    if (closed) return res.status(409).json({ error: closed });

    const invite = await inviteFor(db, form.id, String(req.body?.t ?? ''));
    if (invite?.respondedAt) return res.status(409).json({ error: 'Ya respondiste. ¡Gracias!' });

    // Correo de quien responde.
    let email: string | null = invite?.email ?? null;
    if (settings.collectEmail !== 'none') {
      const raw = String(req.body?.email ?? '')
        .trim()
        .toLowerCase();
      if (raw && !EMAIL_RE.test(raw))
        return res
          .status(422)
          .json({ error: 'Correo no válido', errors: { __email: 'Correo no válido' } });
      if (!raw && settings.collectEmail === 'required' && !email)
        return res
          .status(422)
          .json({ error: 'Indica tu correo', errors: { __email: 'Obligatorio' } });
      email = raw || email;
    }

    // Una por persona: por correo si lo hay, si no por la marca del navegador.
    const browserKey = String(req.body?.browserKey ?? '').slice(0, 100) || null;
    if (settings.onePerPerson) {
      const R = schema.formResponses;
      const cond = email
        ? sql`lower(${R.respondentEmail}) = ${email}`
        : browserKey
          ? eq(R.browserKey, browserKey)
          : null;
      if (cond) {
        const [dup] = await db
          .select({ id: R.id })
          .from(R)
          .where(and(eq(R.formId, form.id), cond))
          .limit(1);
        if (dup) return res.status(409).json({ error: 'Ya has respondido a este formulario.' });
      }
    }

    const { answers, errors } = validateAnswers(def, req.body?.answers ?? {});
    if (Object.keys(errors).length)
      return res.status(422).json({ error: 'Revisa el formulario', errors });

    const result = await submitResponse(
      { tenantId: String(req.params.tenantId), db },
      form,
      answers,
      {
        invite,
        email,
        browserKey,
        meta: { ip: ipOf(req), userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) },
      },
    );
    res.json(afterSubmit(req, r, result, answers));
  } catch (error: any) {
    console.error('[publicForms] POST:', error?.message);
    res.status(/archivo/i.test(error?.message) ? 422 : 500).json({
      error: /archivo/i.test(error?.message)
        ? error.message
        : 'No se pudo enviar. Inténtalo de nuevo.',
    });
  }
});

router.put('/:tenantId/:slug/edit/:editToken', async (req: any, res) => {
  try {
    if (rateLimited(`put:${ipOf(req)}:${req.params.tenantId}:${req.params.slug}`, 20))
      return res
        .status(429)
        .json({ error: 'Demasiados cambios seguidos. Prueba en unos minutos.' });
    const r = await resolve(req, res);
    if (!r) return;
    const { form, def, settings, db } = r;
    if (!settings.allowEdit)
      return res.status(403).json({ error: 'Este formulario no permite cambiar las respuestas.' });
    if (!form.isActive || (settings.closesAt && new Date(settings.closesAt) <= new Date()))
      return res
        .status(409)
        .json({ error: settings.closedMessage || 'El formulario ya está cerrado.' });
    const response = await responseByEditToken(db, form.id, req.params.editToken);
    if (!response) return res.status(404).json({ error: 'No encontramos tu respuesta.' });
    const { answers, errors } = validateAnswers(def, req.body?.answers ?? {});
    if (Object.keys(errors).length)
      return res.status(422).json({ error: 'Revisa el formulario', errors });
    const { grade } = await updateResponse(
      { tenantId: String(req.params.tenantId), db },
      form,
      response,
      answers,
    );
    res.json(afterSubmit(req, r, { editToken: response.editToken, grade }, answers));
  } catch (error: any) {
    console.error('[publicForms] PUT:', error?.message);
    res.status(500).json({ error: 'No se pudo guardar. Inténtalo de nuevo.' });
  }
});

/** POST /upload — un archivo para una pregunta de tipo archivo; devuelve su token. */
router.post('/:tenantId/:slug/upload', upload.single('file'), async (req: any, res) => {
  try {
    if (rateLimited(`up:${ipOf(req)}:${req.params.tenantId}`, 30))
      return res
        .status(429)
        .json({ error: 'Demasiadas subidas seguidas. Prueba en unos minutos.' });
    const r = await resolve(req, res);
    if (!r) return;
    const { form, def, settings, db, tenantSchema } = r;
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
    const q = allQuestions(def).find((x) => x.id === req.body?.questionId && x.type === 'file');
    const fail = (msg: string) => {
      fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: msg });
    };
    if (!q) return fail('Pregunta no válida');
    if (closedReason(form, settings, await countResponses(db, form.id)))
      return fail('El formulario está cerrado');
    const maxMb = Math.min(q.file?.maxSizeMb ?? 10, 10);
    if (req.file.size > maxMb * 1024 * 1024) return fail(`El archivo supera ${maxMb} MB`);
    const accept = q.file?.accept ?? [];
    if (accept.length) {
      const ext = `.${String(req.file.originalname).split('.').pop()?.toLowerCase()}`;
      const ok = accept.some((a) =>
        a.endsWith('/*')
          ? req.file.mimetype.startsWith(a.slice(0, -1))
          : a.toLowerCase() === ext || a === req.file.mimetype,
      );
      if (!ok) return fail('Tipo de archivo no permitido');
    }
    const stored = await storeUpload(
      db,
      tenantSchema,
      req.file,
      'FormUploadPending',
      form.id,
      null,
    );
    res.json({
      token: createUploadToken(stored.id, form.id),
      fileName: stored.fileName,
      size: stored.size,
    });
  } catch (error: any) {
    console.error('[publicForms] upload:', error?.message);
    res.status(500).json({ error: 'No se pudo subir el archivo' });
  }
});

router.get('/:tenantId/:slug/assets/:id', async (req: any, res) => {
  try {
    const r = await resolve(req, res);
    if (!r) return;
    await streamFile(r.db, r.tenantSchema, res, req.params.id, 'FormAsset', r.form.id, 'inline');
  } catch (error: any) {
    console.error('[publicForms] asset:', error?.message);
    res.status(500).json({ error: 'No se pudo cargar la imagen' });
  }
});

export default router;
