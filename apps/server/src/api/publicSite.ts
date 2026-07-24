import { Router } from 'express';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '../db/schema';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { StorageResolver } from '../core/storage/StorageResolver';
import type { StorageProviderId } from '../core/storage/StorageAdapter';
import { renderSitePage, resolveHostValue } from '../core/website/renderSite';

/**
 * Serving público de sitios web (módulo Website) — SIN autenticación.
 * Se monta en server.ts ANTES de apiTokenMiddleware/tenantContextMiddleware,
 * igual que publicTrackRouter. Resuelve el tenant por slug con una única
 * query indexada a public."WebsiteHost" (nunca iterando tenants).
 */
export const publicSiteRouter = Router();

const SLUG_RE = /^[a-z0-9-]{3,40}$/;

function notFoundHtml(): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Página no encontrada</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f8fafc;color:#0f172a}
main{text-align:center;padding:24px}h1{font-size:3rem;margin:0}p{color:#64748b}</style></head>
<body><main><h1>404</h1><p>Esta página no existe o ya no está publicada.</p></main></body></html>`;
}

async function serveBySlug(slug: string, path: string, sent: boolean, res: any) {
  if (!SLUG_RE.test(slug)) {
    res.status(404).type('html').send(notFoundHtml());
    return;
  }
  const resolved = await resolveHostValue(slug);
  if (!resolved || resolved.kind !== 'slug') {
    res.status(404).type('html').send(notFoundHtml());
    return;
  }
  const html = await renderSitePage(resolved.tenantId, resolved.siteId, path, {
    basePath: `/site/${slug}`,
    sent,
  });
  if (!html) {
    res.status(404).type('html').send(notFoundHtml());
    return;
  }
  res.type('html').send(html);
}

/**
 * GET /site/:slug/assets/:id — sirve una imagen del site. Solo attachments
 * con entityType='WebsiteAsset' y entityId = site resuelto: los adjuntos
 * normales del ERP siguen siendo privados.
 */
publicSiteRouter.get('/:slug/assets/:id', async (req, res) => {
  try {
    const resolved = await resolveHostValue(req.params.slug);
    if (!resolved || resolved.kind !== 'slug') return res.status(404).end();

    const db = ClientFactory.getClient(resolved.schemaName);
    const [row] = await db
      .select()
      .from(schema.attachments)
      .where(
        and(
          eq(schema.attachments.id, req.params.id),
          eq(schema.attachments.entityType, 'WebsiteAsset'),
          eq(schema.attachments.entityId, resolved.siteId),
          isNull(schema.attachments.deletedAt),
        ),
      );
    if (!row) return res.status(404).end();

    const adapter = await StorageResolver.forProvider(
      row.provider as StorageProviderId,
      db,
      resolved.schemaName,
    );
    const dl = await adapter.download({
      tenantSchema: resolved.schemaName,
      externalId: row.externalId,
    });
    res.setHeader('Content-Type', row.mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (row.size) res.setHeader('Content-Length', String(row.size));
    dl.stream.pipe(res);
  } catch (err: any) {
    console.error('[Website] Error sirviendo asset:', err.message);
    res.status(500).end();
  }
});

publicSiteRouter.get('/:slug', async (req, res) => {
  try {
    await serveBySlug(req.params.slug, '/', req.query.sent === '1', res);
  } catch (err: any) {
    console.error('[Website] Error sirviendo site:', err.message);
    res.status(500).type('html').send(notFoundHtml());
  }
});

publicSiteRouter.get('/:slug/*', async (req, res) => {
  try {
    const subPath = `/${(req.params as any)[0] ?? ''}`.replace(/\/+$/, '') || '/';
    await serveBySlug(req.params.slug, subPath, req.query.sent === '1', res);
  } catch (err: any) {
    console.error('[Website] Error sirviendo site:', err.message);
    res.status(500).type('html').send(notFoundHtml());
  }
});
