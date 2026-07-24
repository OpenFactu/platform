import { and, eq } from 'drizzle-orm';
import type { RenderContext, SiteTheme } from '@openfactu/site-builder/render';
import { renderPageToHtml } from '@openfactu/site-builder/render';
import { ClientFactory } from '../tenant/ClientFactory';
import * as schema from '../../db/schema';
import { getConfigSection } from '../config/systemConfigSection';
import { BRANDING_DEFAULTS } from '../config/appConfig';

/**
 * Serving de sitios web públicos (módulo Website). Resuelve slug/host →
 * tenant con una sola query a public."WebsiteHost", renderiza la página
 * publicada con el renderer de @openfactu/site-builder y cachea el HTML en
 * memoria. La caché se invalida al publicar o cambiar ajustes del site.
 * NOTA: caché en memoria de proceso único; si algún día hay multi-instancia,
 * añadir TTL corto o invalidación compartida.
 */

/**
 * Espejo mínimo del catálogo FONT_OPTIONS de la web (ThemeContext.tsx): el
 * branding guarda solo el id; aquí se resuelve a stack CSS + Google Fonts.
 */
const WEBSITE_FONTS: Record<string, { stack: string; google?: string }> = {
  sans: {
    stack: "'DM Sans', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
    google: 'DM+Sans:opsz,wght@9..40,300..800',
  },
  roboto: {
    stack: "'Roboto', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
    google: 'Roboto:wght@300;400;500;700',
  },
  'roboto-flex': {
    stack: "'Roboto Flex', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
    google: 'Roboto+Flex:opsz,wght@8..144,300..800',
  },
  geist: {
    stack: "'Geist', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
    google: 'Geist:wght@300..800',
  },
  serif: { stack: "Georgia, 'Times New Roman', Times, serif" },
  mono: { stack: "'SFMono-Regular', Menlo, Monaco, 'Courier New', monospace" },
};

export interface ResolvedHost {
  tenantId: string;
  siteId: string;
  kind: string;
}

/** Resuelve un slug o hostname (lowercase) contra public."WebsiteHost". */
export async function resolveHostValue(value: string): Promise<ResolvedHost | null> {
  const publicDb = ClientFactory.getClient('public');
  const [row] = await publicDb
    .select()
    .from(schema.websiteHosts)
    .where(eq(schema.websiteHosts.value, value.toLowerCase()));
  if (!row) return null;
  // Los dominios propios solo sirven una vez verificados
  if (row.kind === 'domain' && !row.verified) return null;
  return { tenantId: row.tenantId, siteId: row.siteId, kind: row.kind };
}

/** Compone el tema del site: branding del tenant + overrides guardados. */
export function buildSiteTheme(
  branding: typeof BRANDING_DEFAULTS,
  site: { name: string; themeOverrides?: unknown },
): SiteTheme {
  const overrides = (site.themeOverrides ?? {}) as Partial<SiteTheme> & { fontId?: string };
  const fontId = overrides.fontId ?? branding.fontFamily;
  const font = WEBSITE_FONTS[fontId] ?? WEBSITE_FONTS.sans;
  return {
    colorPrimary: overrides.colorPrimary ?? branding.colorPrimary,
    colorAccent: overrides.colorAccent ?? branding.colorAccent,
    fontFamily: font.stack,
    fontImportUrl: font.google
      ? `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`
      : undefined,
    logoUrl: overrides.logoUrl ?? branding.logoUrl ?? undefined,
    siteName: site.name,
  };
}

// cacheKey = `${tenantId}:${siteId}:${basePath}:${path}` → HTML renderizado
const htmlCache = new Map<string, string>();

export function invalidateSiteCache(tenantId: string, siteId?: string) {
  const prefix = siteId ? `${tenantId}:${siteId}:` : `${tenantId}:`;
  for (const key of htmlCache.keys()) {
    if (key.startsWith(prefix)) htmlCache.delete(key);
  }
}

export interface RenderOptions {
  /** Prefijo de URLs internas: '/site/acme' en modo slug, '' bajo dominio propio. */
  basePath: string;
  /** true cuando se vuelve del envío del formulario de contacto (?sent=1). */
  sent?: boolean;
}

/**
 * Renderiza (con caché) la página publicada de un site en `path` ('/'...).
 * Devuelve null si el site o la página no existen o no están publicados.
 */
export async function renderSitePage(
  tenantId: string,
  siteId: string,
  path: string,
  opts: RenderOptions,
): Promise<string | null> {
  const normalizedPath = path === '' ? '/' : path;
  const cacheKey = `${tenantId}:${siteId}:${opts.basePath}:${normalizedPath}`;
  // Las vistas con banner de éxito no se cachean (variante puntual)
  if (!opts.sent && htmlCache.has(cacheKey)) return htmlCache.get(cacheKey)!;

  const db = await ClientFactory.getTenantClient(tenantId);

  const [site] = await db
    .select()
    .from(schema.websiteSites)
    .where(eq(schema.websiteSites.id, siteId));
  if (!site || site.status !== 'published') return null;

  const [page] = await db
    .select()
    .from(schema.websitePages)
    .where(and(eq(schema.websitePages.siteId, siteId), eq(schema.websitePages.path, normalizedPath)));
  if (!page || page.status !== 'published' || !page.blocksPublished) return null;

  const publishedPages = await db
    .select({ path: schema.websitePages.path, title: schema.websitePages.title })
    .from(schema.websitePages)
    .where(and(eq(schema.websitePages.siteId, siteId), eq(schema.websitePages.status, 'published')));

  const branding = await getConfigSection(db, 'branding', BRANDING_DEFAULTS);
  const theme = buildSiteTheme(branding, site);

  const ctx: RenderContext = {
    basePath: opts.basePath,
    contactEndpoint: `${opts.basePath}/contact`,
    pages: publishedPages,
    sent: opts.sent,
  };

  const html = renderPageToHtml(page.blocksPublished, theme, ctx, {
    title: page.seoTitle || `${page.title} — ${site.name}`,
    description: page.seoDescription || site.seoDescription || undefined,
    ogImageUrl: page.ogImageUrl || site.ogImageUrl || undefined,
  });

  if (!opts.sent) htmlCache.set(cacheKey, html);
  return html;
}
