import { useEffect, useState } from 'react';
import { PX_PER_MM } from './constants';

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2;
/** Lo que ocupan el margen con los nombres de las bandas y el aire alrededor del papel. */
const CANVAS_GUTTER_PX = 120;

const clamp = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

/** Zoom del lienzo. Por defecto el papel cabe entero a lo ancho, sea cual sea la ventana. */
export function useCanvasZoom(pageWidthMm: number) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [manual, setManual] = useState<number | null>(null);

  useEffect(() => {
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(container);
    return () => observer.disconnect();
  }, [container]);

  const fit = containerWidth
    ? clamp((containerWidth - CANVAS_GUTTER_PX) / (pageWidthMm * PX_PER_MM))
    : 1;
  const zoom = manual ?? fit;
  const step = (delta: number) => setManual(clamp(Math.round((zoom + delta) * 10) / 10));

  return {
    zoom,
    containerRef: setContainer,
    zoomIn: () => step(0.1),
    zoomOut: () => step(-0.1),
    zoomFit: () => setManual(null),
  };
}
