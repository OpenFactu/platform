import type { CanvasElement, ElementKind } from '../components/canvas/types';

let nextId = 1;
export const genId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${nextId++}`;

/** Clona un elemento con un id nuevo (deep-clone para arrays como columns). */
export function cloneElement(el: CanvasElement, dx = 5, dy = 5): CanvasElement {
  const copy = JSON.parse(JSON.stringify(el)) as CanvasElement;
  copy.id = genId(el.kind);
  copy.x = Math.max(0, el.x + dx);
  copy.y = Math.max(0, el.y + dy);
  return copy;
}

/** Valores con los que nace cada tipo de elemento. */
export function buildDefaultElement(
  kind: ElementKind,
  x: number,
  y: number,
  w: number,
  h: number,
): CanvasElement {
  const base = { id: genId(kind), x, y, w, h };
  switch (kind) {
    case 'text':
      return { ...base, kind, text: 'Texto' };
    case 'image':
      return { ...base, kind, src: '', fit: 'contain' };
    case 'shape':
      return { ...base, kind, shape: 'line' };
    case 'spacer':
      return { ...base, kind };
    case 'field':
      return { ...base, kind, path: 'doc.docCode' };
    case 'linesTable':
      return {
        ...base,
        kind,
        columns: [
          { id: genId('col'), label: 'Artículo', path: 'itemName', widthPct: 50, align: 'left' },
          {
            id: genId('col'),
            label: 'Cant.',
            path: 'quantity',
            widthPct: 15,
            align: 'right',
            format: 'number',
          },
          {
            id: genId('col'),
            label: 'Precio',
            path: 'price',
            widthPct: 17,
            align: 'right',
            format: 'currency',
          },
          {
            id: genId('col'),
            label: 'Total',
            path: 'lineTotal',
            widthPct: 18,
            align: 'right',
            format: 'currency',
          },
        ],
        showHeader: true,
      };
    case 'totals':
      return { ...base, kind };
    case 'qr':
      return { ...base, kind, value: 'qrPayload' };
    case 'barcode':
      return { ...base, kind, value: 'doc.docCode', symbology: 'code128', includeText: true };
    case 'conditional':
      return {
        ...base,
        kind,
        path: 'doc.paid',
        operator: 'truthy',
        thenText: 'Pagada',
        elseText: 'Pendiente',
      };
    case 'signature':
      return { ...base, kind, label: 'Firma y sello' };
    case 'pageBreak':
      return { ...base, kind };
    case 'divider':
      return {
        ...base,
        kind,
        orientation: 'horizontal',
        style: { borderWidth: 1, borderStyle: 'solid', borderColor: '#94a3b8' },
      };
    case 'summary':
      return {
        ...base,
        kind,
        op: 'sum',
        source: 'lines',
        path: 'lineTotal',
        format: 'currency',
        style: {},
      };
    case 'box':
      return {
        ...base,
        kind,
        style: {
          backgroundColor: '#f8fafc',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: '#e2e8f0',
          borderRadius: 4,
        },
      };
    case 'list':
      return {
        ...base,
        kind,
        source: 'lines',
        itemPath: 'itemName',
        marker: 'bullet',
        style: {},
      };
    case 'currentDate':
      return { ...base, kind, mode: 'date', style: {} };
  }
}
