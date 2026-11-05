/**
 * El papel del lienzo pinta el mismo HTML que el PDF: sale de `compileCanvas` y lo resuelve
 * el servidor con los mismos datos y helpers. Aquí solo se adapta a ir por elementos sueltos.
 */
import {
  compileElement,
  compileWatermark,
  documentColorsCss,
  ELEMENT_CSS,
  PAPER_FONT,
} from '../components/canvas/compileCanvas';
import type { CanvasElement, CanvasLayout } from '../components/canvas/types';
import { fieldName } from './fieldNames';

export const WATERMARK_KEY = '__watermark';
export const DOC_FOOTER_KEY = '__docFooter';

/** El pie con códigos que el PDF añade a cada hoja si se activa en la página. */
const DOC_FOOTER = `<div style="position:absolute;left:0;right:0;bottom:0;padding:0 10mm 9.6mm;box-sizing:border-box;font-family:'JetBrains Mono','SFMono-Regular',Menlo,monospace;font-size:7pt;color:#64748B;letter-spacing:.3px;">
<div style="display:flex;align-items:center;gap:10px;border-top:1px solid #E2E8F0;padding-top:4mm;">
<img src="{{#if qrPayload}}{{{qrCode qrPayload}}}{{else}}{{{qrCode doc.docCode}}}{{/if}}" style="width:26px;height:26px;display:block;flex-shrink:0;" />
<img src="{{{barcode doc.docCode symbology="code128"}}}" style="height:22px;width:140px;object-fit:fill;display:block;flex-shrink:0;" />
<span style="flex:1;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase;">{{doc.docCode}} · {{#if docHash}}Hash&nbsp;{{docHash}} · {{/if}}{{generatedAt}} · {{label "page"}}&nbsp;1/1</span>
</div>
</div>`;

/**
 * Las reglas del PDF, aisladas de las de la aplicación, que cambiarían tipografía y medidas.
 * La posición y el tamaño de cada elemento los da su caja en el lienzo.
 */
export const PAPER_CSS = `:host { all: initial; display: block; position: relative; color: #000; font-family: ${PAPER_FONT}; text-rendering: geometricPrecision; }
${ELEMENT_CSS}
.el { left: 0; top: 0; width: 100% !important; }
.el:not(.el-linesTable):not(.el-flow) { height: 100% !important; }`;

/** Lo que el documento define para todo el papel: su tipografía, sus colores y su CSS. */
export function paperExtraCss(layout: CanvasLayout): string {
  const font = layout.fontFamily ? `font-family: ${layout.fontFamily};` : '';
  const height = layout.lineHeight ? `line-height: ${layout.lineHeight};` : '';
  return `:host { ${font} ${height} ${documentColorsCss(layout)} }\n${layout.customCss ?? ''}`;
}

/** Sin datos de ejemplo: el nombre de cada campo en lugar de su valor. */
export function withFieldNames(source: string): string {
  return source
    .replace(/\{\{#unless\b[^}]*\}\}[\s\S]*?\{\{\/unless\}\}/g, '')
    .replace(/\{\{else\}\}[\s\S]*?(?=\{\{\/if\}\})/g, '')
    .replace(/\{\{[#/](?:each|if)\b[^}]*\}\}/g, '')
    .replace(/\{\{\{(barcode|qrCode)\s+(?:"[^"]*"|[\w.]+)/g, '{{{$1 "123456789012"')
    .replace(/src="\{\{\{?\s*[\w.]+\s*\}\}\}?"/g, 'src=""')
    .replace(
      /\{\{\{?\s*(?:format\w+\s+)?([a-zA-Z_][\w.]*)(?:\s+\d+)?\s*\}\}\}?/g,
      (_, path) => `[${fieldName(path)}]`,
    );
}

/** Qué hay que resolver para pintar el papel, por elemento. */
export function paperSources(layout: CanvasLayout, showData: boolean): Map<string, string> {
  const finish = (source: string) => (showData ? source : withFieldNames(source));
  const sources = new Map<string, string>();
  for (const band of layout.bands) {
    for (const element of band.elements) {
      sources.set(element.id, finish(compileElement(element)));
    }
  }
  const watermark = compileWatermark(layout);
  if (watermark) sources.set(WATERMARK_KEY, finish(watermark));
  if (layout.showDocQr || layout.showDocBarcode) sources.set(DOC_FOOTER_KEY, finish(DOC_FOOTER));
  return sources;
}

const ALWAYS_PAINTS: CanvasElement['kind'][] = [
  'shape',
  'divider',
  'signature',
  'qr',
  'barcode',
  'linesTable',
  'totals',
  'image',
];

/** Si con estos datos no se vería nada: en el PDF queda en blanco y aquí se señala dónde está. */
export function rendersNothing(element: CanvasElement, html: string): boolean {
  if (ALWAYS_PAINTS.includes(element.kind)) return false;
  const style = element.style ?? {};
  if (style.backgroundColor || (style.borderStyle && style.borderStyle !== 'none')) return false;
  const template = document.createElement('template');
  template.innerHTML = html;
  return !template.content.textContent?.trim() && !template.content.querySelector('img,svg,table');
}

/**
 * En el servidor, el HTML de una plantilla o el valor de un campo no pueden hacer nada; en
 * el navegador de quien diseña sí, así que aquí se le quita lo que podría ejecutarse.
 */
export function sanitizedFragment(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  const { content } = template;
  content.querySelectorAll('script,iframe,object,embed,link,meta,base,form').forEach((node) => {
    node.remove();
  });
  content.querySelectorAll('*').forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      if (/^on/i.test(attribute.name) || /^\s*javascript:/i.test(attribute.value)) {
        node.removeAttribute(attribute.name);
      }
    }
  });
  return content;
}
