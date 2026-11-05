import { extractMetaFromHtml } from '@openfactu/pdf/browser';
import { fetchDocTypes } from '@/modules/documents/domain/docTypeRegistry';
import { templatesApi } from '../api';
import type { CanvasLayout } from '../components/canvas/types';
import { buildStarterLayout, COMPANY_ROWS, type CompanyRows } from './blocks';

const COMPANY_PATHS: Record<keyof CompanyRows, string> = {
  logo: 'company.logoUrl',
  taxId: 'company.taxId',
  address: 'company.address',
  phone: 'company.phone',
  email: 'company.email',
  website: 'company.website',
};

/** El servidor dice qué datos tiene la empresa: los que no, no se colocan en el papel. */
async function companyRows(docType: string): Promise<CompanyRows> {
  const keys = Object.keys(COMPANY_PATHS) as (keyof CompanyRows)[];
  try {
    const { html } = await templatesApi.renderElements({
      docType,
      pieces: keys.map((key) => `{{#if ${COMPANY_PATHS[key]}}}1{{/if}}`),
    });
    return Object.fromEntries(
      keys.map((key, i) => [key, html[i] === '1']),
    ) as unknown as CompanyRows;
  } catch {
    return COMPANY_ROWS;
  }
}

/** El diseño con el que una plantilla entra en el lienzo: el de sus opciones, si las tiene. */
export async function loadStarterLayout(docType: string, html?: unknown): Promise<CanvasLayout> {
  // El título del tipo de documento sale del registro.
  await fetchDocTypes().catch(() => undefined);
  return buildStarterLayout(docType, {
    visual: extractMetaFromHtml(String(html ?? '')),
    company: await companyRows(docType),
  });
}
