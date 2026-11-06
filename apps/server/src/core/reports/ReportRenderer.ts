/**
 * Renderer común para informes (distinto de los PDFs de documentos).
 * Produce un PDF con: cabecera empresa + logo, título + subtítulo + filtros
 * aplicados, tabla de datos con totales opcionales, pie con fecha y nº página.
 *
 * Reutiliza `PdfRenderer.render(html, data, options)` del paquete @openfactu/pdf
 * para compartir motor Puppeteer + branding. La plantilla es sencilla (tabla)
 * — no usa visualTemplateBuilder que está pensado para documentos comerciales.
 */
import { PdfRenderer } from '@openfactu/pdf';
import { getCompanyConfig } from '../config/companyConfig';
import { LocalizationRegistry } from '../localization/LocalizationRegistry';
import { intlLocale, tr } from '../../i18n';

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  /** Formato: 'money' | 'date' | 'percent' | 'text' (default). */
  format?: 'money' | 'date' | 'percent' | 'integer' | 'text';
  /** Ancho de columna (CSS, ej '12%'). */
  width?: string;
}

export interface ReportTotals {
  /** Etiqueta de la fila de totales (ej. "TOTAL") */
  label: string;
  /** Para cada columna que deba mostrar total: clave → valor ya calculado. */
  values: Record<string, number | string>;
}

export interface ReportSection {
  /** Título opcional del bloque. */
  title?: string;
  columns: ReportColumn[];
  rows: Array<Record<string, any>>;
  totals?: ReportTotals;
}

export interface ReportInput {
  title: string;
  subtitle?: string;
  /** Pares "Filtro: valor" que aparecen bajo el título. */
  filters?: Array<{ label: string; value: string }>;
  /** Una o más tablas. */
  sections: ReportSection[];
  /** Orientación del papel. */
  orientation?: 'portrait' | 'landscape';
  /** Pie opcional extra. */
  footerText?: string;
  /** Datos del tenant/empresa para la cabecera. */
  companyName?: string;
  companyAddress?: string;
  companyNif?: string;
  /** Cómo se llama la identificación fiscal en la normativa de la empresa. */
  companyTaxIdLabel?: string;
  companyLogoUrl?: string;
  /** Moneda ISO de los importes ('EUR' por defecto). */
  currency?: string;
  /** Formato sin color, igual que los documentos. */
  neutral?: boolean;
  /** Idioma de los formatos y de los textos fijos. Sin indicar, español. */
  locale?: string;
}

const BRAND_COLORS = {
  ink: '#0f172a',
  headBg: '#f1f5f9',
  rowAlt: '#f8fafc',
  rowLine: '#e2e8f0',
  text: '#1e293b',
  muted: '#64748b',
  faint: '#94a3b8',
  filter: '#475569',
  sectionLine: '#cbd5e1',
  totalsBg: '#0f172a',
  totalsFg: '#fff',
};

const NEUTRAL_COLORS: typeof BRAND_COLORS = {
  ink: '#000',
  headBg: '#fff',
  rowAlt: '#fff',
  rowLine: '#000',
  text: '#000',
  muted: '#000',
  faint: '#000',
  filter: '#000',
  sectionLine: '#000',
  totalsBg: '#fff',
  totalsFg: '#000',
};

function formatValue(
  v: any,
  fmt?: ReportColumn['format'],
  currency = 'EUR',
  intl = 'es-ES',
): string {
  if (v === null || v === undefined || v === '') return '';
  switch (fmt) {
    case 'money': {
      const n = typeof v === 'string' ? parseFloat(v) : Number(v);
      if (!Number.isFinite(n)) return String(v);
      return currency === 'EUR' && intl === 'es-ES'
        ? n.toLocaleString(intl, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
        : n.toLocaleString(intl, { style: 'currency', currency });
    }
    case 'integer': {
      const n = typeof v === 'string' ? parseInt(v, 10) : Number(v);
      return Number.isFinite(n) ? n.toLocaleString(intl) : String(v);
    }
    case 'percent': {
      const n = typeof v === 'string' ? parseFloat(v) : Number(v);
      return Number.isFinite(n)
        ? n.toLocaleString(intl, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' %'
        : String(v);
    }
    case 'date': {
      if (v instanceof Date) return v.toLocaleDateString(intl);
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString(intl);
    }
    default:
      return String(v);
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(input: ReportInput): string {
  const c = input.neutral ? NEUTRAL_COLORS : BRAND_COLORS;
  const font = input.neutral
    ? `Arial, Helvetica, 'Liberation Sans', FreeSans, sans-serif`
    : `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const locale = input.locale ?? 'es';
  const intl = intlLocale(locale);
  const value = (v: any, fmt?: ReportColumn['format']) => formatValue(v, fmt, input.currency, intl);

  const sections = input.sections
    .map((s) => {
      const headerHtml = s.columns
        .map(
          (col) =>
            `<th style="text-align:${col.align || 'left'};padding:8px 10px;border-bottom:${input.neutral ? '1px' : '2px'} solid ${c.ink};background:${c.headBg};color:${c.ink};font-size:10px;${input.neutral ? '' : 'text-transform:uppercase;letter-spacing:0.04em;'}${col.width ? `width:${col.width};` : ''}">${escapeHtml(col.label)}</th>`,
        )
        .join('');
      const bodyHtml = s.rows
        .map(
          (r, i) =>
            `<tr style="background:${i % 2 === 0 ? '#ffffff' : c.rowAlt};">${s.columns
              .map(
                (col) =>
                  `<td style="text-align:${col.align || 'left'};padding:6px 10px;border-bottom:${input.neutral ? '0.5pt' : '1px'} solid ${c.rowLine};font-size:11px;color:${c.text};${col.format === 'money' || col.format === 'integer' || col.format === 'percent' ? 'font-variant-numeric:tabular-nums;' : ''}">${escapeHtml(value(r[col.key], col.format))}</td>`,
              )
              .join('')}</tr>`,
        )
        .join('');
      const totalsHtml = s.totals
        ? `<tr style="background:${c.totalsBg};color:${c.totalsFg};font-weight:700;">${s.columns
            .map((col, i) => {
              const label = i === 0 ? s.totals!.label : '';
              const tv = s.totals!.values[col.key];
              const text = tv !== undefined ? value(tv, col.format) : i === 0 ? label : '';
              return `<td style="text-align:${col.align || 'left'};padding:8px 10px;font-size:11px;${input.neutral ? `border-top:1px solid ${c.ink};` : ''}${col.format === 'money' || col.format === 'integer' || col.format === 'percent' ? 'font-variant-numeric:tabular-nums;' : ''}">${escapeHtml(text)}</td>`;
            })
            .join('')}</tr>`
        : '';
      const sectionTitle = s.title
        ? `<h3 style="font-size:13px;color:${c.ink};margin:18px 0 8px;${input.neutral ? '' : `padding-bottom:4px;border-bottom:1px solid ${c.sectionLine};`}">${escapeHtml(s.title)}</h3>`
        : '';
      return `
        ${sectionTitle}
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <thead><tr>${headerHtml}</tr></thead>
          <tbody>${bodyHtml || `<tr><td colspan="${s.columns.length}" style="padding:24px;text-align:center;color:${c.faint};font-style:italic;">${escapeHtml(tr(locale, 'Sin datos'))}</td></tr>`}</tbody>
          ${totalsHtml}
        </table>`;
    })
    .join('');

  const filtersHtml = input.filters?.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:14px;margin:10px 0 18px;font-size:10px;color:${c.filter};">${input.filters
        .map(
          (f) =>
            `<div><span style="font-weight:700;${input.neutral ? '' : 'text-transform:uppercase;letter-spacing:0.05em;'}color:${c.faint};">${escapeHtml(f.label)}:</span> <span style="color:${c.ink};">${escapeHtml(f.value)}</span></div>`,
        )
        .join('')}</div>`
    : '';

  const logoHtml = input.companyLogoUrl
    ? `<img src="${escapeHtml(input.companyLogoUrl)}" alt="" style="height:42px;object-fit:contain;${input.neutral ? 'filter:grayscale(100%);' : ''}" />`
    : '';

  const now = new Date().toLocaleString(intl);

  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  @page { size: ${input.orientation === 'landscape' ? 'A4 landscape' : 'A4'}; margin: 18mm; }
  body { font-family: ${font}; color: ${c.ink}; margin: 0; }
  h1 { font-size: ${input.neutral ? '16px' : '22px'}; margin: 0; color: ${c.ink}; ${input.neutral ? '' : 'letter-spacing: -0.02em;'} }
  .sub { font-size: 12px; color: ${c.muted}; margin-top: 4px; }
  .footer { margin-top: 26px; padding-top: 10px; border-top: ${input.neutral ? '0.5pt' : '1px'} solid ${c.rowLine}; font-size: 9px; color: ${c.faint}; display:flex; justify-content:space-between; }
</style></head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:${input.neutral ? '1px' : '2px'} solid ${c.ink};">
    <div>
      <h1>${escapeHtml(input.title)}</h1>
      ${input.subtitle ? `<div class="sub">${escapeHtml(input.subtitle)}</div>` : ''}
    </div>
    <div style="text-align:right;">
      ${logoHtml}
      <div style="font-size:11px;font-weight:700;margin-top:6px;">${escapeHtml(input.companyName || '')}</div>
      ${input.companyNif ? `<div style="font-size:10px;color:${c.muted};">${escapeHtml(input.companyTaxIdLabel || '')} ${escapeHtml(input.companyNif)}</div>` : ''}
      ${input.companyAddress ? `<div style="font-size:10px;color:${c.muted};">${escapeHtml(input.companyAddress)}</div>` : ''}
    </div>
  </div>
  ${filtersHtml}
  ${sections}
  <div class="footer">
    <span>${escapeHtml(input.footerText || '')}</span>
    <span>${escapeHtml(tr(locale, 'Generado {date}', { date: now }))}</span>
  </div>
</body></html>`;
}

export async function renderReportPdf(input: ReportInput): Promise<Buffer> {
  const html = buildHtml(input);
  // PdfRenderer.render usa Handlebars pero como no hay {{}} en nuestro HTML se
  // comporta como plain template. Le pasamos un `data` vacío.
  return PdfRenderer.render(html, {} as any, {
    orientation: input.orientation || 'portrait',
    pageSize: 'A4',
    showPageNumbers: true,
    footerAlignment: 'center',
    neutral: input.neutral,
  });
}

/**
 * Obtiene datos de cabecera del tenant (nombre, identificación fiscal, dirección)
 * para los PDFs. Puede devolver undefined si no hay config.
 */
export async function getCompanyHeader(
  tenantClient: any,
  tenantId?: string,
  locale?: string,
): Promise<{
  companyName?: string;
  companyNif?: string;
  companyTaxIdLabel?: string;
  companyAddress?: string;
  companyLogoUrl?: string;
  currency?: string;
}> {
  try {
    const cfg = await getCompanyConfig(tenantClient);
    const addressParts = [cfg.address, cfg.zipCode, cfg.city].filter(Boolean);
    return {
      companyName: cfg.name || undefined,
      companyNif: cfg.taxId || undefined,
      companyTaxIdLabel: LocalizationRegistry.terminologyFor(tenantId, locale).taxId,
      companyAddress: addressParts.join(', ') || undefined,
      companyLogoUrl: cfg.logoUrl || undefined,
      currency: cfg.currency || undefined,
    };
  } catch {
    return {};
  }
}
