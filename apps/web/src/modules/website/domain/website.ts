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
  } | null;
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
  publicUrl: string;
}
