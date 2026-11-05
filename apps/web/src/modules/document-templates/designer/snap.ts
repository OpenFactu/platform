import { resolvePageDimensions, type CanvasLayout } from '../components/canvas/types';
import { SNAP_MM } from './constants';

/** Top acumulado (mm) de una banda, saltando las ocultas. */
export function bandTopMm(layout: CanvasLayout, bandId: string): number {
  let top = 0;
  for (const b of layout.bands) {
    if (b.hidden) continue;
    if (b.id === bandId) break;
    top += b.height;
  }
  return top;
}

export interface SnapResult {
  x: number;
  y: number;
  /** Guías verticales (x de página, en mm). */
  v: number[];
  /** Guías horizontales (y absoluta desde el tope de página, en mm). */
  h: number[];
}

/**
 * Imanta la posición proyectada (`projX`,`projY` en mm) de un elemento a los
 * bordes/centros de los otros elementos de su banda, a los márgenes y al centro
 * de página/banda. Devuelve la posición ajustada y las líneas guía a dibujar.
 */
export function computeSnap(
  layout: CanvasLayout,
  bandId: string,
  el: { id: string; w: number; h: number },
  projX: number,
  projY: number,
): SnapResult {
  const band = layout.bands.find((b) => b.id === bandId);
  const { width: pageW } = resolvePageDimensions(layout);
  const right = pageW - layout.margins.right;

  const xc: { left: number; guide: number }[] = [
    { left: layout.margins.left, guide: layout.margins.left },
    { left: right - el.w, guide: right },
    { left: pageW / 2 - el.w / 2, guide: pageW / 2 },
  ];
  const yc: { top: number; guide: number }[] = band
    ? [
        { top: 0, guide: 0 },
        { top: band.height / 2 - el.h / 2, guide: band.height / 2 },
        { top: band.height - el.h, guide: band.height },
      ]
    : [];
  if (band) {
    for (const n of band.elements) {
      if (n.id === el.id) continue;
      xc.push(
        { left: n.x, guide: n.x },
        { left: n.x + n.w / 2 - el.w / 2, guide: n.x + n.w / 2 },
        { left: n.x + n.w - el.w, guide: n.x + n.w },
        { left: n.x + n.w, guide: n.x + n.w },
        { left: n.x - el.w, guide: n.x },
      );
      yc.push(
        { top: n.y, guide: n.y },
        { top: n.y + n.h / 2 - el.h / 2, guide: n.y + n.h / 2 },
        { top: n.y + n.h - el.h, guide: n.y + n.h },
        { top: n.y + n.h, guide: n.y + n.h },
        { top: n.y - el.h, guide: n.y },
      );
    }
  }

  let x = projX;
  let guideV: number | null = null;
  let bestX = SNAP_MM;
  for (const c of xc) {
    const d = Math.abs(projX - c.left);
    if (d <= bestX) {
      bestX = d;
      x = c.left;
      guideV = c.guide;
    }
  }
  let y = projY;
  let guideH: number | null = null;
  let bestY = SNAP_MM;
  for (const c of yc) {
    const d = Math.abs(projY - c.top);
    if (d <= bestY) {
      bestY = d;
      y = c.top;
      guideH = c.guide;
    }
  }
  const bandTop = bandTopMm(layout, bandId);
  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
    v: guideV != null ? [guideV] : [],
    h: guideH != null ? [bandTop + guideH] : [],
  };
}
