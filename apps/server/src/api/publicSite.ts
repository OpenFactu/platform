import crypto from 'crypto';
import express, { Router } from 'express';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '../db/schema';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { StorageResolver } from '../core/storage/StorageResolver';
import type { StorageProviderId } from '../core/storage/StorageAdapter';
import { notifyTenant } from '../core/realtime/notifyTenant';
import {
  listPublishedPaths,
  rawAssetId,
  renderSitePage,
  resolveHostValue,
  type ResolvedHost,
} from '../core/website/renderSite';
import { handleShopCheckout } from '../core/website/shop';

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

// ─── Formulario de contacto público ──────────────────────────────────────

// Rate limit simple en memoria: máx 5 envíos/minuto por IP+site.
const contactHits = new Map<string, number[]>();
const CONTACT_WINDOW_MS = 60_000;
const CONTACT_MAX = 5;

function contactRateLimited(ip: string, siteId: string): boolean {
  const key = `${ip}:${siteId}`;
  const now = Date.now();
  const hits = (contactHits.get(key) ?? []).filter((t) => now - t < CONTACT_WINDOW_MS);
  if (hits.length >= CONTACT_MAX) return true;
  hits.push(now);
  contactHits.set(key, hits);
  // Limpieza oportunista para que el Map no crezca sin límite
  if (contactHits.size > 5000) {
    for (const [k, v] of contactHits) {
      if (v.every((t) => now - t >= CONTACT_WINDOW_MS)) contactHits.delete(k);
    }
  }
  return false;
}

/**
 * Procesa un envío del formulario (POST nativo sin JS): honeypot + rate
 * limit + insert + notificación a los miembros, y redirige de vuelta a la
 * página con ?sent=1 para que el renderer pinte el banner de éxito.
 */
async function handleContactSubmission(
  resolved: ResolvedHost,
  req: any,
  res: any,
  basePath: string,
) {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const { name, email, message, website } = body as Record<string, string>;

  // Campos extra de formularios personalizados (bloque `form`): todo lo que
  // no sea un campo estándar se guarda en meta.fields, con límites defensivos.
  const extraFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (['name', 'email', 'message', 'website'].includes(key)) continue;
    if (Object.keys(extraFields).length >= 30) break;
    const k = String(key).slice(0, 60);
    extraFields[k] = (Array.isArray(value) ? value.join(', ') : String(value ?? '')).slice(0, 2000);
  }

  // Volver a la página de origen (mismo path), o a la home del site
  const referer = String(req.headers.referer ?? '');
  let backPath = basePath || '/';
  try {
    const refPath = new URL(referer).pathname;
    if (refPath.startsWith(basePath)) backPath = refPath;
  } catch {
    /* referer ausente o inválido */
  }
  // #contacto lleva el navegador directo a la sección del formulario tras la
  // recarga — sin esto el usuario aterriza arriba del todo y no ve el banner
  // de éxito sin bajar manualmente.
  const redirectTo = `${backPath}?sent=1#contacto`;

  // Honeypot relleno → bot: respondemos éxito sin guardar nada
  if (website) return res.redirect(303, redirectTo);

  const ip = String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? '').split(
    ',',
  )[0];
  if (contactRateLimited(ip, resolved.siteId)) return res.redirect(303, redirectTo);

  if (!message && !email && !name && Object.keys(extraFields).length === 0) {
    return res.redirect(303, redirectTo);
  }

  const db = await ClientFactory.getTenantClient(resolved.tenantId);
  await db.insert(schema.websiteFormSubmissions).values({
    id: crypto.randomUUID(),
    siteId: resolved.siteId,
    name: String(name ?? '').slice(0, 120) || null,
    email: String(email ?? '').slice(0, 200) || null,
    message: String(message ?? '').slice(0, 4000) || null,
    meta: {
      ip,
      userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
      referer: referer.slice(0, 300),
      ...(Object.keys(extraFields).length > 0 ? { fields: extraFields } : {}),
    },
  });

  notifyTenant({
    tenantId: resolved.tenantId,
    tenantClient: db,
    title: 'Nuevo mensaje desde tu web',
    body: `${name || 'Alguien'} ha enviado el formulario de contacto.`,
    level: 'info',
    link: '/website/messages',
  }).catch(() => {});

  res.redirect(303, redirectTo);
}

function sitemapXml(
  origin: string,
  basePath: string,
  paths: { path: string; updatedAt: Date | null }[],
): string {
  const urls = paths
    .map((p) => {
      const loc = `${origin}${basePath}${p.path === '/' ? '' : p.path}`;
      const lastmod = p.updatedAt
        ? `<lastmod>${p.updatedAt.toISOString().slice(0, 10)}</lastmod>`
        : '';
      return `<url><loc>${loc}</loc>${lastmod}</url>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
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
          eq(schema.attachments.id, rawAssetId(req.params.id)),
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

publicSiteRouter.post(
  '/:slug/contact',
  express.urlencoded({ extended: false, limit: '32kb' }),
  async (req, res) => {
    try {
      const resolved = await resolveHostValue(req.params.slug);
      if (!resolved || resolved.kind !== 'slug') return res.status(404).end();
      await handleContactSubmission(resolved, req, res, `/site/${req.params.slug}`);
    } catch (err: any) {
      console.error('[Website] Error en contacto:', err.message);
      res.status(500).type('html').send(notFoundHtml());
    }
  },
);

/**
 * POST /site/:slug/checkout — pedido de la tienda (bloque shop). Crea un
 * Pedido de venta 'O' vía FactuApi; sin pago online.
 */
publicSiteRouter.post('/:slug/checkout', express.json({ limit: '64kb' }), async (req, res) => {
  try {
    const resolved = await resolveHostValue(req.params.slug);
    if (!resolved || resolved.kind !== 'slug') return res.status(404).json({ ok: false });
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? '').split(
      ',',
    )[0];
    const { status, body } = await handleShopCheckout(resolved, req.body, ip);
    res.status(status).json(body);
  } catch (err: any) {
    console.error('[Website] Error en checkout:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo registrar el pedido.' });
  }
});

publicSiteRouter.get('/:slug/sitemap.xml', async (req, res) => {
  try {
    const resolved = await resolveHostValue(req.params.slug);
    if (!resolved || resolved.kind !== 'slug') return res.status(404).end();
    const paths = await listPublishedPaths(resolved.tenantId, resolved.siteId);
    const origin = `${req.protocol}://${req.get('host')}`;
    res.type('application/xml').send(sitemapXml(origin, `/site/${req.params.slug}`, paths));
  } catch (err: any) {
    res.status(500).end();
  }
});

publicSiteRouter.get('/:slug/robots.txt', async (req, res) => {
  res
    .type('text/plain')
    .send(
      `User-agent: *\nAllow: /\nSitemap: ${req.protocol}://${req.get('host')}/site/${req.params.slug}/sitemap.xml\n`,
    );
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

// ─── Resolución por Host (subdominio / dominio propio) ───────────────────

// Cache hostname → resolución (incluye negativos como null) con TTL corto:
// este middleware corre en TODAS las requests del server y no puede costar
// una query por petición.
const hostCache = new Map<string, { resolved: ResolvedHost | null; at: number }>();
const HOST_CACHE_TTL_MS = 60_000;

async function resolveHostCached(hostname: string): Promise<ResolvedHost | null> {
  const cached = hostCache.get(hostname);
  if (cached && Date.now() - cached.at < HOST_CACHE_TTL_MS) return cached.resolved;
  let resolved: ResolvedHost | null = null;
  try {
    resolved = await resolveHostValue(hostname);
    if (resolved && resolved.kind === 'slug') resolved = null; // los slugs solo van por /site/
  } catch {
    resolved = null;
  }
  hostCache.set(hostname, { resolved, at: Date.now() });
  if (hostCache.size > 2000) {
    for (const [k, v] of hostCache) {
      if (Date.now() - v.at >= HOST_CACHE_TTL_MS) hostCache.delete(k);
    }
  }
  return resolved;
}

const contactBodyParser = express.urlencoded({ extended: false, limit: '32kb' });
const checkoutBodyParser = express.json({ limit: '64kb' });

/**
 * Middleware global (montado en server.ts ANTES de /api): si el Host de la
 * petición es un subdominio o dominio propio registrado en WebsiteHost, sirve
 * la web de ese site en la raíz del dominio y corta; si no, next(). El host
 * del ERP nunca está en la tabla, así que el ERP no se ve afectado.
 * La infra DNS/TLS (wildcard, Caddy) es cosa del despliegue — ver docs.
 */
export async function publicSiteHostMiddleware(req: any, res: any, next: any) {
  try {
    const hostname = String(req.hostname ?? '').toLowerCase();
    if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') return next();
    const resolved = await resolveHostCached(hostname);
    if (!resolved) return next();

    // Assets: /__assets/:id
    if (req.method === 'GET' && req.path.startsWith('/__assets/')) {
      const assetId = rawAssetId(req.path.slice('/__assets/'.length));
      const db = ClientFactory.getClient(resolved.schemaName);
      const [row] = await db
        .select()
        .from(schema.attachments)
        .where(
          and(
            eq(schema.attachments.id, assetId),
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
      dl.stream.pipe(res);
      return;
    }

    // Checkout de la tienda: POST /__checkout
    if (req.method === 'POST' && req.path === '/__checkout') {
      return checkoutBodyParser(req, res, async () => {
        try {
          const ip = String(
            req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? '',
          ).split(',')[0];
          const { status, body } = await handleShopCheckout(resolved, req.body, ip);
          res.status(status).json(body);
        } catch (err: any) {
          console.error('[Website] Error en checkout (host):', err.message);
          res.status(500).json({ ok: false, error: 'No se pudo registrar el pedido.' });
        }
      });
    }

    // Formulario de contacto: POST /__contact
    if (req.method === 'POST' && req.path === '/__contact') {
      return contactBodyParser(req, res, async () => {
        try {
          await handleContactSubmission(resolved, req, res, '');
        } catch (err: any) {
          console.error('[Website] Error en contacto (host):', err.message);
          res.status(500).end();
        }
      });
    }

    if (req.method !== 'GET') return next();

    if (req.path === '/sitemap.xml') {
      const paths = await listPublishedPaths(resolved.tenantId, resolved.siteId);
      const origin = `${req.protocol}://${req.get('host')}`;
      return res.type('application/xml').send(sitemapXml(origin, '', paths));
    }
    if (req.path === '/robots.txt') {
      return res
        .type('text/plain')
        .send(
          `User-agent: *\nAllow: /\nSitemap: ${req.protocol}://${req.get('host')}/sitemap.xml\n`,
        );
    }

    const pagePath = req.path.replace(/\/+$/, '') || '/';
    const html = await renderSitePage(resolved.tenantId, resolved.siteId, pagePath, {
      basePath: '',
      sent: req.query?.sent === '1',
    });
    if (!html) return res.status(404).type('html').send(notFoundHtml());
    res.type('html').send(html);
  } catch (err: any) {
    console.error('[Website] Error en host middleware:', err.message);
    next();
  }
}
