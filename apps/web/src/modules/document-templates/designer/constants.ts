import { t } from '@/i18n/i18n';
import type { Band, BandKind, ElementKind } from '../components/canvas/types';

/** Claves i18n (se traducen al pintar). */
export const BAND_LABELS: Record<BandKind, string> = {
  pageHeader: 'templates.designer.bands.pageHeader',
  docHeader: 'templates.designer.bands.docHeader',
  detail: 'templates.designer.bands.detail',
  totals: 'templates.designer.bands.totals',
  pageFooter: 'templates.designer.bands.pageFooter',
  custom: 'templates.designer.bands.custom',
};

/** Etiqueta visible de una banda: su `label` propio o el genérico por `kind`. */
export const bandLabel = (b: Band): string => b.label ?? t(BAND_LABELS[b.kind]);

/** Tamaño por defecto en mm cuando se suelta un elemento de la paleta. */
export const DEFAULT_SIZE: Record<ElementKind, { w: number; h: number }> = {
  text: { w: 60, h: 8 },
  image: { w: 40, h: 20 },
  shape: { w: 60, h: 4 },
  spacer: { w: 60, h: 6 },
  field: { w: 60, h: 8 },
  linesTable: { w: 180, h: 80 },
  totals: { w: 80, h: 30 },
  qr: { w: 25, h: 25 },
  barcode: { w: 60, h: 15 },
  conditional: { w: 60, h: 8 },
  signature: { w: 70, h: 25 },
  pageBreak: { w: 60, h: 4 },
  divider: { w: 80, h: 4 },
  summary: { w: 60, h: 8 },
  box: { w: 80, h: 30 },
  list: { w: 80, h: 40 },
  currentDate: { w: 50, h: 8 },
};

export const FONT_OPTIONS = [
  {
    value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    label: 'Sans-serif',
  },
  { value: "Georgia, 'Times New Roman', serif", label: 'Serif (Georgia)' },
  { value: "'Times New Roman', Times, serif", label: 'Times New Roman' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial / Helvetica' },
  { value: "'Courier New', Courier, monospace", label: 'Courier (mono)' },
  { value: "'Trebuchet MS', sans-serif", label: 'Trebuchet' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
];

/** Dónde y a qué tamaño sale la numeración de páginas en el PDF, medido sobre uno generado. */
export const PAGE_NUMBER_BOTTOM_MM = 4.6;
export const PAGE_NUMBER_PT = 7.7;

/** Constante CSS: 1mm = 3.779527 px a 96 DPI. */
export const PX_PER_MM = 3.779527559;

/** Tipos sin texto: en la sección Estilo solo muestran fondo/borde, no fuente. */
export const STYLE_NO_FONT = new Set<ElementKind>([
  'shape',
  'image',
  'divider',
  'box',
  'qr',
  'barcode',
]);

/** Umbral de imantado (mm) para las guías de alineación. */
export const SNAP_MM = 1.5;

/** Elementos sueltos del panel, por lo que hacen. `icon` es un nombre de lucide. */
export const ELEMENT_GROUPS: { key: string; items: { kind: ElementKind; icon: string }[] }[] = [
  {
    key: 'content',
    items: [
      { kind: 'text', icon: 'Type' },
      { kind: 'field', icon: 'Braces' },
      { kind: 'currentDate', icon: 'Calendar' },
      { kind: 'conditional', icon: 'GitBranch' },
      { kind: 'summary', icon: 'Sigma' },
      { kind: 'list', icon: 'List' },
    ],
  },
  {
    key: 'tables',
    items: [
      { kind: 'linesTable', icon: 'Table' },
      { kind: 'totals', icon: 'Calculator' },
    ],
  },
  {
    key: 'shapes',
    items: [
      { kind: 'image', icon: 'Image' },
      { kind: 'box', icon: 'Square' },
      { kind: 'shape', icon: 'Shapes' },
      { kind: 'divider', icon: 'Minus' },
      { kind: 'spacer', icon: 'MoveVertical' },
    ],
  },
  {
    key: 'codes',
    items: [
      { kind: 'qr', icon: 'QrCode' },
      { kind: 'barcode', icon: 'Barcode' },
      { kind: 'signature', icon: 'PenLine' },
      { kind: 'pageBreak', icon: 'Scissors' },
    ],
  },
];

/** Banda en la que encaja cada elemento si se añade con un clic. */
export const NATURAL_BAND: Partial<Record<ElementKind, BandKind>> = {
  linesTable: 'detail',
  list: 'detail',
  summary: 'totals',
  totals: 'totals',
  signature: 'pageFooter',
  qr: 'pageFooter',
  barcode: 'pageFooter',
};
