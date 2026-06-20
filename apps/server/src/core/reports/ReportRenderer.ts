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
  companyLogoUrl?: string;
}

function formatValue(v: any, fmt?: ReportColumn['format']): string {
  if (v === null || v === undefined || v === '') return '';
  switch (fmt) {
    case 'money': {
      const n = typeof v === 'string' ? parseFloat(v) : Number(v);
      return Number.isFinite(n)
        ? n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
        : String(v);
    }
    case 'integer': {
      const n = typeof v === 'string' ? parseInt(v, 10) : Number(v);
      return Number.isFinite(n) ? n.toLocaleString('es-ES') : String(v);
    }
    case 'percent': {
      const n = typeof v === 'string' ? parseFloat(v) : Number(v);
      return Number.isFinite(n)
        ? n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' %'
        : String(v);
    }
    case 'date': {
      if (v instanceof Date) return v.toLocaleDateString('es-ES');
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('es-ES');
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
  const sections = input.sections
    .map((s) => {
      const headerHtml = s.columns
        .map(
          (c) =>
            `<th style="text-align:${c.align || 'left'};padding:8px 10px;border-bottom:2px solid #0f172a;background:#f1f5f9;color:#0f172a;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;${c.width ? `width:${c.width};` : ''}">${escapeHtml(c.label)}</th>`,
        )
        .join('');
      const bodyHtml = s.rows
        .map(
          (r, i) =>
            `<tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">${s.columns
              .map(
                (c) =>
                  `<td style="text-align:${c.align || 'left'};padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#1e293b;${c.format === 'money' || c.format === 'integer' || c.format === 'percent' ? 'font-variant-numeric:tabular-nums;' : ''}">${escapeHtml(formatValue(r[c.key], c.format))}</td>`,
              )
              .join('')}</tr>`,
        )
        .join('');
      const totalsHtml = s.totals
        ? `<tr style="background:#0f172a;color:#fff;font-weight:700;">${s.columns
            .map((c, i) => {
              const label = i === 0 ? s.totals!.label : '';
              const tv = s.totals!.values[c.key];
              const text = tv !== undefined ? formatValue(tv, c.format) : i === 0 ? label : '';
              return `<td style="text-align:${c.align || 'left'};padding:8px 10px;font-size:11px;${c.format === 'money' || c.format === 'integer' || c.format === 'percent' ? 'font-variant-numeric:tabular-nums;' : ''}">${escapeHtml(text)}</td>`;
            })
            .join('')}</tr>`
        : '';
      const sectionTitle = s.title
        ? `<h3 style="font-size:13px;color:#0f172a;margin:18px 0 8px;padding-bottom:4px;border-bottom:1px solid #cbd5e1;">${escapeHtml(s.title)}</h3>`
        : '';
      return `
        ${sectionTitle}
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <thead><tr>${headerHtml}</tr></thead>
          <tbody>${bodyHtml || `<tr><td colspan="${s.columns.length}" style="padding:24px;text-align:center;color:#94a3b8;font-style:italic;">Sin datos</td></tr>`}</tbody>
          ${totalsHtml}
        </table>`;
    })
    .join('');

  const filtersHtml = input.filters?.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:14px;margin:10px 0 18px;font-size:10px;color:#475569;">${input.filters
        .map(
          (f) =>
            `<div><span style="font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;">${escapeHtml(f.label)}:</span> <span style="color:#0f172a;">${escapeHtml(f.value)}</span></div>`,
        )
        .join('')}</div>`
    : '';

  const logoHtml = input.companyLogoUrl
    ? `<img src="${escapeHtml(input.companyLogoUrl)}" style="height:42px;object-fit:contain;" />`
    : '';

  const now = new Date().toLocaleString('es-ES');

  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  @page { size: ${input.orientation === 'landscape' ? 'A4 landscape' : 'A4'}; margin: 18mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; margin: 0; }
  h1 { font-size: 22px; margin: 0; color: #0f172a; letter-spacing: -0.02em; }
  .sub { font-size: 12px; color: #64748b; margin-top: 4px; }
  .footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #94a3b8; display:flex; justify-content:space-between; }
</style></head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:2px solid #0f172a;">
    <div>
      <h1>${escapeHtml(input.title)}</h1>
      ${input.subtitle ? `<div class="sub">${escapeHtml(input.subtitle)}</div>` : ''}
    </div>
    <div style="text-align:right;">
      ${logoHtml}
      <div style="font-size:11px;font-weight:700;margin-top:6px;">${escapeHtml(input.companyName || '')}</div>
      ${input.companyNif ? `<div style="font-size:10px;color:#64748b;">NIF ${escapeHtml(input.companyNif)}</div>` : ''}
      ${input.companyAddress ? `<div style="font-size:10px;color:#64748b;">${escapeHtml(input.companyAddress)}</div>` : ''}
    </div>
  </div>
  ${filtersHtml}
  ${sections}
  <div class="footer">
    <span>${escapeHtml(input.footerText || '')}</span>
    <span>Generado ${escapeHtml(now)}</span>
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
  });
}

/**
 * Obtiene datos de cabecera del tenant (nombre, NIF, dirección) para los PDFs.
 * Puede devolver undefined si no hay config.
 */
export async function getCompanyHeader(tenantClient: any): Promise<{
  companyName?: string;
  companyNif?: string;
  companyAddress?: string;
  companyLogoUrl?: string;
}> {
  try {
    const cfg = await getCompanyConfig(tenantClient);
    const addressParts = [cfg.address, cfg.zipCode, cfg.city].filter(Boolean);
    return {
      companyName: cfg.name || undefined,
      companyNif: cfg.taxId || undefined,
      companyAddress: addressParts.join(', ') || undefined,
      companyLogoUrl: cfg.logoUrl || undefined,
    };
  } catch {
    return {};
  }
}
