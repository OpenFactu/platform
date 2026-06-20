/**
 * Compilador CanvasLayout → HTML + Handlebars.
 *
 * La salida es una plantilla HTML completa, compatible con el pipeline actual
 * de @openfactu/pdf (que espera HTML con expresiones Handlebars sobre el
 * DocumentPdfPayload estándar: `doc`, `company`, `partner`, `lines`...).
 *
 * El compilador es puro (string in → string out). No depende del DOM, de
 * React ni de acceso a red — testeable con snapshots.
 *
 * Notas de alcance (MVP):
 * - Las bandas se emiten linealmente (pageHeader, docHeader, detail, totals,
 *   pageFooter). El docHeader/detail/totals/pageFooter aparecen una sola vez.
 *   Puppeteer pagina automáticamente el contenido. Repetición estricta de
 *   pageHeader/pageFooter por página queda fuera de esta fase.
 * - QR y barcode emiten llamadas a helpers Handlebars `qrCode` y `barcode`
 *   que aún no existen en @openfactu/pdf. Hasta que se añadan allí, esos
 *   elementos renderizan vacío. No rompen el pipeline.
 */

import {
  resolvePageDimensions,
  type CanvasLayout,
  type Band,
  type CanvasElement,
  type ElementStyle,
  type LinesTableElement,
  type TotalsElement,
  type FieldElement,
  type TextElement,
  type ImageElement,
  type ShapeElement,
  type QRElement,
  type BarcodeElement,
  type LinesTableColumn,
  type ConditionalElement,
  type SignatureElement,
  type PageBreakElement,
  type DividerElement,
  type SummaryElement,
  type BoxElement,
  type ListElement,
  type CurrentDateElement,
} from './types';

export interface CompileOptions {
  /** Código del tipo de documento (SINV, PINV, ...). Se inyecta en el title. */
  docType?: string;
  /** CSS adicional para casos avanzados (normalmente no hace falta). */
  extraCss?: string;
}

export function compileCanvas(layout: CanvasLayout, options: CompileOptions = {}): string {
  const { docType = '', extraCss = '' } = options;

  const metaComment = buildMetaComment(layout);
  const pageCss = buildPageCss(layout);
  // Posicionamos cada banda absolutamente con un `top` acumulado para que:
  // 1) no haya gaps entre bloques (evita la página en blanco que aparece
  //    cuando el flujo en bloque sobrepasa la altura de página por milímetros);
  // 2) el tamaño final del body sea exactamente la suma de alturas de las
  //    bandas, sin líneas base ni colapsos de margen imprevistos.
  let cursor = 0;
  const bandsHtml = layout.bands
    // Las bandas ocultas no se emiten NI acumulan altura (si acumularan, dejarían
    // un hueco vertical y desplazarían todo lo que va debajo).
    .filter((b) => !b.hidden)
    .map((b) => {
      const html = renderBand(b, cursor);
      cursor += b.height;
      return html;
    })
    .join('\n');
  const totalHeightMm = cursor;

  const watermarkHtml = renderWatermark(layout);

  return `<!DOCTYPE html>
${metaComment}
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(docType)} {{doc.docCode}}</title>
<style>
${pageCss}
${BASE_CSS}
.page-root { position: relative; width: 100%; height: ${totalHeightMm}mm; overflow: hidden; }
.watermark {
  position: absolute;
  left: 50%;
  top: 50%;
  transform-origin: center center;
  pointer-events: none;
  user-select: none;
  white-space: nowrap;
  z-index: 0;
}
.band { z-index: 1; }
${extraCss}
</style>
</head>
<body>
<div class="page-root">
${watermarkHtml}
${bandsHtml}
</div>
</body>
</html>`;
}

function renderWatermark(layout: CanvasLayout): string {
  const w = layout.watermark;
  if (!w || !w.enabled || !w.text) return '';
  const color = w.color ?? '#94a3b8';
  const opacity = typeof w.opacity === 'number' ? Math.max(0, Math.min(1, w.opacity)) : 0.15;
  const rotation = typeof w.rotation === 'number' ? w.rotation : -30;
  const fontSize = typeof w.fontSize === 'number' ? w.fontSize : 84;
  const fontWeight = w.fontWeight ?? 'bold';
  // `text` se emite en crudo para permitir expresiones tipo `{{doc.status}}`.
  // Quien configure la plantilla controla su contenido — es entrada de confianza.
  return `<div class="watermark" style="color:${color};opacity:${opacity};font-size:${fontSize}pt;font-weight:${fontWeight};transform:translate(-50%,-50%) rotate(${rotation}deg);">${w.text}</div>`;
}

// ---------- bandas y elementos ----------

function renderBand(band: Band, topMm: number): string {
  const inner = band.elements
    .filter((el) => !el.hidden)
    .map((el) => renderElement(el))
    .join('\n');
  return `<section class="band band-${band.kind}" data-band="${band.kind}" style="position:absolute;left:0;right:0;top:${topMm}mm;height:${band.height}mm;">
${inner}
</section>`;
}

function renderElement(el: CanvasElement): string {
  switch (el.kind) {
    case 'text':
      return renderText(el);
    case 'image':
      return renderImage(el);
    case 'shape':
      return renderShape(el);
    case 'spacer':
      return renderSpacer(el);
    case 'field':
      return renderField(el);
    case 'linesTable':
      return renderLinesTable(el);
    case 'totals':
      return renderTotals(el);
    case 'qr':
      return renderQR(el);
    case 'barcode':
      return renderBarcode(el);
    case 'conditional':
      return renderConditional(el);
    case 'signature':
      return renderSignature(el);
    case 'pageBreak':
      return renderPageBreak(el);
    case 'divider':
      return renderDivider(el);
    case 'summary':
      return renderSummary(el);
    case 'box':
      return renderBox(el);
    case 'list':
      return renderList(el);
    case 'currentDate':
      return renderCurrentDate(el);
  }
}

function renderSignature(el: SignatureElement): string {
  const label = escapeHtml(el.label || 'Firma');
  const borderColor = el.style?.borderColor ?? '#334155';
  const color = el.style?.color ?? '#334155';
  const fontSize = el.style?.fontSize ?? 9;
  return `<div class="${elClass('signature', el)}" style="${positionStyle(el)}display:flex;flex-direction:column;justify-content:flex-end;${elExtra(el)}">
<div style="flex:1;border-bottom:1px solid ${borderColor};"></div>
<div style="text-align:center;font-size:${fontSize}pt;color:${color};padding-top:2mm;">${label}</div>
</div>`;
}

function renderPageBreak(el: PageBreakElement): string {
  // `page-break-before: always` funciona incluso dentro de contenedores con
  // overflow hidden cuando Puppeteer está generando el PDF. Ocupa 0px de alto
  // visualmente en el flujo — sólo sirve como marcador de salto.
  return `<div class="${elClass('pageBreak', el)}" style="${positionStyle(el)}page-break-before:always;break-before:page;${elExtra(el)}"></div>`;
}

function renderConditional(el: ConditionalElement): string {
  const path = sanitizePath(el.path);
  // Construye la expresión de condición según el operador. Para comparaciones
  // usamos los helpers registrados (`eq`, `gt`, `lt`, `neq`). Para truthy/falsy
  // tiramos directamente del valor (Handlebars interpreta null/false/0/""/[] como falsy).
  let cond: string;
  switch (el.operator) {
    case 'truthy':
      cond = path;
      break;
    case 'falsy':
      // Invertimos con `unless` más abajo.
      cond = path;
      break;
    case 'eq':
    case 'neq':
    case 'gt':
    case 'lt': {
      const raw = el.value ?? '';
      // Si parece un path (identificador con puntos) lo pasamos como expresión;
      // si no, lo tratamos como literal numérico o string entre comillas.
      const isPathLike = /^[a-zA-Z_][\w.]*$/.test(raw);
      const isNumeric = !isPathLike && /^-?\d+(\.\d+)?$/.test(raw);
      const arg = isPathLike ? raw : isNumeric ? raw : `"${raw.replace(/"/g, '\\"')}"`;
      cond = `(${el.operator} ${path} ${arg})`;
      break;
    }
  }

  const openBlock = el.operator === 'falsy' ? `{{#unless ${cond}}}` : `{{#if ${cond}}}`;
  const closeBlock = el.operator === 'falsy' ? `{{/unless}}` : `{{/if}}`;
  const elseBlock = el.elseText && el.elseText.length > 0 ? `{{else}}${el.elseText}` : '';

  return `<div class="${elClass('conditional', el)}" style="${positionStyle(el)}${styleToCss(el.style)}${elExtra(el)}">${openBlock}${el.thenText}${elseBlock}${closeBlock}</div>`;
}

function renderText(el: TextElement): string {
  // Tres modos:
  //  - `raw`: Handlebars arbitrario, emitido sin escapar.
  //  - `rich`: HTML del editor de texto rico (b/i/u/s/span con color/bg),
  //     emitido tal cual.
  //  - default: texto plano. Escapamos HTML y conservamos saltos de línea
  //     transformándolos a <br/> para que el render PDF respete el salto.
  let content: string;
  if (el.raw) {
    content = el.text;
  } else if (el.rich) {
    content = el.text;
  } else {
    content = escapeHtml(el.text).replace(/\n/g, '<br/>');
  }
  return `<div class="${elClass('text', el)}" style="${positionStyle(el)}${textBoxStyle(el)}${elExtra(el)}">${content}</div>`;
}

function renderImage(el: ImageElement): string {
  const fit = el.fit ?? 'contain';
  return `<div class="${elClass('image', el)}" style="${positionStyle(el)}${elExtra(el)}">
<img src="${escapeAttr(el.src)}" style="width:100%;height:100%;object-fit:${fit};" />
</div>`;
}

function renderShape(el: ShapeElement): string {
  const style = el.style ?? {};
  const borderColor = style.borderColor ?? '#000';
  const borderWidth = style.borderWidth ?? 1;
  if (el.shape === 'line') {
    return `<div class="${elClass('shape', el)}" style="${positionStyle(el)}border-top:${borderWidth}px ${style.borderStyle ?? 'solid'} ${borderColor};${elExtra(el)}"></div>`;
  }
  return `<div class="${elClass('shape', el)}" style="${positionStyle(el)}border:${borderWidth}px ${style.borderStyle ?? 'solid'} ${borderColor};background:${style.backgroundColor ?? 'transparent'};${elExtra(el)}"></div>`;
}

function renderSpacer(el: { id: string } & CanvasElement): string {
  return `<div class="${elClass('spacer', el)}" data-id="${el.id}" style="${positionStyle(el as any)}${elExtra(el)}"></div>`;
}

function renderField(el: FieldElement): string {
  const expr = buildFieldExpression(el.path, el.format);
  // Cuando el campo está en modo `rich`, el prefijo/sufijo ya son HTML
  // producidos por el editor de texto rico → se emiten sin escapar.
  const prefix = el.prefix ? (el.rich ? el.prefix : escapeHtml(el.prefix)) : '';
  const suffix = el.suffix ? (el.rich ? el.suffix : escapeHtml(el.suffix)) : '';
  return `<div class="${elClass('field', el)}" style="${positionStyle(el)}${textBoxStyle(el)}${elExtra(el)}">${prefix}${expr}${suffix}</div>`;
}

function renderLinesTable(el: LinesTableElement): string {
  const cols = normalizeColumnWidths(el.columns);
  // Fuente de iteración: `lines` (default) o una query SQL (source = 'query:NOMBRE').
  const iter =
    el.source && el.source.startsWith('query:')
      ? `queries.${sanitizePath(el.source.slice('query:'.length))}`
      : 'lines';

  const wrapperStyle = `${positionStyle(el)}${styleToCss(el.style)}${elExtra(el)}`;

  // ----- Layout clave-valor: lista vertical etiqueta:valor (una agrupación por línea) -----
  if (el.layout === 'keyValue') {
    const kvRows = cols
      .map(
        (c) =>
          `<div class="kv-row"><span class="kv-label">${escapeHtml(c.label)}</span><span class="kv-value" style="text-align:${c.align ?? 'right'};${styleToCss(c.style)}">${buildFieldExpression(c.path, c.format)}</span></div>`,
      )
      .join('');
    return `<div class="${elClass('linesTable', el)}" style="${wrapperStyle}">
{{#each ${iter}}}
<div class="kv-group">${kvRows}</div>
{{/each}}
{{#unless ${iter}.length}}
<div class="lines-empty">Sin líneas</div>
{{/unless}}
</div>`;
  }

  // ----- Tabla clásica con preset visual -----
  const preset = el.tableStyle ?? 'default';
  // Overrides por instancia como CSS vars en la <table>; heredan a th/td.
  const vars = [
    el.headerBg ? `--lt-header-bg:${cssColor(el.headerBg)};` : '',
    el.cellPadding != null ? `--lt-cell-pad:${Number(el.cellPadding)}px;` : '',
    el.borderColor ? `--lt-border:${cssColor(el.borderColor)};` : '',
  ].join('');

  const header =
    el.showHeader === false
      ? ''
      : `<thead><tr>${cols
          .map((c) => {
            const hs = styleToCss(c.headerStyle ?? c.style);
            return `<th style="width:${c.widthPct}%;text-align:${c.align ?? 'left'};${hs}">${escapeHtml(c.label)}</th>`;
          })
          .join('')}</tr></thead>`;

  const bodyCells = cols
    .map(
      (c) =>
        `<td style="text-align:${c.align ?? 'left'};${styleToCss(c.style)}">${buildFieldExpression(c.path, c.format)}</td>`,
    )
    .join('');

  return `<div class="${elClass('linesTable', el)}" style="${wrapperStyle}">
<table class="lines-table lines-table--${preset}"${vars ? ` style="${vars}"` : ''}>
${header}
<tbody>
{{#each ${iter}}}
<tr>${bodyCells}</tr>
{{/each}}
{{#unless ${iter}.length}}
<tr><td colspan="${cols.length}" class="lines-empty">Sin líneas</td></tr>
{{/unless}}
</tbody>
</table>
</div>`;
}

function renderTotals(el: TotalsElement): string {
  const showSubtotal = el.showSubtotal !== false;
  const showTax = el.showTaxBreakdown !== false;
  const showTotal = el.showTotal !== false;

  const rows: string[] = [];
  if (showSubtotal) {
    rows.push(
      `<div class="totals-row"><span class="totals-label">Subtotal</span><span class="totals-value">{{formatCurrency doc.subtotal}}</span></div>`,
    );
  }
  if (showTax) {
    rows.push(
      `{{#each doc.taxBreakdown}}<div class="totals-row"><span class="totals-label">IVA {{rate}}%</span><span class="totals-value">{{formatCurrency amount}}</span></div>{{/each}}`,
    );
  }
  if (showTotal) {
    rows.push(
      `<div class="totals-row totals-row-grand"><span class="totals-label">Total</span><span class="totals-value">{{formatCurrency doc.total}}</span></div>`,
    );
  }

  return `<div class="${elClass('totals', el)}" style="${positionStyle(el)}${styleToCss(el.style)}${elExtra(el)}">
${rows.join('\n')}
</div>`;
}

function renderQR(el: QRElement): string {
  const scale = el.scale ?? 4;
  // El helper `qrCode` se registra en el servidor (registerCanvasHelpers, con la
  // librería `qrcode`) y devuelve un data URI SVG. Aquí solo emitimos la llamada.
  return `<div class="${elClass('qr', el)}" style="${positionStyle(el)}${elExtra(el)}">
<img src="{{{qrCode ${asLiteralOrExpr(el.value)} scale=${scale}}}}" style="width:100%;height:100%;object-fit:contain;" />
</div>`;
}

function renderBarcode(el: BarcodeElement): string {
  // Los helpers `barcode`/`qrCode` se registran en el servidor (registerCanvasHelpers,
  // con bwip-js/qrcode) y devuelven un data URI SVG. Aquí solo emitimos la llamada.
  return `<div class="${elClass('barcode', el)}" style="${positionStyle(el)}${elExtra(el)}">
<img src="{{{barcode ${asLiteralOrExpr(el.value)} symbology="${el.symbology}" includeText=${el.includeText ? 'true' : 'false'}}}}" style="width:100%;height:100%;object-fit:contain;" />
</div>`;
}

/** Resuelve la colección a iterar/agregar: `lines` (default) o `queries.NOMBRE`. */
function iterSource(source?: string): string {
  return source && source.startsWith('query:')
    ? `queries.${sanitizePath(source.slice('query:'.length))}`
    : 'lines';
}

function renderDivider(el: DividerElement): string {
  const s = el.style ?? {};
  const w = s.borderWidth ?? 1;
  const color = s.borderColor ?? '#94a3b8';
  const lineStyle = s.borderStyle && s.borderStyle !== 'none' ? s.borderStyle : 'solid';
  // Horizontal → línea a media altura (border-top sobre un div que ocupa el alto);
  // vertical → border-left. Usamos un hijo centrado para que la línea quede en medio.
  const side = el.orientation === 'vertical' ? 'border-left' : 'border-top';
  const inner =
    el.orientation === 'vertical'
      ? `height:100%;width:0;margin:0 auto;${side}:${w}px ${lineStyle} ${color};`
      : `width:100%;height:0;${side}:${w}px ${lineStyle} ${color};`;
  return `<div class="${elClass('divider', el)}" style="${positionStyle(el)}display:flex;align-items:center;justify-content:center;${elExtra(el)}"><div style="${inner}"></div></div>`;
}

function renderSummary(el: SummaryElement): string {
  const iter = iterSource(el.source);
  // Subexpresión del agregado. `count` no usa path.
  const agg =
    el.op === 'count'
      ? `(count ${iter})`
      : `(${el.op} ${iter} "${sanitizePath(el.path ?? '')}")`;
  // Envolvemos con el helper de formato si corresponde (reutilizando los mismos
  // helpers que buildFieldExpression: formatCurrency/formatNumber/formatDate...).
  let expr: string;
  switch (el.format) {
    case 'currency':
      expr = `{{formatCurrency ${agg}}}`;
      break;
    case 'number':
      expr = `{{formatNumber ${agg}}}`;
      break;
    case 'percent':
      expr = `{{formatNumber ${agg}}}%`;
      break;
    case 'date':
      expr = `{{formatDate ${agg}}}`;
      break;
    default:
      expr = `{{${agg.slice(1, -1)}}}`; // {{op iter "path"}} sin doble paréntesis
  }
  const prefix = el.prefix ? escapeHtml(el.prefix) : '';
  const suffix = el.suffix ? escapeHtml(el.suffix) : '';
  return `<div class="${elClass('summary', el)}" style="${positionStyle(el)}${textBoxStyle(el)}${elExtra(el)}">${prefix}${expr}${suffix}</div>`;
}

function renderBox(el: BoxElement): string {
  // Marco visual: el fondo/borde/radio salen de styleToCss (que ya emite border-radius).
  return `<div class="${elClass('box', el)}" style="${positionStyle(el)}${styleToCss(el.style)}${elExtra(el)}"></div>`;
}

function renderList(el: ListElement): string {
  const iter = iterSource(el.source);
  const tag = el.ordered ? 'ol' : 'ul';
  const listStyle =
    el.marker === 'none' ? 'none' : el.marker === 'number' || el.ordered ? 'decimal' : 'disc';
  const itemExpr = el.itemPath ? `{{${sanitizePath(el.itemPath)}}}` : '{{this}}';
  return `<div class="${elClass('list', el)}" style="${positionStyle(el)}${styleToCss(el.style)}${elExtra(el)}">
<${tag} style="margin:0;padding-left:1.2em;list-style:${listStyle};">
{{#each ${iter}}}<li>${itemExpr}</li>{{/each}}
{{#unless ${iter}.length}}<li style="list-style:none;color:#94a3b8;font-style:italic;">Sin datos</li>{{/unless}}
</${tag}>
</div>`;
}

function renderCurrentDate(el: CurrentDateElement): string {
  const expr = el.mode === 'datetime' ? `{{generatedAt}}` : `{{today}}`;
  const prefix = el.prefix ? escapeHtml(el.prefix) : '';
  return `<div class="${elClass('currentDate', el)}" style="${positionStyle(el)}${textBoxStyle(el)}${elExtra(el)}">${prefix}${expr}</div>`;
}

// ---------- helpers de estilo ----------

function positionStyle(el: { x: number; y: number; w: number; h: number }): string {
  return `position:absolute;left:${el.x}mm;top:${el.y}mm;width:${el.w}mm;height:${el.h}mm;`;
}

/** Clase CSS del nodo raíz de un elemento, incluyendo su `className` opcional. */
function elClass(kind: string, el: { className?: string }): string {
  // Sanitizamos para no romper el atributo class (comillas/ángulos).
  const extra = el.className ? ` ${el.className.replace(/["'<>]/g, '').trim()}` : '';
  return `el el-${kind}${extra}`;
}

/** Declaraciones CSS inline extra de un elemento, listas para anexar al `style`. */
function elExtra(el: { customCss?: string }): string {
  if (!el.customCss) return '';
  // Son declaraciones, no reglas. Quitamos comillas/ángulos que romperían el
  // atributo style y garantizamos el `;` final.
  const css = el.customCss.replace(/["<>]/g, '').trim();
  if (!css) return '';
  return css.endsWith(';') ? css : `${css};`;
}

/** Sanea un valor de color para incrustarlo en un atributo style. */
function cssColor(c: string): string {
  return c.replace(/[^#\w(),.%\s-]/g, '');
}

function styleToCss(style?: ElementStyle): string {
  if (!style) return '';
  const parts: string[] = [];
  if (style.fontFamily) parts.push(`font-family:${style.fontFamily};`);
  if (style.fontSize != null) parts.push(`font-size:${style.fontSize}pt;`);
  if (style.fontWeight) parts.push(`font-weight:${style.fontWeight};`);
  if (style.fontStyle) parts.push(`font-style:${style.fontStyle};`);
  if (style.color) parts.push(`color:${style.color};`);
  if (style.backgroundColor) parts.push(`background-color:${style.backgroundColor};`);
  if (style.textAlign) parts.push(`text-align:${style.textAlign};`);
  if (style.padding != null) parts.push(`padding:${style.padding}px;`);
  // Solo emitimos borde si hay un estilo de línea real, igual que el preview del
  // canvas. Antes bastaba con que `borderColor`/`borderWidth` estuvieran puestos
  // (con `borderStyle ?? 'solid'`), por lo que aparecía un borde en el PDF que en
  // el editor no se veía (p.ej. al tocar solo el color de borde).
  if (style.borderStyle && style.borderStyle !== 'none') {
    parts.push(
      `border:${style.borderWidth ?? 1}px ${style.borderStyle} ${style.borderColor ?? '#000'};`,
    );
  }
  if (style.borderRadius != null) parts.push(`border-radius:${style.borderRadius}px;`);
  return parts.join('');
}

/**
 * Estilo de "caja de texto" que replica el preview del canvas (`ElementPreview`):
 * flexbox con centrado vertical y `justify-content` según `textAlign`, más los
 * defaults de tamaño (10pt) y padding (2px). Así el texto/campo/resumen/fecha se
 * ve igual en el editor y en el PDF (incluida la alineación del texto rico).
 */
function textBoxStyle(el: { style?: ElementStyle }): string {
  const a = el.style?.textAlign;
  const justify = a === 'center' ? 'center' : a === 'right' ? 'flex-end' : 'flex-start';
  const fs = el.style?.fontSize ? '' : 'font-size:10pt;';
  const pad = el.style?.padding != null ? '' : 'padding:2px;';
  return `display:flex;align-items:center;justify-content:${justify};${fs}${pad}${styleToCss(el.style)}`;
}

function buildPageCss(layout: CanvasLayout): string {
  // El diseñador trabaja en coordenadas absolutas sobre la página completa.
  // Emitimos @page con margen 0 para que los x/y de los elementos se apliquen
  // directamente sobre la página sin un área imprimible reducida. Los
  // `layout.margins` se usan sólo como guía visual dentro del diseñador.
  //
  // Excepción: si hay números de página, Puppeteer los renderiza en el
  // margen inferior de la página — si éste es 0 quedan invisibles. Reservamos
  // 12mm en el `bottom` para el pie del renderer.
  //
  // Tamaño: para A4/Letter usamos el keyword CSS estándar. Para tiquets,
  // etiquetas y `Custom` emitimos las dimensiones explícitas en mm — Puppeteer
  // las respeta gracias a `preferCSSPageSize: true` en PdfRenderer.
  const bottom = layout.pageNumbers?.enabled ? 12 : 0;
  const sizeCss =
    layout.pageSize === 'A4' || layout.pageSize === 'Letter'
      ? layout.pageSize
      : (() => {
          const { width, height } = resolvePageDimensions(layout);
          return `${width}mm ${height}mm`;
        })();
  return `@page { size: ${sizeCss}; margin: 0 0 ${bottom}mm 0; }
body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }`;
}

/**
 * Emite el comentario OPENFACTU-META que consume el PdfRenderer del paquete
 * @openfactu/pdf. Solo incluimos las claves que realmente usamos desde el
 * diseñador; el resto hereda de DEFAULT_VISUAL_OPTIONS por merge en el
 * servidor. Si no hay config relevante, se omite.
 */
function buildMetaComment(layout: CanvasLayout): string {
  const footerOverrides: Record<string, unknown> = {};
  if (layout.pageNumbers?.enabled) {
    footerOverrides.showPageNumbers = true;
    if (layout.pageNumbers.alignment) {
      footerOverrides.alignment = layout.pageNumbers.alignment;
    }
  }
  if (Object.keys(footerOverrides).length === 0) return '';
  // Solo incluimos `pageSize` en el meta si es uno de los formatos estándar
  // que entiende el PdfRenderer (A4/Letter). Para tiquets, etiquetas y Custom
  // confiamos en el @page CSS emitido por buildPageCss + preferCSSPageSize.
  const meta: Record<string, unknown> = { footer: footerOverrides };
  if (layout.pageSize === 'A4' || layout.pageSize === 'Letter') {
    meta.pageSize = layout.pageSize;
  }
  return `<!--OPENFACTU-META:${JSON.stringify(meta)}-->`;
}

const BASE_CSS = `.band { position: relative; width: 100%; overflow: hidden; }
.el { box-sizing: border-box; overflow: hidden; }
.lines-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.lines-table th, .lines-table td { padding: var(--lt-cell-pad, 4px 6px); border-bottom: 1px solid var(--lt-border, #e5e7eb); font-size: 9pt; }
.lines-table th { background: var(--lt-header-bg, #f1f5f9); font-weight: 600; }
.lines-table--bordered, .lines-table--bordered th, .lines-table--bordered td { border: 1px solid var(--lt-border, #cbd5e1); }
.lines-table--striped tbody tr:nth-child(even) { background: #f8fafc; }
.lines-table--compact th, .lines-table--compact td { padding: var(--lt-cell-pad, 1px 4px); font-size: 8pt; }
.lines-table--borderless th, .lines-table--borderless td { border: none; }
.lines-empty { text-align: center; color: #94a3b8; font-style: italic; }
.kv-group { margin-bottom: 4px; }
.kv-row { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; font-size: 9pt; }
.kv-label { color: #64748b; font-weight: 600; }
.kv-value { font-variant-numeric: tabular-nums; }
.totals-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 10pt; }
.totals-row-grand { border-top: 1px solid #000; font-weight: 700; font-size: 11pt; }`;

// ---------- helpers de expresión ----------

/**
 * Convierte un path como "doc.docCode" en `{{doc.docCode}}`. Si hay `format`,
 * envuelve con el helper correspondiente (que existe en @openfactu/pdf).
 */
function buildFieldExpression(path: string, format?: FieldElement['format']): string {
  const safePath = sanitizePath(path);
  if (!format) return `{{${safePath}}}`;
  switch (format) {
    case 'currency':
      return `{{formatCurrency ${safePath}}}`;
    case 'number':
      return `{{formatNumber ${safePath}}}`;
    case 'date':
      return `{{formatDate ${safePath}}}`;
    case 'percent':
      return `{{formatNumber ${safePath}}}%`;
    case 'address':
      // Triple-brace para preservar los saltos de línea (`<br/>`) que emite
      // el helper al formatear una dirección multilínea.
      return `{{{formatAddress ${safePath}}}}`;
  }
}

/** Si `value` es un path limpio lo devuelve como expresión Handlebars; si no, como literal entre comillas. */
function asLiteralOrExpr(value: string): string {
  if (/^[a-zA-Z_][\w.]*$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

function sanitizePath(path: string): string {
  // Permitimos letras, dígitos, punto y underscore. Cualquier otra cosa se cae
  // silenciosamente para evitar que un path malformado rompa la plantilla.
  return path.replace(/[^\w.]/g, '');
}

// ---------- escaping ----------

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function normalizeColumnWidths(columns: LinesTableColumn[]): LinesTableColumn[] {
  const total = columns.reduce((acc, c) => acc + c.widthPct, 0);
  if (total === 0) {
    const even = 100 / Math.max(columns.length, 1);
    return columns.map((c) => ({ ...c, widthPct: even }));
  }
  if (Math.abs(total - 100) < 0.01) return columns;
  const scale = 100 / total;
  return columns.map((c) => ({ ...c, widthPct: c.widthPct * scale }));
}
