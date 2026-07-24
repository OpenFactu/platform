/**
 * API admin del módulo Website (landing builder por tenant).
 *
 * Endpoints (montados tras tenantContextMiddleware):
 *   GET    /api/website/site                — site del tenant (creación lazy)
 *   PUT    /api/website/site                — nombre, slug, tema, SEO
 *   GET    /api/website/hosts               — hosts públicos (slug/subdominio/dominio)
 *   POST   /api/website/hosts               — añadir subdominio/dominio
 *   DELETE /api/website/hosts/:id
 *   GET    /api/website/pages               — páginas del site
 *   POST   /api/website/pages               — nueva página
 *   GET    /api/website/pages/:id
 *   PUT    /api/website/pages/:id           — guardar draft + metadatos
 *   DELETE /api/website/pages/:id           — (la home no se puede borrar)
 *   POST   /api/website/pages/:id/publish   — publicar una página
 *   POST   /api/website/publish             — publicar todas
 *   GET    /api/website/pages/:id/preview   — HTML del draft (mismo renderer)
 *   POST   /api/website/assets              — subir imagen/vídeo (multipart "file", campo opcional "folder")
 *   GET    /api/website/assets              — listar assets del site
 *   PUT    /api/website/assets/:id          — actualizar carpeta/etiquetas
 *   DELETE /api/website/assets/:id
 *   GET    /api/website/submissions         — mensajes del formulario público
 *   PUT    /api/website/submissions/:id/read
 *
 * El MVP asume UN site por tenant (el modelo soporta N). La reserva global de
 * slugs/hosts vive en public."WebsiteHost" (unique en value).
 */

import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import crypto from 'crypto';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { migrateDocument, walkBlocks } from '@openfactu/site-builder/schema';
import type { RenderContext } from '@openfactu/site-builder/render';
import { renderPageToHtml } from '@openfactu/site-builder/render';
import * as schema from '../db/schema';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { StorageResolver } from '../core/storage/StorageResolver';
import type { StorageProviderId } from '../core/storage/StorageAdapter';
import { getConfigSection } from '../core/config/systemConfigSection';
import { BRANDING_DEFAULTS } from '../core/config/appConfig';
import { assetPublicUrl, buildSiteTheme, invalidateSiteCache } from '../core/website/renderSite';
import { sanitizeHtml } from '../core/website/sanitizeHtml';

const upload = multer({
  dest: '/tmp/openfactu-website-assets/',
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB (vídeos; las imágenes suelen ser mucho menos)
});

const router = Router();

const SLUG_RE = /^[a-z0-9-]{3,40}$/;
const PATH_RE = /^\/[a-z0-9\-/]*$/;
const HOSTNAME_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const ASSET_ENTITY = 'WebsiteAsset';

function slugFromSchema(tenantSchema: string): string {
  const base = tenantSchema
    .replace(/^tenant_/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.length >= 3 ? base.slice(0, 40) : `web-${base}`.slice(0, 40);
}

/** Reserva `value` en public."WebsiteHost"; devuelve false si está cogido por otro site. */
async function reserveHost(
  kind: string,
  value: string,
  tenantId: string,
  siteId: string,
  verified: boolean,
): Promise<boolean> {
  const publicDb = ClientFactory.getClient('public');
  const [existing] = await publicDb
    .select()
    .from(schema.websiteHosts)
    .where(eq(schema.websiteHosts.value, value));
  if (existing) return existing.tenantId === tenantId && existing.siteId === siteId;
  await publicDb.insert(schema.websiteHosts).values({
    id: crypto.randomUUID(),
    kind,
    value,
    tenantId,
    siteId,
    verified,
  });
  return true;
}

/** Devuelve el site del tenant, creándolo (con su home) la primera vez. */
async function getOrCreateSite(req: any) {
  const db = req.tenantClient;
  const [existing] = await db.select().from(schema.websiteSites).limit(1);
  if (existing) return existing;

  const branding = await getConfigSection(db, 'branding', BRANDING_DEFAULTS);
  const siteId = crypto.randomUUID();
  let slug = slugFromSchema(req.tenantSchema || 'web');
  // Si el slug natural está cogido por otro tenant, probamos sufijos
  for (let i = 0; i < 5; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`.slice(0, 40);
    if (await reserveHost('slug', candidate, req.tenantId, siteId, true)) {
      slug = candidate;
      break;
    }
    if (i === 4) slug = `${slug}-${crypto.randomUUID().slice(0, 6)}`;
  }

  const [site] = await db
    .insert(schema.websiteSites)
    .values({ id: siteId, name: branding.appName || 'Mi web', slug })
    .returning();

  await db.insert(schema.websitePages).values({
    id: crypto.randomUUID(),
    siteId,
    path: '/',
    title: 'Inicio',
    isHome: true,
  });

  return site;
}

/**
 * Sanitiza el HTML libre de un documento al publicar: bloques richText y
 * html, incluidos los anidados dentro de columns (walkBlocks recorre todo el
 * árbol — sin esto, el HTML dentro de una columna sería un agujero XSS).
 */
function sanitizeDocument(doc: any) {
  const migrated = migrateDocument(doc);
  walkBlocks(migrated, (block) => {
    const props = block.props as any;
    if (block.type === 'richText' && typeof props.html === 'string') {
      props.html = sanitizeHtml(props.html);
    }
    if (block.type === 'html' && typeof props.code === 'string') {
      props.code = sanitizeHtml(props.code);
    }
  });
  return migrated;
}

async function publishPage(db: any, page: any): Promise<void> {
  const published = sanitizeDocument(page.blocksDraft);
  await db
    .update(schema.websitePages)
    .set({ blocksPublished: published, status: 'published', updatedAt: new Date() })
    .where(eq(schema.websitePages.id, page.id));
}

async function markSitePublished(db: any, siteId: string): Promise<void> {
  await db
    .update(schema.websiteSites)
    .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.websiteSites.id, siteId));
}

// ─── Site ────────────────────────────────────────────────────────────────

router.get('/site', async (req: any, res) => {
  try {
    const site = await getOrCreateSite(req);
    res.json(site);
  } catch (e: any) {
    console.error('[Website.site] error:', e?.stack || e);
    res.status(500).json({ error: e?.message || 'Error al obtener el site' });
  }
});

router.put('/site', async (req: any, res) => {
  try {
    const db = req.tenantClient;
    const site = await getOrCreateSite(req);
    const { name, slug, themeOverrides, customCss, seoTitle, seoDescription, ogImageUrl } =
      req.body ?? {};

    if (slug !== undefined && slug !== site.slug) {
      if (!SLUG_RE.test(slug)) {
        return res.status(400).json({ error: 'Slug inválido: usa a-z, 0-9 y guiones (3-40)' });
      }
      const ok = await reserveHost('slug', slug, req.tenantId, site.id, true);
      if (!ok) return res.status(409).json({ error: 'Ese slug ya está en uso' });
      // Liberar el slug anterior
      const publicDb = ClientFactory.getClient('public');
      await publicDb
        .delete(schema.websiteHosts)
        .where(
          and(
            eq(schema.websiteHosts.siteId, site.id),
            eq(schema.websiteHosts.kind, 'slug'),
            eq(schema.websiteHosts.value, site.slug),
          ),
        );
    }

    const [updated] = await db
      .update(schema.websiteSites)
      .set({
        name: name ?? site.name,
        slug: slug ?? site.slug,
        themeOverrides: themeOverrides !== undefined ? themeOverrides : site.themeOverrides,
        customCss:
          customCss !== undefined ? String(customCss).slice(0, 20000) || null : site.customCss,
        seoTitle: seoTitle !== undefined ? seoTitle : site.seoTitle,
        seoDescription: seoDescription !== undefined ? seoDescription : site.seoDescription,
        ogImageUrl: ogImageUrl !== undefined ? ogImageUrl : site.ogImageUrl,
        updatedAt: new Date(),
      })
      .where(eq(schema.websiteSites.id, site.id))
      .returning();

    invalidateSiteCache(req.tenantId, site.id);
    res.json(updated);
  } catch (e: any) {
    console.error('[Website.site.put] error:', e?.stack || e);
    res.status(500).json({ error: e?.message || 'Error al guardar el site' });
  }
});

// ─── Hosts (subdominio / dominio propio) ─────────────────────────────────

router.get('/hosts', async (req: any, res) => {
  try {
    const site = await getOrCreateSite(req);
    const publicDb = ClientFactory.getClient('public');
    const rows = await publicDb
      .select()
      .from(schema.websiteHosts)
      .where(eq(schema.websiteHosts.siteId, site.id))
      .orderBy(asc(schema.websiteHosts.createdAt));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al listar hosts' });
  }
});

router.post('/hosts', async (req: any, res) => {
  try {
    const site = await getOrCreateSite(req);
    const { kind, value } = req.body ?? {};
    if (kind !== 'subdomain' && kind !== 'domain') {
      return res.status(400).json({ error: "kind debe ser 'subdomain' o 'domain'" });
    }
    const hostname = String(value ?? '')
      .trim()
      .toLowerCase();
    if (!HOSTNAME_RE.test(hostname)) {
      return res.status(400).json({ error: 'Hostname inválido' });
    }
    // Los subdominios de la plataforma sirven directos; los dominios propios
    // quedan pendientes de verificación DNS (proceso de despliegue).
    const ok = await reserveHost(kind, hostname, req.tenantId, site.id, kind === 'subdomain');
    if (!ok) return res.status(409).json({ error: 'Ese host ya está en uso' });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al añadir host' });
  }
});

router.delete('/hosts/:id', async (req: any, res) => {
  try {
    const site = await getOrCreateSite(req);
    const publicDb = ClientFactory.getClient('public');
    const [row] = await publicDb
      .select()
      .from(schema.websiteHosts)
      .where(eq(schema.websiteHosts.id, req.params.id));
    if (!row || row.siteId !== site.id) return res.status(404).json({ error: 'No encontrado' });
    if (row.kind === 'slug') {
      return res.status(400).json({ error: 'El slug se cambia desde los ajustes del site' });
    }
    await publicDb.delete(schema.websiteHosts).where(eq(schema.websiteHosts.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al borrar host' });
  }
});

// ─── Páginas ─────────────────────────────────────────────────────────────

router.get('/pages', async (req: any, res) => {
  try {
    const site = await getOrCreateSite(req);
    const rows = await req.tenantClient
      .select()
      .from(schema.websitePages)
      .where(eq(schema.websitePages.siteId, site.id))
      .orderBy(desc(schema.websitePages.isHome), asc(schema.websitePages.path));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al listar páginas' });
  }
});

router.post('/pages', async (req: any, res) => {
  try {
    const site = await getOrCreateSite(req);
    const { title, path } = req.body ?? {};
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title es obligatorio' });
    }
    const normalized = String(path ?? '')
      .trim()
      .toLowerCase();
    if (!PATH_RE.test(normalized)) {
      return res.status(400).json({ error: "path inválido: '/mi-pagina' (a-z, 0-9, guiones)" });
    }
    const [existing] = await req.tenantClient
      .select({ id: schema.websitePages.id })
      .from(schema.websitePages)
      .where(
        and(eq(schema.websitePages.siteId, site.id), eq(schema.websitePages.path, normalized)),
      );
    if (existing) return res.status(409).json({ error: 'Ya existe una página con ese path' });

    const [row] = await req.tenantClient
      .insert(schema.websitePages)
      .values({
        id: crypto.randomUUID(),
        siteId: site.id,
        path: normalized,
        title,
        isHome: normalized === '/',
      })
      .returning();
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al crear página' });
  }
});

async function getPage(req: any) {
  const site = await getOrCreateSite(req);
  const [page] = await req.tenantClient
    .select()
    .from(schema.websitePages)
    .where(and(eq(schema.websitePages.id, req.params.id), eq(schema.websitePages.siteId, site.id)));
  return { site, page };
}

router.get('/pages/:id', async (req: any, res) => {
  try {
    const { page } = await getPage(req);
    if (!page) return res.status(404).json({ error: 'Página no encontrada' });
    res.json(page);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al obtener página' });
  }
});

router.put('/pages/:id', async (req: any, res) => {
  try {
    const { site, page } = await getPage(req);
    if (!page) return res.status(404).json({ error: 'Página no encontrada' });
    const { title, path, seoTitle, seoDescription, ogImageUrl, blocksDraft } = req.body ?? {};

    let normalizedPath = page.path;
    if (path !== undefined && path !== page.path) {
      if (page.isHome) return res.status(400).json({ error: 'La home siempre es /' });
      normalizedPath = String(path).trim().toLowerCase();
      if (!PATH_RE.test(normalizedPath)) return res.status(400).json({ error: 'path inválido' });
      const [dup] = await req.tenantClient
        .select({ id: schema.websitePages.id })
        .from(schema.websitePages)
        .where(
          and(
            eq(schema.websitePages.siteId, site.id),
            eq(schema.websitePages.path, normalizedPath),
          ),
        );
      if (dup) return res.status(409).json({ error: 'Ya existe una página con ese path' });
    }

    const [updated] = await req.tenantClient
      .update(schema.websitePages)
      .set({
        title: title ?? page.title,
        path: normalizedPath,
        seoTitle: seoTitle !== undefined ? seoTitle : page.seoTitle,
        seoDescription: seoDescription !== undefined ? seoDescription : page.seoDescription,
        ogImageUrl: ogImageUrl !== undefined ? ogImageUrl : page.ogImageUrl,
        // migrateDocument normaliza y descarta bloques corruptos
        blocksDraft: blocksDraft !== undefined ? migrateDocument(blocksDraft) : page.blocksDraft,
        updatedAt: new Date(),
      })
      .where(eq(schema.websitePages.id, page.id))
      .returning();
    res.json(updated);
  } catch (e: any) {
    console.error('[Website.pages.put] error:', e?.stack || e);
    res.status(500).json({ error: e?.message || 'Error al guardar página' });
  }
});

router.delete('/pages/:id', async (req: any, res) => {
  try {
    const { page } = await getPage(req);
    if (!page) return res.status(404).json({ error: 'Página no encontrada' });
    if (page.isHome)
      return res.status(400).json({ error: 'La página de inicio no se puede borrar' });
    await req.tenantClient.delete(schema.websitePages).where(eq(schema.websitePages.id, page.id));
    invalidateSiteCache(req.tenantId, page.siteId);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al borrar página' });
  }
});

// ─── Publicación ─────────────────────────────────────────────────────────

router.post('/pages/:id/publish', async (req: any, res) => {
  try {
    const { site, page } = await getPage(req);
    if (!page) return res.status(404).json({ error: 'Página no encontrada' });
    await publishPage(req.tenantClient, page);
    await markSitePublished(req.tenantClient, site.id);
    invalidateSiteCache(req.tenantId, site.id);
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[Website.publish] error:', e?.stack || e);
    res.status(500).json({ error: e?.message || 'Error al publicar' });
  }
});

router.post('/publish', async (req: any, res) => {
  try {
    const site = await getOrCreateSite(req);
    const pages = await req.tenantClient
      .select()
      .from(schema.websitePages)
      .where(eq(schema.websitePages.siteId, site.id));
    for (const page of pages) await publishPage(req.tenantClient, page);
    await markSitePublished(req.tenantClient, site.id);
    invalidateSiteCache(req.tenantId, site.id);
    res.json({ ok: true, pages: pages.length });
  } catch (e: any) {
    console.error('[Website.publishAll] error:', e?.stack || e);
    res.status(500).json({ error: e?.message || 'Error al publicar' });
  }
});

// ─── Preview del draft (autenticado, mismo renderer que el público) ──────

router.get('/pages/:id/preview', async (req: any, res) => {
  try {
    const { site, page } = await getPage(req);
    if (!page) return res.status(404).json({ error: 'Página no encontrada' });

    const allPages = await req.tenantClient
      .select({ path: schema.websitePages.path, title: schema.websitePages.title })
      .from(schema.websitePages)
      .where(eq(schema.websitePages.siteId, site.id));

    const branding = await getConfigSection(req.tenantClient, 'branding', BRANDING_DEFAULTS);
    const theme = buildSiteTheme(branding, site);
    const ctx: RenderContext = {
      basePath: `/site/${site.slug}`,
      contactEndpoint: `/site/${site.slug}/contact`,
      pages: allPages,
    };
    const html = renderPageToHtml(
      page.blocksDraft,
      theme,
      ctx,
      {
        title: page.seoTitle || `${page.title} — ${site.name}`,
        description: page.seoDescription || site.seoDescription || undefined,
        ogImageUrl: page.ogImageUrl || site.ogImageUrl || undefined,
      },
      site.customCss || undefined,
    );
    res.type('html').send(html);
  } catch (e: any) {
    console.error('[Website.preview] error:', e?.stack || e);
    res.status(500).json({ error: e?.message || 'Error al generar preview' });
  }
});

// ─── Assets (imágenes de la web) ─────────────────────────────────────────

router.post('/assets', upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'falta el archivo (campo "file")' });
    if (!/^(image|video)\//.test(req.file.mimetype)) {
      fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: 'Solo se admiten imágenes o vídeos' });
    }
    const site = await getOrCreateSite(req);
    const tenantSchema = req.tenantSchema;
    const adapter = await StorageResolver.forTenant(req.tenantClient, tenantSchema);
    const content = await fs.promises.readFile(req.file.path);
    const ref = await adapter.upload({
      tenantSchema,
      entityType: ASSET_ENTITY,
      entityId: site.id,
      fileName: req.file.originalname,
      mime: req.file.mimetype,
      content,
    });
    fs.promises.unlink(req.file.path).catch(() => {});

    const id = crypto.randomUUID();
    const folder =
      String(req.body?.folder ?? '')
        .trim()
        .slice(0, 80) || null;
    const [row] = await req.tenantClient
      .insert(schema.attachments)
      .values({
        id,
        entityType: ASSET_ENTITY,
        entityId: site.id,
        fileName: req.file.originalname,
        mime: req.file.mimetype,
        size: req.file.size,
        provider: adapter.id,
        externalId: ref.externalId,
        uploadedBy: req.user?.id ?? null,
        folder,
      })
      .returning();

    res.json({
      ...row,
      publicUrl: assetPublicUrl(`/site/${site.slug}/assets`, id, req.file.originalname),
    });
  } catch (e: any) {
    console.error('[Website.assets.upload] error:', e?.stack || e);
    if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
    res.status(500).json({ error: e?.message || 'Error al subir imagen' });
  }
});

router.get('/assets', async (req: any, res) => {
  try {
    const site = await getOrCreateSite(req);
    const rows = await req.tenantClient
      .select()
      .from(schema.attachments)
      .where(
        and(
          eq(schema.attachments.entityType, ASSET_ENTITY),
          eq(schema.attachments.entityId, site.id),
          isNull(schema.attachments.deletedAt),
        ),
      )
      .orderBy(desc(schema.attachments.uploadedAt));
    res.json(
      rows.map((r: any) => ({
        ...r,
        publicUrl: assetPublicUrl(`/site/${site.slug}/assets`, r.id, r.fileName),
      })),
    );
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al listar assets' });
  }
});

/**
 * PUT /api/website/assets/:id — actualiza carpeta y/o etiquetas de un asset
 * (organización de la biblioteca de medios; no toca el archivo en sí).
 */
router.put('/assets/:id', async (req: any, res) => {
  try {
    const site = await getOrCreateSite(req);
    const [row] = await req.tenantClient
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.id, req.params.id));
    if (!row || row.entityType !== ASSET_ENTITY || row.entityId !== site.id) {
      return res.status(404).json({ error: 'No encontrado' });
    }
    const { folder, tags } = req.body ?? {};
    const patch: Record<string, unknown> = {};
    if (folder !== undefined) {
      patch.folder =
        String(folder ?? '')
          .trim()
          .slice(0, 80) || null;
    }
    if (tags !== undefined) {
      const list = Array.isArray(tags) ? tags : [];
      patch.tags = list
        .map((t: unknown) =>
          String(t ?? '')
            .trim()
            .slice(0, 40),
        )
        .filter(Boolean)
        .slice(0, 20);
    }
    const [updated] = await req.tenantClient
      .update(schema.attachments)
      .set(patch)
      .where(eq(schema.attachments.id, req.params.id))
      .returning();
    res.json({
      ...updated,
      publicUrl: assetPublicUrl(`/site/${site.slug}/assets`, updated.id, updated.fileName),
    });
  } catch (e: any) {
    console.error('[Website.assets.updateMeta] error:', e?.stack || e);
    res.status(500).json({ error: e?.message || 'Error al actualizar el asset' });
  }
});

router.delete('/assets/:id', async (req: any, res) => {
  try {
    const site = await getOrCreateSite(req);
    const [row] = await req.tenantClient
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.id, req.params.id));
    if (!row || row.entityType !== ASSET_ENTITY || row.entityId !== site.id) {
      return res.status(404).json({ error: 'No encontrado' });
    }
    if (!row.deletedAt) {
      try {
        const adapter = await StorageResolver.forProvider(
          row.provider as StorageProviderId,
          req.tenantClient,
          req.tenantSchema,
        );
        await adapter.delete({ tenantSchema: req.tenantSchema, externalId: row.externalId });
      } catch (e: any) {
        console.warn(`[Website.assets.delete] adapter delete falló: ${e?.message}`);
      }
      await req.tenantClient
        .update(schema.attachments)
        .set({ deletedAt: new Date() })
        .where(eq(schema.attachments.id, req.params.id));
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al borrar asset' });
  }
});

// ─── Mensajes del formulario de contacto ─────────────────────────────────

router.get('/submissions', async (req: any, res) => {
  try {
    const site = await getOrCreateSite(req);
    const rows = await req.tenantClient
      .select()
      .from(schema.websiteFormSubmissions)
      .where(eq(schema.websiteFormSubmissions.siteId, site.id))
      .orderBy(desc(schema.websiteFormSubmissions.createdAt))
      .limit(200);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al listar mensajes' });
  }
});

router.put('/submissions/:id/read', async (req: any, res) => {
  try {
    await req.tenantClient
      .update(schema.websiteFormSubmissions)
      .set({ read: true })
      .where(eq(schema.websiteFormSubmissions.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al marcar leído' });
  }
});

export default router;
