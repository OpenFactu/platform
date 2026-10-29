/**
 * Formularios y encuestas del CRM, cara pública (sin sesión):
 *
 *   GET  /api/public/forms/:tenantId/:slug[?t=token]  → definición + marca de la empresa
 *   POST /api/public/forms/:tenantId/:slug             → { answers, t?, website }
 *
 * Solo responden si la empresa tiene el CRM y los formularios activos y el
 * formulario está activo. Mismo antispam que el formulario de la web: campo
 * trampa `website` y límite de envíos por IP.
 */
import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { getConfigSection } from '../core/config/systemConfigSection';
import { BRANDING_DEFAULTS, FLAGS_DEFAULTS } from '../core/config/appConfig';
import { submitForm, validateAnswers, type FormField } from '../core/crm/forms';

const router = Router();

const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 10;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_HITS) return true;
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000)
    for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  return false;
}

/** Empresa + formulario activos, o null (y la respuesta 404 ya enviada). */
async function resolve(req: any, res: any) {
  const notFound = () => {
    res.status(404).json({ error: 'Este formulario no existe o ya no está disponible.' });
    return null;
  };
  let db: any;
  try {
    db = await ClientFactory.getTenantClient(String(req.params.tenantId));
  } catch {
    return notFound();
  }
  const flags = await getConfigSection(db, 'flags', FLAGS_DEFAULTS);
  if (!flags.crmEnabled || !flags.crmFormsEnabled) return notFound();
  const [form] = await db
    .select()
    .from(schema.crmForms)
    .where(
      and(eq(schema.crmForms.slug, String(req.params.slug)), eq(schema.crmForms.isActive, true)),
    );
  if (!form) return notFound();

  let invite: any = null;
  const token = String(req.query.t ?? req.body?.t ?? '').trim();
  if (token) {
    [invite] = await db
      .select({
        invite: schema.crmFormInvites,
        contactName: schema.contacts.name,
      })
      .from(schema.crmFormInvites)
      .leftJoin(schema.contacts, eq(schema.crmFormInvites.contactId, schema.contacts.id))
      .where(
        and(eq(schema.crmFormInvites.token, token), eq(schema.crmFormInvites.formId, form.id)),
      );
  }
  return { db, form, invite: invite?.invite ?? null, inviteeName: invite?.contactName ?? null };
}

router.get('/:tenantId/:slug', async (req: any, res) => {
  try {
    const r = await resolve(req, res);
    if (!r) return;
    const branding = await getConfigSection(r.db, 'branding', BRANDING_DEFAULTS);
    res.json({
      form: {
        id: r.form.id,
        kind: r.form.kind,
        title: r.form.title || r.form.name,
        intro: r.form.intro,
        fields: r.form.fields,
        submitLabel: r.form.settings?.submitLabel ?? null,
        successMessage: r.form.settings?.successMessage ?? null,
      },
      invitee: r.invite ? { name: r.inviteeName, responded: !!r.invite.respondedAt } : null,
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
    res.status(500).json({ error: 'No se pudo cargar el formulario' });
    console.error('[publicForms] GET:', error?.message);
  }
});

router.post('/:tenantId/:slug', async (req: any, res) => {
  try {
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? '').split(
      ',',
    )[0];
    // Campo trampa relleno → bot: se responde como si nada.
    if (req.body?.website) return res.json({ ok: true });
    if (rateLimited(`${ip}:${req.params.tenantId}:${req.params.slug}`))
      return res.status(429).json({ error: 'Demasiados envíos seguidos. Prueba en unos minutos.' });

    const r = await resolve(req, res);
    if (!r) return;
    if (r.invite?.respondedAt)
      return res.status(409).json({ error: 'Ya respondiste a esta encuesta. ¡Gracias!' });

    const { answers, errors } = validateAnswers(
      r.form.fields as FormField[],
      req.body?.answers ?? {},
    );
    if (Object.keys(errors).length)
      return res.status(422).json({ error: 'Revisa el formulario', errors });

    await submitForm({ tenantId: String(req.params.tenantId), db: r.db }, r.form, answers, {
      invite: r.invite,
      meta: {
        ip,
        userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
        referer: String(req.headers.referer ?? '').slice(0, 300),
      },
    });
    res.json({ ok: true, message: r.form.settings?.successMessage ?? null });
  } catch (error: any) {
    console.error('[publicForms] POST:', error?.message);
    res.status(500).json({ error: 'No se pudo enviar. Inténtalo de nuevo.' });
  }
});

export default router;
