/**
 * Bloques listos para usar: un grupo de elementos ya colocados que resuelve una parte
 * entera del documento, para no montarla pieza a pieza. También dan el diseño con el que
 * una plantilla hecha en el formulario se abre en el lienzo: las medidas salen de
 * `neutralStyle.ts` de @openfactu/pdf, para que se vea como su PDF.
 */
import {
  isMonochrome,
  NEUTRAL_VISUAL_OPTIONS,
  neutralFontStack,
  pdfLabel,
  type VisualOptions,
} from '@openfactu/pdf/browser';
import { intlLocale, t } from '@/i18n/i18n';
import { getCachedDocType } from '@/modules/documents/domain/docTypeRegistry';
import { escapeHtml, flowsInBand } from '../components/canvas/compileCanvas';
import {
  createEmptyLayout,
  resolvePageDimensions,
  type BandKind,
  type CanvasElement,
  type CanvasLayout,
  type ElementStyle,
  type FieldElement,
  type LinesTableColumn,
} from '../components/canvas/types';
import { genId } from './elements';

/**
 * Qué datos tiene la empresa. El PDF se salta los que faltan y aquí cada uno ocupa un sitio
 * fijo, pero no cambian de un documento a otro: basta con no ponerlos.
 */
export interface CompanyRows {
  logo: boolean;
  taxId: boolean;
  address: boolean;
  phone: boolean;
  email: boolean;
  website: boolean;
}

export interface BlockContext {
  docType: string;
  /** Primer milímetro útil a la izquierda. */
  left: number;
  /** Ancho útil de la página en mm. */
  width: number;
  /** Las opciones del documento del que se parte. */
  visual: VisualOptions;
  company: CompanyRows;
}

export interface BlockDef {
  id: string;
  /** Icono de lucide. */
  icon: string;
  /** Banda en la que encaja por naturaleza. */
  band: BandKind;
  /** Lado de la página, si no ocupa todo el ancho. */
  side?: 'left' | 'right';
  build: (ctx: BlockContext) => CanvasElement[];
  /** Solo para documentos con tercero, líneas y totales. */
  commercial?: boolean;
  /** Solo para las fichas de las tablas propias. */
  record?: boolean;
}

const MM_PER_PX = 25.4 / 96;
const MM_PER_PT = 25.4 / 72;
const px = (value: number) => value * MM_PER_PX;
const round = (value: number) => Math.round(value * 100) / 100;
/** Alto de una línea de texto, con el interlineado del formato estándar. */
const lineHeight = (pt: number) => pt * 1.4 * MM_PER_PT;

const FONT_STACK: Record<VisualOptions['fontFamily'], string> = {
  sans: "'DM Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', Times, serif",
  mono: "'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, 'Courier New', monospace",
};
const MARGINS: Record<VisualOptions['margins'], CanvasLayout['margins']> = {
  narrow: { top: 10, right: 10, bottom: 10, left: 10 },
  normal: { top: 18, right: 18, bottom: 18, left: 18 },
  wide: { top: 28, right: 24, bottom: 28, left: 24 },
};

/** El texto del PDF para esa clave, en el idioma de quien diseña. */
const pdfText = (key: string) => pdfLabel(intlLocale(), key);

const isNeutral = (visual: VisualOptions) => visual.style === 'neutral';
/** Color de lo destacado; el formato sin color lo deja en el negro del papel. */
const inkOf = (visual: VisualOptions) => (isMonochrome(visual) ? undefined : visual.headerBgColor);
const mutedOf = (visual: VisualOptions) => (isMonochrome(visual) ? undefined : visual.mutedColor);
/** El título y la línea de la cabecera: en el formato estándar, el color primario. */
const accentOf = (visual: VisualOptions) =>
  isNeutral(visual)
    ? isMonochrome(visual)
      ? undefined
      : visual.accentColor
    : visual.headerBgColor;

/** Solo los colores que hay: un `color: undefined` no aporta nada al guardarse. */
function textStyle(style: ElementStyle): ElementStyle {
  const clean: ElementStyle = { padding: 0, ...style };
  if (!clean.color) delete clean.color;
  return clean;
}

function text(x: number, y: number, w: number, h: number, value: string, style: ElementStyle) {
  return {
    id: genId('text'),
    kind: 'text',
    x: round(x),
    y: round(y),
    w: round(w),
    h: round(h),
    text: value,
    style: textStyle(style),
  } as CanvasElement;
}

function rawText(
  x: number,
  y: number,
  w: number,
  h: number,
  value: string,
  extra?: Partial<CanvasElement>,
) {
  return {
    ...text(x, y, w, h, value, { verticalAlign: 'top' }),
    raw: true,
    ...extra,
  } as CanvasElement;
}

function field(
  x: number,
  y: number,
  w: number,
  h: number,
  path: string,
  style: ElementStyle,
  extra?: Partial<FieldElement>,
) {
  return {
    id: genId('field'),
    kind: 'field',
    x: round(x),
    y: round(y),
    w: round(w),
    h: round(h),
    path,
    style: textStyle(style),
    ...extra,
  } as CanvasElement;
}

/** Texto fijo que solo tiene sentido si el dato de al lado existe. */
function labelIf(
  x: number,
  y: number,
  w: number,
  h: number,
  path: string,
  value: string,
  pt: number,
) {
  return {
    id: genId('conditional'),
    kind: 'conditional',
    x: round(x),
    y: round(y),
    w: round(w),
    h: round(h),
    path,
    operator: 'truthy',
    thenText: value,
    style: { fontSize: pt, fontWeight: 'bold' },
    customCss: 'line-height:1.4',
  } as CanvasElement;
}

/** Quien recibe o quien envía el documento. */
function partnerTitle({ docType, visual }: BlockContext): string {
  return (
    visual.partnerLabel ||
    getCachedDocType(docType)?.partnerLabel ||
    t('templates.blocks.partnerTitle')
  );
}

const rightColumn = (width: number) => width * 0.38;

/**
 * Lo que imprime el documento después de los totales: va en flujo, sin dejar huecos. Sus
 * colores son los de todo el documento (`documentColorsCss`), negro si no los tiene.
 */
const MUTED = 'color:var(--doc-muted,inherit);';
const CLOSING_HTML = [
  '{{#if company.signature.show}}<section style="margin-top:24px;width:220px;page-break-inside:avoid;">',
  '{{#if company.signature.imageUrl}}<img src="{{company.signature.imageUrl}}" alt="" style="max-height:64px;max-width:200px;display:block;filter:var(--doc-image-filter,grayscale(100%));" />{{else}}<div style="margin-top:40px;"></div>{{/if}}',
  `<div style="border-top:0.5pt solid var(--doc-muted,#000);padding-top:3px;margin-top:3px;"><div style="font-weight:700;color:var(--doc-ink,inherit);">{{company.signature.name}}</div>{{#if company.signature.role}}<div style="font-size:9pt;${MUTED}">{{company.signature.role}}</div>{{/if}}</div>`,
  '</section>{{/if}}',
  '{{#if company.iban}}<section style="padding-top:14px;page-break-inside:avoid;">',
  `<div style="font-size:9pt;font-weight:700;margin-bottom:2px;${MUTED}">{{label "bankTransfer"}}</div>`,
  `<div style="display:flex;gap:10px;font-size:9pt;"><span style="min-width:50px;${MUTED}">IBAN</span><span>{{company.iban}}</span></div>`,
  `{{#if company.bankName}}<div style="display:flex;gap:10px;font-size:9pt;"><span style="min-width:50px;${MUTED}">{{label "bank"}}</span><span>{{company.bankName}}</span></div>{{/if}}`,
  `{{#if company.bankSwift}}<div style="display:flex;gap:10px;font-size:9pt;"><span style="min-width:50px;${MUTED}">SWIFT</span><span>{{company.bankSwift}}</span></div>{{/if}}`,
  '</section>{{/if}}',
  `{{#each legalTexts}}<p style="margin:14px 0 0;font-size:8pt;${MUTED}">{{this}}</p>{{/each}}`,
  `{{#if company.invoiceFooter}}<p style="margin:14px 0 0;font-size:8pt;${MUTED}">{{company.invoiceFooter}}</p>{{/if}}`,
].join('');

/** El mensaje y la fecha del formulario: el formato estándar los pone al final del documento. */
function closingHtml(visual: VisualOptions): string {
  const { text, showGeneratedAt, alignment } = visual.footer;
  const line = isNeutral(visual)
    ? [text && escapeHtml(text), showGeneratedAt && '{{generatedAt}}'].filter(Boolean).join(' · ')
    : '';
  const closingLine = line
    ? `<p style="margin:14px 0 0;font-size:8pt;text-align:${alignment};${MUTED}">${line}</p>`
    : '';
  return `<div style="width:100%;line-height:1.4;">${CLOSING_HTML}${closingLine}</div>`;
}

/** El PDF escribe seguida una dirección guardada en varias líneas. */
const COLLAPSE_LINES: Partial<FieldElement> = { customCss: 'white-space:normal' };

const RECORD_CELL =
  'padding:4px 6px 4px 0;font-size:9pt;vertical-align:top;border-bottom:0.5pt solid var(--doc-muted,#000);';

function column(
  label: string,
  path: string,
  widthPct: number,
  align: 'left' | 'right' = 'left',
  format?: FieldElement['format'],
  extra?: Partial<LinesTableColumn>,
): LinesTableColumn {
  return { id: genId('col'), label, path, widthPct, align, format, ...extra };
}

/** Las columnas que tiene el documento, con los anchos del formato estándar. */
function lineColumns({ visual }: BlockContext): LinesTableColumn[] {
  const shown = visual.columns;
  const bold: ElementStyle = { fontWeight: 'bold' };
  const fixed =
    (shown.code ? 12 : 0) +
    (shown.quantity ? 9 : 0) +
    (shown.uom ? 7 : 0) +
    (shown.price ? 13 : 0) +
    (shown.iva ? 10 : 0) +
    (shown.lineTotal ? 14 : 0);
  const columns: LinesTableColumn[] = [];
  if (shown.code) columns.push(column(pdfText('col.code'), 'itemCode', 12));
  if (shown.description) {
    columns.push(
      column(pdfText('col.description'), 'itemName', 100 - fixed, 'left', undefined, {
        detailPath: 'itemDescription',
        style: bold,
      }),
    );
  }
  if (shown.quantity) columns.push(column(pdfText('col.qty'), 'quantity', 9, 'right', 'number'));
  if (shown.uom) columns.push(column(pdfText('col.uom'), 'uom', 7, 'right'));
  if (shown.price) {
    columns.push(column(pdfText('col.price'), 'price', 13, 'right', 'currency'));
    // Sin esta columna, precio por cantidad no cuadra con el total de la línea.
    columns.push(
      column(pdfText('col.discount'), 'discountRate', 8, 'right', 'discount', {
        onlyIf: 'hasDiscounts',
      }),
    );
  }
  if (shown.iva) {
    columns.push(column(t('templates.blocks.colTax'), 'taxRate', 10, 'right', 'percentRaw'));
  }
  if (shown.lineTotal) {
    columns.push(
      column(pdfText('col.total'), 'lineTotal', 14, 'right', 'currency', { style: bold }),
    );
  }
  if (!isNeutral(visual)) {
    // Fondo oscuro en la cabecera: su texto va en blanco.
    for (const col of columns) col.headerStyle = { fontWeight: 'bold', color: '#fff' };
  }
  return columns;
}

export const BLOCKS: BlockDef[] = [
  {
    id: 'company',
    icon: 'Building2',
    band: 'pageHeader',
    side: 'left',
    build: ({ left, width, visual, company }) => {
      const base = visual.baseFontSize;
      const w = width * 0.6;
      const elements: CanvasElement[] = [];
      let y = 0;
      if (company.logo) {
        const height = visual.logoMaxHeight;
        const filter = isMonochrome(visual) ? 'filter:grayscale(100%);' : '';
        elements.push(
          rawText(
            left,
            y,
            px(200),
            px(height),
            `{{#if company.logoUrl}}<img src="{{company.logoUrl}}" alt="" style="max-height:${height}px;max-width:200px;display:block;${filter}" />{{/if}}`,
          ),
        );
        y += px(height) + px(7);
      }
      const nameHeight = lineHeight(base + 3);
      elements.push(
        field(left, y, w, nameHeight, 'company.name', {
          fontSize: base + 3,
          fontWeight: 'bold',
          color: inkOf(visual),
        }),
      );
      y += nameHeight + px(4);
      const small = lineHeight(base - 1);
      const row = (path: string, prefix?: string, extra?: Partial<FieldElement>) => {
        elements.push(
          field(
            left,
            y,
            w,
            small,
            path,
            { fontSize: base - 1, color: mutedOf(visual) },
            { ...(prefix ? { prefix } : {}), ...extra },
          ),
        );
        y += small + px(1);
      };
      if (visual.showCompanyTaxId && company.taxId) {
        row('company.taxId', `${t('templates.blocks.companyTaxId')}: `);
      }
      if (visual.showCompanyAddress && company.address)
        row('company.address', undefined, COLLAPSE_LINES);
      if (visual.showCompanyContact) {
        if (company.phone) row('company.phone');
        if (company.email) row('company.email');
        if (company.website) row('company.website');
      }
      return elements;
    },
  },
  {
    id: 'docInfo',
    icon: 'FileText',
    band: 'pageHeader',
    side: 'right',
    commercial: true,
    build: ({ left, width, docType, visual }) => {
      const base = visual.baseFontSize;
      const w = rightColumn(width);
      const x = left + width - w;
      const right: ElementStyle = { textAlign: 'right' };
      const small: ElementStyle = { ...right, fontSize: base - 1, color: mutedOf(visual) };
      const smallHeight = lineHeight(base - 1);
      const title = lineHeight(base + 3);
      const code = lineHeight(base + 1);
      let y = title + px(2) + code + px(1);
      const elements = [
        text(x, 0, w, title, visual.customTitle || getCachedDocType(docType)?.label || docType, {
          ...right,
          fontSize: base + 3,
          fontWeight: 'bold',
          color: accentOf(visual),
        }),
        field(x, title + px(2), w, code, 'doc.docCode', {
          ...right,
          fontSize: base + 1,
          fontWeight: 'bold',
          color: inkOf(visual),
        }),
        field(x, y, w, smallHeight, 'doc.date', small, { prefix: `${pdfText('date')}: ` }),
      ];
      y += smallHeight + px(1);
      elements.push(
        field(x, y, w, smallHeight, 'doc.statusLabel', small, {
          prefix: `${pdfText('status')}: `,
        }),
      );
      if (visual.showBaseDoc) {
        y += smallHeight + px(1);
        elements.push(
          field(x, y, w, smallHeight, 'doc.baseDocCode', small, {
            prefix: `${pdfText('baseDoc')}: `,
          }),
        );
      }
      return elements;
    },
  },
  {
    id: 'recordInfo',
    icon: 'FileText',
    band: 'pageHeader',
    side: 'right',
    record: true,
    build: ({ left, width, visual }) => {
      const base = visual.baseFontSize;
      const w = rightColumn(width);
      const x = left + width - w;
      const right: ElementStyle = { textAlign: 'right' };
      const title = lineHeight(base + 3);
      const code = lineHeight(base + 1);
      return [
        field(x, 0, w, title, 'doc.title', {
          ...right,
          fontSize: base + 3,
          fontWeight: 'bold',
          color: accentOf(visual),
        }),
        field(x, title + px(2), w, code, 'doc.docCode', {
          ...right,
          fontSize: base + 1,
          fontWeight: 'bold',
          color: inkOf(visual),
        }),
        field(
          x,
          title + px(2) + code + px(1),
          w,
          lineHeight(base - 1),
          'doc.date',
          {
            ...right,
            fontSize: base - 1,
            color: mutedOf(visual),
          },
          { prefix: `${pdfText('date')}: ` },
        ),
      ];
    },
  },
  {
    id: 'partner',
    icon: 'Users',
    band: 'docHeader',
    side: 'left',
    commercial: true,
    build: (ctx) => {
      const { left, width, visual } = ctx;
      const base = visual.baseFontSize;
      const w = width / 2 - px(12);
      const small = lineHeight(base - 1);
      const meta: ElementStyle = { fontSize: base - 1, color: mutedOf(visual) };
      // Una detrás de otra y sin sitio fijo, como en el PDF: si un cliente no tiene un
      // dato, no queda el hueco. La `y` de cada una es el aire que deja con la anterior.
      const flow = { flow: true };
      const elements = [
        {
          ...text(left, 0, w, small, partnerTitle(ctx), {
            fontSize: base - 1,
            fontWeight: 'bold',
            color: mutedOf(visual),
          }),
          ...flow,
        } as CanvasElement,
        field(
          left,
          px(2),
          w,
          lineHeight(base),
          'partner.name',
          { fontSize: base, fontWeight: 'bold', color: inkOf(visual) },
          flow,
        ),
      ];
      const row = (path: string, gap = 0, extra?: Partial<FieldElement>) => {
        elements.push(field(left, gap, w, small, path, meta, { ...flow, ...extra }));
      };
      if (visual.showPartnerTaxId) row('partner.taxId', px(1));
      if (visual.showPartnerAddress) row('partner.address', 0, COLLAPSE_LINES);
      if (visual.showPartnerContact) {
        row('partner.email');
        row('partner.phone');
      }
      elements.push(
        field(left, 0, w, small, 'partner.priceListName', meta, {
          ...flow,
          prefix: `${pdfText('priceList')}: `,
        }),
      );
      return elements;
    },
  },
  {
    id: 'shipTo',
    icon: 'Truck',
    band: 'docHeader',
    side: 'right',
    commercial: true,
    build: ({ left, width, visual }) => {
      const pt = visual.baseFontSize - 1;
      const muted = mutedOf(visual);
      const color = muted ? `color:${muted};` : '';
      // Una sola pieza porque se reparten el sitio según cuáles haya, como en el PDF.
      const party = (path: string, labelKey: string) =>
        `{{#if ${path}}}<div style="flex:1;min-width:0;"><div style="font-size:${pt}pt;font-weight:700;margin-bottom:2px;${color}">{{label "${labelKey}"}}</div><div style="font-size:${pt}pt;white-space:normal;${color}">{{${path}}}</div></div>{{/if}}`;
      return [
        rawText(
          left + width / 2 + px(12),
          0,
          width / 2 - px(12),
          18,
          `<div style="display:flex;gap:24px;width:100%;">${
            visual.showBillTo ? party('doc.billToAddress', 'billTo') : ''
          }${visual.showShipTo ? party('doc.shipToAddress', 'shipTo') : ''}</div>`,
        ),
      ];
    },
  },
  {
    id: 'lines',
    icon: 'Table',
    band: 'detail',
    commercial: true,
    build: (ctx) => [
      {
        id: genId('linesTable'),
        kind: 'linesTable',
        x: ctx.left,
        // El aire entre el cliente y la tabla del formato estándar.
        y: round(px(16)),
        w: ctx.width,
        h: 14,
        showHeader: true,
        tableStyle: 'neutral',
        columns: lineColumns(ctx),
        ...(isNeutral(ctx.visual) ? {} : { headerBg: ctx.visual.headerBgColor }),
      } as CanvasElement,
    ],
  },
  {
    id: 'totals',
    icon: 'Sigma',
    band: 'totals',
    side: 'right',
    commercial: true,
    build: ({ left, width, visual }) => [
      {
        id: genId('totals'),
        kind: 'totals',
        x: round(left + width - px(280)),
        // El aire entre la tabla y los totales del formato estándar.
        y: round(px(16)),
        w: round(px(280)),
        h: 22,
        flow: true,
        variant: 'neutral',
        showTaxBreakdown: visual.showTaxBreakdown,
      } as CanvasElement,
    ],
  },
  {
    id: 'bank',
    icon: 'Landmark',
    band: 'totals',
    side: 'left',
    commercial: true,
    build: ({ left, visual }) => {
      const base = visual.baseFontSize;
      const small = lineHeight(base - 1);
      const w = 90;
      const style: ElementStyle = { fontSize: base - 1, color: mutedOf(visual) };
      return [
        labelIf(left, 0, w, small, 'company.iban', pdfText('bankTransfer'), base - 1),
        field(left, small + px(2), w, small, 'company.iban', style, { prefix: 'IBAN: ' }),
        field(left, small * 2 + px(2), w, small, 'company.bankName', style, {
          prefix: `${pdfText('bank')}: `,
        }),
        field(left, small * 3 + px(2), w, small, 'company.bankSwift', style, {
          prefix: 'SWIFT: ',
        }),
      ];
    },
  },
  {
    id: 'recordFields',
    icon: 'List',
    band: 'detail',
    record: true,
    build: ({ left, width }) => [
      rawText(
        left,
        0,
        width,
        20,
        `<table style="width:100%;border-collapse:collapse;line-height:1.4;">{{#each doc.fieldList}}<tr><th scope="row" style="text-align:left;font-weight:700;width:35%;${RECORD_CELL}">{{caption}}</th><td style="white-space:pre-wrap;word-break:break-word;${RECORD_CELL}">{{value}}</td></tr>{{/each}}</table>`,
        { flow: true },
      ),
    ],
  },
  {
    id: 'signature',
    icon: 'PenLine',
    band: 'pageFooter',
    side: 'right',
    build: ({ left, width }) => {
      const w = rightColumn(width);
      return [
        {
          id: genId('signature'),
          kind: 'signature',
          x: round(left + width - w),
          y: 2,
          w: round(w),
          h: 20,
          label: t('templates.blocks.signature'),
        } as CanvasElement,
      ];
    },
  },
  {
    id: 'legal',
    icon: 'Scale',
    band: 'pageFooter',
    build: ({ left, width }) => [
      rawText(
        left,
        2,
        width,
        8,
        '<div style="width:100%;font-size:8pt;line-height:1.4;">{{#each legalTexts}}<p style="margin:0 0 4px;">{{this}}</p>{{/each}}{{#if company.invoiceFooter}}<p style="margin:0;">{{company.invoiceFooter}}</p>{{/if}}</div>',
        { flow: true },
      ),
    ],
  },
];

export const isRecordDocType = (docType: string) => docType.startsWith('pt_');

/** Bloques que tienen sentido en un tipo de documento. */
export function blocksFor(docType: string | undefined): BlockDef[] {
  if (!docType || docType === 'FREE' || docType === 'LABEL') return [];
  const record = isRecordDocType(docType);
  return BLOCKS.filter((block) => (record ? !block.commercial : !block.record));
}

/** Sin saber qué tiene la empresa: lo normal, para no dejar huecos que no hacen falta. */
export const COMPANY_ROWS: CompanyRows = {
  logo: false,
  taxId: true,
  address: true,
  phone: true,
  email: true,
  website: false,
};

export function blockContext(layout: CanvasLayout, docType: string): BlockContext {
  const { width } = resolvePageDimensions(layout);
  return {
    docType,
    left: layout.margins.left,
    width: width - layout.margins.left - layout.margins.right,
    visual: NEUTRAL_VISUAL_OPTIONS,
    company: COMPANY_ROWS,
  };
}

/** Altura mínima que necesita un conjunto de elementos dentro de una banda. */
export function elementsBottom(elements: CanvasElement[]): number {
  const placed = elements.filter((el) => !flowsInBand(el));
  const flowing = elements.filter(flowsInBand).reduce((height, el) => height + el.y + el.h, 0);
  return placed.reduce((bottom, el) => Math.max(bottom, el.y + el.h), flowing);
}

export interface StarterOptions {
  /** Las opciones de la plantilla, si se hizo en el formulario. */
  visual?: VisualOptions | null;
  company?: CompanyRows;
}

/**
 * Pasa al lienzo una plantilla que no se hizo en él, para que se abra como la que se estaba
 * viendo y se cambie lo que no guste. Lo que depende del documento va en flujo, como en el
 * PDF, y de ahí que las bandas apenas tengan alto propio: crecen con lo que llevan.
 */
export function buildStarterLayout(docType: string, options: StarterOptions = {}): CanvasLayout {
  const visual = options.visual ?? NEUTRAL_VISUAL_OPTIONS;
  const neutral = isNeutral(visual);
  const layout = createEmptyLayout();
  layout.margins = MARGINS[visual.margins];
  if (visual.pageSize === 'Letter') layout.pageSize = 'Letter';
  layout.fontFamily = neutral ? neutralFontStack(visual.fontFamily) : FONT_STACK[visual.fontFamily];
  layout.lineHeight = 1.4;
  if (neutral) layout.style = 'neutral';
  if (neutral && !isMonochrome(visual)) {
    layout.documentColors = {
      accent: visual.accentColor,
      ink: visual.headerBgColor,
      text: visual.textColor,
      muted: visual.mutedColor,
    };
  }
  if (visual.footer.showPageNumbers) {
    layout.pageNumbers = { enabled: true, alignment: visual.footer.alignment };
  }
  if (visual.showDocQr) layout.showDocQr = true;
  if (visual.showDocBarcode) layout.showDocBarcode = true;
  if (visual.watermark.enabled) layout.watermark = { ...visual.watermark };

  const { width: pageWidth } = resolvePageDimensions(layout);
  const { left: leftMargin, right, top } = layout.margins;
  const ctx: BlockContext = {
    docType,
    left: leftMargin,
    width: pageWidth - leftMargin - right,
    visual,
    company: options.company ?? COMPANY_ROWS,
  };
  const built = (id: string) => BLOCKS.find((block) => block.id === id)?.build(ctx) ?? [];
  const fill = (kind: BandKind, elements: CanvasElement[], height = 1) => {
    const band = layout.bands.find((b) => b.kind === kind);
    if (!band) return;
    band.elements = elements;
    band.height = round(height);
  };
  const record = isRecordDocType(docType);

  const header = [...built('company'), ...built(record ? 'recordInfo' : 'docInfo')].map((el) => ({
    ...el,
    y: round(el.y + top),
  }));
  // El documento de origen casi nunca está: si sale, cabe en el aire de encima de la línea.
  const ruleY =
    elementsBottom(header.filter((el) => (el as FieldElement).path !== 'doc.baseDocCode')) + px(10);
  const rule = {
    id: genId('shape'),
    kind: 'shape',
    shape: 'line',
    x: ctx.left,
    y: round(ruleY),
    w: ctx.width,
    h: round(px(1)),
    style: { borderWidth: 1, borderStyle: 'solid', borderColor: accentOf(visual) ?? '#000' },
  } as CanvasElement;
  fill('pageHeader', [...header, rule], ruleY + px(1) + px(18));

  const closing = rawText(ctx.left, 0, ctx.width, 8, closingHtml(visual), { flow: true });
  if (record) {
    layout.bands = layout.bands.filter((b) => b.kind !== 'docHeader' && b.kind !== 'totals');
    fill('detail', built('recordFields'));
    fill('pageFooter', [closing]);
    return layout;
  }

  fill('docHeader', [...built('partner'), ...built('shipTo')]);
  fill('detail', built('lines'));
  fill('totals', built('totals'));
  fill('pageFooter', [closing]);
  return layout;
}
