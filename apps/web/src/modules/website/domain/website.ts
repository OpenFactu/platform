import type { PageDocument } from '@openfactu/site-builder';

export interface WebsiteSite {
  id: string;
  name: string;
  slug: string;
  status: 'draft' | 'published';
  themeOverrides: {
    colorPrimary?: string;
    colorAccent?: string;
    fontId?: string;
    logoUrl?: string;
    /** Redondez de esquinas: none|sm|md|lg (default 'md' si se omite). */
    radius?: string;
  } | null;
  /** CSS libre inyectado en <head> tras el CSS base — el "editor CSS" avanzado. */
  customCss: string | null;
  /** Tarifa (PriceList) de la tienda web; null = precios base. */
  priceListId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface WebsitePage {
  id: string;
  siteId: string;
  path: string;
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
  isHome: boolean;
  status: 'draft' | 'published';
  blocksDraft: PageDocument;
  blocksPublished: PageDocument | null;
  updatedAt: string;
}

export interface WebsiteHost {
  id: string;
  kind: 'slug' | 'subdomain' | 'domain';
  value: string;
  verified: boolean;
}

export interface WebsiteSubmission {
  id: string;
  name: string | null;
  email: string | null;
  message: string | null;
  /** ip/userAgent/referer + fields (campos de formularios personalizados) */
  meta: { fields?: Record<string, string> } | null;
  read: boolean;
  createdAt: string;
}

export interface WebsiteAsset {
  id: string;
  fileName: string;
  mime: string;
  size: number;
  /** Backend físico donde vive el archivo: local | gdrive | onedrive */
  provider: string;
  uploadedAt: string;
  publicUrl: string;
  folder: string | null;
  tags: string[] | null;
}
