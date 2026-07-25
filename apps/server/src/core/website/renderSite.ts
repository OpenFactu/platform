import path from 'path';
import { and, eq } from 'drizzle-orm';
import type { RenderContext, SiteTheme } from '@openfactu/site-builder/render';
import { renderPageToHtml } from '@openfactu/site-builder/render';
import { migrateDocument, walkBlocks } from '@openfactu/site-builder/schema';
import { loadShopData } from './shop';
import { ClientFactory } from '../tenant/ClientFactory';
import * as schema from '../../db/schema';
import { getConfigSection } from '../config/systemConfigSection';
import { BRANDING_DEFAULTS } from '../config/appConfig';

/**
 * URL pública de un asset con la extensión real del archivo (p.ej.
 * `/site/acme/assets/<uuid>.mp4`). El id de BD nunca lleva puntos, así que
 * `rawAssetId` puede recuperarlo aunque el navegador o un consumidor
 * (carrusel, galería) añadan la extensión — es lo que permite que un simple
 * `<img>` vs `<video>` se decida por extensión sin tener que guardar el tipo
 * de medio en cada bloque que referencia una imagen/vídeo.
 */
export function assetPublicUrl(basePath: string, id: string, fileName: string): string {
  const ext = path.extname(fileName || '').toLowerCase();
  return `${basePath}/${id}${ext}`;
}

/** Recupera el id de BD (UUID, sin puntos) de un segmento de ruta que puede traer extensión. */
export function rawAssetId(param: string): string {
  return param.split('.')[0];
}

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

/**
 * Ruta reservada de la plantilla de producto: si el site tiene una página
 * publicada en este path, sus bloques se usan para renderizar TODAS las
 * fichas /p/:itemId (el producto se inyecta en ctx.shop.product). No aparece
 * en el menú automático ni en el sitemap.
 */
export const PRODUCT_TEMPLATE_PATH = '/plantilla-producto';

export interface ResolvedHost {
  tenantId: string;
  siteId: string;
  kind: string;
  /** Schema físico del tenant — lo necesita StorageResolver para los assets. */
  schemaName: string;
}

/** Resuelve un slug o hostname (lowercase) contra public."WebsiteHost". */
export async function resolveHostValue(value: string): Promise<ResolvedHost | null> {
  const publicDb = ClientFactory.getClient('public');
  const [row] = await publicDb
    .select({
      kind: schema.websiteHosts.kind,
      tenantId: schema.websiteHosts.tenantId,
      siteId: schema.websiteHosts.siteId,
      verified: schema.websiteHosts.verified,
      schemaName: schema.tenants.schemaName,
    })
    .from(schema.websiteHosts)
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.websiteHosts.tenantId))
    .where(eq(schema.websiteHosts.value, value.toLowerCase()));
  if (!row) return null;
  // Los dominios propios solo sirven una vez verificados
  if (row.kind === 'domain' && !row.verified) return null;
  return {
    tenantId: row.tenantId,
    siteId: row.siteId,
    kind: row.kind,
    schemaName: row.schemaName,
  };
}

/** Niveles de redondez de esquinas que ofrece el editor, en px. */
const RADIUS_PRESETS: Record<string, number> = { none: 0, sm: 6, md: 12, lg: 20 };
const DEFAULT_RADIUS = 'md';

/** Compone el tema del site: branding del tenant + overrides guardados. */
export function buildSiteTheme(
  branding: typeof BRANDING_DEFAULTS,
  site: { name: string; themeOverrides?: unknown },
): SiteTheme {
  const overrides = (site.themeOverrides ?? {}) as Partial<SiteTheme> & {
    fontId?: string;
    radius?: string;
  };
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
    radiusPx: RADIUS_PRESETS[overrides.radius ?? DEFAULT_RADIUS] ?? RADIUS_PRESETS[DEFAULT_RADIUS],
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

/** Paths publicados de un site (sitemap.xml y validación del contacto). */
export async function listPublishedPaths(
  tenantId: string,
  siteId: string,
): Promise<{ path: string; updatedAt: Date | null }[]> {
  const db = await ClientFactory.getTenantClient(tenantId);
  const rows = await db
    .select({ path: schema.websitePages.path, updatedAt: schema.websitePages.updatedAt })
    .from(schema.websitePages)
    .where(
      and(eq(schema.websitePages.siteId, siteId), eq(schema.websitePages.status, 'published')),
    );
  // La plantilla de producto no es una página navegable
  return rows.filter((r: any) => r.path !== PRODUCT_TEMPLATE_PATH);
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
    .where(
      and(eq(schema.websitePages.siteId, siteId), eq(schema.websitePages.path, normalizedPath)),
    );
  if (!page || page.status !== 'published' || !page.blocksPublished) return null;

  const publishedPages = (
    await db
      .select({ path: schema.websitePages.path, title: schema.websitePages.title })
      .from(schema.websitePages)
      .where(
        and(eq(schema.websitePages.siteId, siteId), eq(schema.websitePages.status, 'published')),
      )
  ).filter((p: any) => p.path !== PRODUCT_TEMPLATE_PATH);

  const branding = await getConfigSection(db, 'branding', BRANDING_DEFAULTS);
  const theme = buildSiteTheme(branding, site);

  // La tienda solo consulta el catálogo si la página realmente lleva un
  // bloque shop — el resto de páginas no pagan la query de artículos.
  const doc = migrateDocument(page.blocksPublished);
  let hasShop = false;
  walkBlocks(doc, (b) => {
    if (b.type === 'shop') hasShop = true;
  });
  const shop = hasShop
    ? await loadShopData(
        db,
        opts.basePath ? `${opts.basePath}/checkout` : '/__checkout',
        site.priceListId,
      )
    : undefined;

  const ctx: RenderContext = {
    basePath: opts.basePath,
    // En modo slug el form postea a /site/<slug>/contact; bajo dominio propio a /__contact
    contactEndpoint: opts.basePath ? `${opts.basePath}/contact` : '/__contact',
    pages: publishedPages,
    sent: opts.sent,
    shop,
  };

  let html = renderPageToHtml(
    doc,
    theme,
    ctx,
    {
      title: page.seoTitle || `${page.title} — ${site.name}`,
      description: page.seoDescription || site.seoDescription || undefined,
      ogImageUrl: page.ogImageUrl || site.ogImageUrl || undefined,
    },
    site.customCss || undefined,
  );

  // En modo slug (mismo origen que el ERP) inyectamos un botón flotante de
  // edición que SOLO se pinta si el navegador tiene sesión del ERP (token en
  // localStorage) — los visitantes normales no ven nada. Bajo dominio propio
  // no aplica (otro origen, el localStorage del ERP no existe allí).
  if (opts.basePath) {
    html = html.replace('</body>', `${editButtonSnippet(page.id)}</body>`);
  }

  if (!opts.sent) htmlCache.set(cacheKey, html);
  return html;
}

/**
 * Ficha pública de un producto (`/p/:itemId`): página sintética
 * [navbar, productDetail] renderizada con el mismo tema/CSS del site y la
 * misma caché que las páginas normales (la invalidación al tocar artículos en
 * items.ts la cubre). Devuelve null si el site no está publicado o el
 * artículo no es webVisible.
 */
export async function renderProductPage(
  tenantId: string,
  siteId: string,
  itemId: string,
  opts: RenderOptions,
): Promise<string | null> {
  const path = `/p/${itemId}`;
  const cacheKey = `${tenantId}:${siteId}:${opts.basePath}:${path}`;
  if (htmlCache.has(cacheKey)) return htmlCache.get(cacheKey)!;

  const db = await ClientFactory.getTenantClient(tenantId);
  const [site] = await db
    .select()
    .from(schema.websiteSites)
    .where(eq(schema.websiteSites.id, siteId));
  if (!site || site.status !== 'published') return null;

  const shop = await loadShopData(
    db,
    opts.basePath ? `${opts.basePath}/checkout` : '/__checkout',
    site.priceListId,
  );
  const product = shop.products.find((p) => p.id === itemId);
  if (!product) return null;

  const publishedPages = (
    await db
      .select({ path: schema.websitePages.path, title: schema.websitePages.title })
      .from(schema.websitePages)
      .where(
        and(eq(schema.websitePages.siteId, siteId), eq(schema.websitePages.status, 'published')),
      )
  ).filter((p: any) => p.path !== PRODUCT_TEMPLATE_PATH);

  const branding = await getConfigSection(db, 'branding', BRANDING_DEFAULTS);
  const theme = buildSiteTheme(branding, site);

  const ctx: RenderContext = {
    basePath: opts.basePath,
    contactEndpoint: opts.basePath ? `${opts.basePath}/contact` : '/__contact',
    pages: publishedPages,
    shop: { ...shop, product },
  };

  // Plantilla editable: si el site tiene publicada la página reservada
  // /plantilla-producto, sus bloques mandan; si no, diseño automático.
  const [template] = await db
    .select()
    .from(schema.websitePages)
    .where(
      and(
        eq(schema.websitePages.siteId, siteId),
        eq(schema.websitePages.path, PRODUCT_TEMPLATE_PATH),
      ),
    );

  const doc =
    template?.status === 'published' && template.blocksPublished
      ? template.blocksPublished
      : {
          version: 1,
          blocks: [
            {
              id: 'nav',
              type: 'navbar',
              props: {
                showLogo: true,
                sticky: true,
                variant: 'classic',
                side: 'left',
                links: [],
                autoPageLinks: true,
              },
            },
            { id: 'product', type: 'productDetail', props: {} },
          ],
        };

  const html = renderPageToHtml(
    doc,
    theme,
    ctx,
    {
      title: `${product.name} — ${site.name}`,
      description: product.description || undefined,
      ogImageUrl: product.images[0] || undefined,
    },
    site.customCss || undefined,
  );

  htmlCache.set(cacheKey, html);
  return html;
}

function editButtonSnippet(pageId: string): string {
  return (
    '<script>(function(){try{' +
    "if(!localStorage.getItem('openfactu_token'))return;" +
    "var a=document.createElement('a');" +
    `a.href='/website/editor/${pageId}';` +
    "a.textContent='\\u270F\\uFE0F Editar esta p\\u00E1gina';" +
    "a.style.cssText='position:fixed;bottom:20px;right:20px;z-index:9999;background:#0f172a;color:#fff;padding:10px 16px;border-radius:999px;font:600 13px system-ui,sans-serif;text-decoration:none;box-shadow:0 4px 14px rgba(15,23,42,.3)';" +
    'document.body.appendChild(a);' +
    '}catch(e){}})()</script>'
  );
}
