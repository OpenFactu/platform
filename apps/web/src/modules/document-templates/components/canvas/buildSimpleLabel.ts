/**
 * Construye un `CanvasLayout` para una etiqueta a partir de un objeto plano
 * `SimpleLabelSettings`. Sirve al "modo simple" del editor: el usuario marca
 * qué quiere ver (nombre, precio, código de barras, QR) y este módulo
 * traduce esos toggles a un layout completo con elementos posicionados.
 *
 * Los paths usados dependen de `kind`:
 *  - `article`: `queries.item.0.*` con la query `item` que lee la tabla Item.
 *  - `document`: `params.*` directamente (sin tocar BD), aprovechando los
 *    placeholders que envía DocumentActionBar (docId, docCode).
 */

import type {
  CanvasLayout,
  SimpleLabelSettings,
  TextElement,
  BarcodeElement,
  QRElement,
  PageSize,
} from './types';
import { PAGE_SIZE_MM } from './types';

const ARTICLE_QUERY = {
  name: 'item',
  sql:
    'SELECT id, code, name, "basePrice", description, ' +
    "COALESCE(NULLIF(TRIM(COALESCE(\"barcode\", '')), ''), code) AS barcode " +
    'FROM "Item" WHERE id = :itemId',
};

/** Path Handlebars del campo según el origen elegido. */
function paths(kind: SimpleLabelSettings['kind']) {
  if (kind === 'article') {
    return {
      name: 'queries.item.0.name',
      code: 'queries.item.0.code',
      price: 'queries.item.0.basePrice',
      barcode: 'queries.item.0.barcode',
    };
  }
  return {
    name: 'params.docCode',
    code: 'params.docCode',
    price: '',
    barcode: 'params.docCode',
  };
}

/** Dimensiones útiles del lienzo según pageSize del usuario. */
function pageDimensions(pageSize: PageSize, customW?: number, customH?: number) {
  if (pageSize === 'Custom') {
    return {
      width: Math.max(20, customW ?? 100),
      height: Math.max(15, customH ?? 60),
    };
  }
  return PAGE_SIZE_MM[pageSize];
}

export function buildSimpleLabelLayout(s: SimpleLabelSettings): CanvasLayout {
  const dim = pageDimensions(s.pageSize, s.customWidthMm, s.customHeightMm);
  // Margen interior pequeño y banda única que cubre toda la etiqueta menos
  // los márgenes. Coordenadas dentro de la banda relativas a (0,0).
  const margin = 2;
  const innerW = dim.width - margin * 2;
  const innerH = dim.height - margin * 2;

  const accent = s.accentColor || '#0f172a';
  const p = paths(s.kind);
  const elements: any[] = [];

  // Repartimos verticalmente las secciones activas. Para cada sección
  // calculamos altura proporcional según qué activó el usuario.
  const sections: Array<{ key: string; weight: number; build: (y: number, h: number) => any }> = [];

  if (s.showTitle && s.titleText) {
    sections.push({
      key: 'title',
      weight: 0.08,
      build: (y, h) =>
        ({
          id: 'el_simple_title',
          kind: 'text',
          x: margin,
          y,
          w: innerW,
          h,
          text: s.titleText,
          raw: false,
          style: {
            fontSize: 8,
            fontWeight: 'bold',
            textAlign: 'center',
            color: '#64748b',
          },
        }) as TextElement,
    });
  }

  if (s.showName) {
    sections.push({
      key: 'name',
      weight: 0.18,
      build: (y, h) =>
        ({
          id: 'el_simple_name',
          kind: 'text',
          x: margin,
          y,
          w: innerW,
          h,
          text: `{{${p.name}}}`,
          raw: true,
          style: {
            fontSize: Math.max(9, Math.min(14, dim.width / 8)),
            fontWeight: 'bold',
            textAlign: 'center',
            color: accent,
          },
        }) as TextElement,
    });
  }

  if (s.showCode) {
    sections.push({
      key: 'code',
      weight: 0.1,
      build: (y, h) =>
        ({
          id: 'el_simple_code',
          kind: 'text',
          x: margin,
          y,
          w: innerW,
          h,
          text: `{{${p.code}}}`,
          raw: true,
          style: {
            fontSize: 8,
            fontWeight: 'normal',
            textAlign: 'center',
            color: '#64748b',
          },
        }) as TextElement,
    });
  }

  if (s.showBarcode) {
    sections.push({
      key: 'barcode',
      weight: 0.45,
      build: (y, h) =>
        ({
          id: 'el_simple_barcode',
          kind: 'barcode',
          x: margin + 4,
          y,
          w: innerW - 8,
          h,
          value: p.barcode,
          symbology: s.barcodeSymbology || 'auto',
          includeText: true,
        }) as BarcodeElement,
    });
  }

  if (s.showQr) {
    sections.push({
      key: 'qr',
      weight: 0.4,
      build: (y, h) => {
        // QR cuadrado centrado.
        const side = Math.min(h, innerW * 0.5);
        return {
          id: 'el_simple_qr',
          kind: 'qr',
          x: margin + (innerW - side) / 2,
          y,
          w: side,
          h: side,
          value: p.barcode,
          scale: 4,
        } as QRElement;
      },
    });
  }

  if (s.showPrice && s.kind === 'article') {
    sections.push({
      key: 'price',
      weight: 0.18,
      build: (y, h) =>
        ({
          id: 'el_simple_price',
          kind: 'text',
          x: margin,
          y,
          w: innerW,
          h,
          text: `{{formatCurrency ${p.price} "EUR"}}`,
          raw: true,
          style: {
            fontSize: Math.max(11, Math.min(18, dim.width / 6)),
            fontWeight: 'bold',
            textAlign: 'center',
            color: accent,
          },
        }) as TextElement,
    });
  }

  if (s.footerText) {
    sections.push({
      key: 'footer',
      weight: 0.08,
      build: (y, h) =>
        ({
          id: 'el_simple_footer',
          kind: 'text',
          x: margin,
          y,
          w: innerW,
          h,
          text: s.footerText,
          raw: true,
          style: { fontSize: 7, textAlign: 'center', color: '#94a3b8' },
        }) as TextElement,
    });
  }

  // Distribución vertical: normaliza pesos, asigna alturas y posiciones.
  if (sections.length === 0) {
    // Layout vacío válido — el usuario puede activar toggles luego.
    sections.push({
      key: 'empty',
      weight: 1,
      build: (y, h) =>
        ({
          id: 'el_simple_empty',
          kind: 'text',
          x: margin,
          y,
          w: innerW,
          h,
          text: 'Activa al menos un campo en el modo simple',
          raw: false,
          style: { fontSize: 9, textAlign: 'center', color: '#94a3b8' },
        }) as TextElement,
    });
  }
  const totalWeight = sections.reduce((a, s) => a + s.weight, 0);
  let cursor = 0;
  for (const sec of sections) {
    const h = (sec.weight / totalWeight) * innerH;
    elements.push(sec.build(cursor, h - 1));
    cursor += h;
  }

  return {
    version: 1,
    pageSize: s.pageSize,
    customWidthMm: s.customWidthMm,
    customHeightMm: s.customHeightMm,
    margins: { top: margin, right: margin, bottom: margin, left: margin },
    bands: [{ id: 'b_detail', kind: 'detail', height: innerH, elements }],
    queries: s.kind === 'article' ? [ARTICLE_QUERY] : [],
    simpleLabel: s,
  };
}

/** Settings por defecto para una etiqueta de artículo nueva. */
export function defaultSimpleArticleSettings(): SimpleLabelSettings {
  return {
    kind: 'article',
    pageSize: 'Label100x62',
    showName: true,
    showCode: false,
    showPrice: true,
    showBarcode: true,
    barcodeSymbology: 'auto',
    showQr: false,
    accentColor: '#0f172a',
  };
}

/** Settings por defecto para una etiqueta de documento nueva. */
export function defaultSimpleDocumentSettings(): SimpleLabelSettings {
  return {
    kind: 'document',
    pageSize: 'Label100x62',
    showTitle: true,
    titleText: 'DOCUMENTO',
    showName: true,
    showBarcode: true,
    barcodeSymbology: 'auto',
    showQr: false,
    accentColor: '#0f172a',
  };
}
