import type { DocType as PdfDocType } from '@/utils/visualTemplateBuilder';
import { getCachedDocType, useDocTypes } from '@/modules/documents/domain/docTypeRegistry';

/**
 * `FREE` es un tipo extendido propio (no existe en el paquete @openfactu/pdf).
 * Identifica plantillas "libres" — sin documento ligado — útiles para
 * recibos genéricos, cartas, etc.
 *
 * `LABEL` identifica plantillas de etiquetas — artículos, lotes, documentos.
 * Se renderizan con `queries` y `params` sin payload de documento.
 */
export type DocType = PdfDocType | 'FREE' | 'LABEL';

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  SINV: 'Factura de Venta',
  PINV: 'Factura de Compra',
  SDN: 'Albarán de Venta',
  PDN: 'Albarán de Compra',
  SO: 'Pedido de Venta',
  PO: 'Pedido de Compra',
  FREE: 'Documento Libre',
  LABEL: 'Etiqueta',
};

export const DOC_TYPE_COLORS: Record<DocType, string> = {
  SINV: 'bg-amber-50 dark:bg-amber-900 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-600',
  PINV: 'bg-amber-50 dark:bg-amber-900 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-600',
  SDN: 'bg-emerald-50 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-600',
  PDN: 'bg-emerald-50 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-600',
  SO: 'bg-indigo-50 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-600',
  PO: 'bg-indigo-50 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-600',
  FREE: 'bg-purple-50 dark:bg-purple-900 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-600',
  LABEL:
    'bg-violet-50 dark:bg-violet-900 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-600',
};

export const DOC_TYPE_OPTIONS = (Object.keys(DOC_TYPE_LABELS) as DocType[]).map((v) => ({
  label: DOC_TYPE_LABELS[v],
  value: v,
}));

// ── Versión registry-aware ─────────────────────────────────────────
// Los exports estáticos de arriba solo conocen los 6 tipos core (+FREE/LABEL).
// Estos helpers consultan además GET /api/documents/types para que los tipos
// nuevos (SQ, plugins) aparezcan en el diseñador sin recompilar la web.

/** Colores por categoría para tipos que no están en DOC_TYPE_COLORS. */
const CATEGORY_FALLBACK_COLORS: Record<string, string> = {
  invoice: DOC_TYPE_COLORS.SINV,
  delivery_note: DOC_TYPE_COLORS.SDN,
  order: DOC_TYPE_COLORS.SO,
  quote:
    'bg-sky-50 dark:bg-sky-900 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-600',
};

export function getDocTypeLabel(dt: DocType): string {
  return DOC_TYPE_LABELS[dt] ?? getCachedDocType(dt)?.label ?? dt;
}

export function getDocTypeColor(dt: DocType): string {
  if (DOC_TYPE_COLORS[dt]) return DOC_TYPE_COLORS[dt];
  const server = getCachedDocType(dt);
  return (
    CATEGORY_FALLBACK_COLORS[server?.category ?? ''] ??
    'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600'
  );
}

/** Hook: opciones de tipo de documento (registry + FREE/LABEL). */
export function useDocTypeOptions(): { label: string; value: DocType }[] {
  const { types } = useDocTypes();
  if (types.length === 0) return DOC_TYPE_OPTIONS;
  return [
    ...types.map((t) => ({ label: t.label, value: t.docType as DocType })),
    { label: DOC_TYPE_LABELS.FREE, value: 'FREE' as DocType },
    { label: DOC_TYPE_LABELS.LABEL, value: 'LABEL' as DocType },
  ];
}

export interface TemplateRow {
  id: string;
  docType: DocType;
  name: string;
  isDefault: boolean;
  updatedAt?: string;
  html?: string;
  canvasLayout?: unknown;
  layoutVersion?: number;
  legacyHtml?: boolean;
}
