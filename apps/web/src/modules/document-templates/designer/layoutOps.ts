/** Cambios sobre el layout: funciones puras, sin nada de React. */
import {
  type LinesTableElement,
  resolvePageDimensions,
  type Band,
  type BandKind,
  type CanvasElement,
  type CanvasLayout,
} from '../components/canvas/types';
import { elementsBottom } from './blocks';

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

export function mapElements(
  layout: CanvasLayout,
  change: (el: CanvasElement, band: Band) => CanvasElement,
): CanvasLayout {
  return {
    ...layout,
    bands: layout.bands.map((band) => ({
      ...band,
      elements: band.elements.map((el) => change(el, band)),
    })),
  };
}

export function findElement(layout: CanvasLayout, id: string): CanvasElement | null {
  return layout.bands.flatMap((b) => b.elements).find((e) => e.id === id) ?? null;
}

export function bandOf(layout: CanvasLayout, id: string): Band | undefined {
  return layout.bands.find((b) => b.elements.some((e) => e.id === id));
}

/** Banda visible donde encaja algo: la de ese tipo o, si no está, la primera que se vea. */
export function naturalBand(layout: CanvasLayout, kind: BandKind): Band | undefined {
  return (
    layout.bands.find((b) => !b.hidden && b.kind === kind) ?? layout.bands.find((b) => !b.hidden)
  );
}

/**
 * Si una tabla puede llevar ese dato como columna: pinta una sola fuente, y una columna de
 * una consulta no debe cambiar la tabla de líneas de un documento. En una plantilla sin
 * documento, una tabla aún sin fuente sí puede adoptar la de la columna.
 */
export function tableTakesColumn(
  table: CanvasElement,
  lineSource: string | undefined,
  docType: string | undefined,
): boolean {
  const source = (table as LinesTableElement).source;
  if (!lineSource) return !source;
  return source === lineSource || (!source && (docType === 'FREE' || docType === 'LABEL'));
}

/** Añade elementos a una banda y la agranda si hace falta para que quepan. */
export function addToBand(
  layout: CanvasLayout,
  bandId: string,
  elements: CanvasElement[],
): CanvasLayout {
  return {
    ...layout,
    bands: layout.bands.map((band) => {
      if (band.id !== bandId) return band;
      const next = [...band.elements, ...elements];
      return { ...band, elements: next, height: Math.max(band.height, elementsBottom(next) + 2) };
    }),
  };
}

/**
 * Coloca elementos debajo de lo que ya hay en una banda. Conserva la disposición entre
 * ellos, para que un bloque no se desordene al añadirlo por segunda vez.
 */
export function stackBelow(band: Band, elements: CanvasElement[], side?: 'left' | 'right') {
  // Lo que ocupa solo un lado no choca con lo del otro: puede empezar arriba.
  const collides = (el: CanvasElement) => {
    if (!side) return true;
    const left = Math.min(...elements.map((e) => e.x));
    const right = Math.max(...elements.map((e) => e.x + e.w));
    return el.x < right && el.x + el.w > left;
  };
  const occupied = band.elements.filter(collides);
  if (occupied.length === 0) return elements;
  const top = Math.min(...elements.map((e) => e.y));
  const offset = elementsBottom(occupied) + 2 - top;
  return elements.map((el) => ({ ...el, y: el.y + offset }));
}

/** Alinea un elemento con la página y con su banda. */
export function alignToPage(layout: CanvasLayout, id: string, mode: AlignMode): CanvasLayout {
  const { width } = resolvePageDimensions(layout);
  return mapElements(layout, (el, band) => {
    if (el.id !== id) return el;
    switch (mode) {
      case 'left':
        return { ...el, x: layout.margins.left };
      case 'hcenter':
        return { ...el, x: Math.max(0, (width - el.w) / 2) };
      case 'right':
        return { ...el, x: Math.max(0, width - layout.margins.right - el.w) };
      case 'top':
        return { ...el, y: 0 };
      case 'vcenter':
        return { ...el, y: Math.max(0, (band.height - el.h) / 2) };
      case 'bottom':
        return { ...el, y: Math.max(0, band.height - el.h) };
    }
  });
}

/** Alinea varios elementos entre sí, con el borde o el centro del conjunto. */
export function alignSelection(layout: CanvasLayout, ids: string[], mode: AlignMode): CanvasLayout {
  const selected = ids.map((id) => findElement(layout, id)).filter(Boolean) as CanvasElement[];
  if (selected.length < 2) return layout;
  const left = Math.min(...selected.map((e) => e.x));
  const right = Math.max(...selected.map((e) => e.x + e.w));
  const top = Math.min(...selected.map((e) => e.y));
  const bottom = Math.max(...selected.map((e) => e.y + e.h));
  return mapElements(layout, (el) => {
    if (!ids.includes(el.id)) return el;
    switch (mode) {
      case 'left':
        return { ...el, x: left };
      case 'hcenter':
        return { ...el, x: (left + right) / 2 - el.w / 2 };
      case 'right':
        return { ...el, x: right - el.w };
      case 'top':
        return { ...el, y: top };
      case 'vcenter':
        return { ...el, y: (top + bottom) / 2 - el.h / 2 };
      case 'bottom':
        return { ...el, y: bottom - el.h };
    }
  });
}

/** Reparte varios elementos con el mismo hueco entre ellos. */
export function distributeSelection(
  layout: CanvasLayout,
  ids: string[],
  axis: 'horizontal' | 'vertical',
): CanvasLayout {
  const selected = ids.map((id) => findElement(layout, id)).filter(Boolean) as CanvasElement[];
  if (selected.length < 3) return layout;
  const pos = axis === 'horizontal' ? 'x' : 'y';
  const size = axis === 'horizontal' ? 'w' : 'h';
  const sorted = [...selected].sort((a, b) => a[pos] - b[pos]);
  const start = sorted[0][pos];
  const last = sorted[sorted.length - 1];
  const end = last[pos] + last[size];
  const gap = (end - start - sorted.reduce((sum, el) => sum + el[size], 0)) / (sorted.length - 1);
  const placed = new Map<string, number>();
  let cursor = start;
  for (const el of sorted) {
    placed.set(el.id, cursor);
    cursor += el[size] + gap;
  }
  return mapElements(layout, (el) =>
    placed.has(el.id) ? { ...el, [pos]: placed.get(el.id) as number } : el,
  );
}

/** Mueve elementos sin salirse de su banda por arriba ni por la izquierda. */
export function moveElements(
  layout: CanvasLayout,
  ids: string[],
  dx: number,
  dy: number,
): CanvasLayout {
  return mapElements(layout, (el) =>
    ids.includes(el.id) && !el.locked
      ? { ...el, x: Math.max(0, el.x + dx), y: Math.max(0, el.y + dy) }
      : el,
  );
}

export function removeElements(layout: CanvasLayout, ids: string[]): CanvasLayout {
  return {
    ...layout,
    bands: layout.bands.map((band) => ({
      ...band,
      elements: band.elements.filter((el) => !ids.includes(el.id)),
    })),
  };
}
