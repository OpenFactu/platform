import { useEffect, useMemo, useState } from 'react';
import type { CanvasLayout } from '../components/canvas/types';
import { templatesApi } from '../api';
import { paperSources } from './paperRender';

/** Lo bastante para no pedirlo a cada tecla y lo bastante poco para que parezca inmediato. */
const RENDER_DELAY_MS = 200;

/** `null` si no compila; sin entrada, si aún no ha llegado. */
export type ElementRenders = Map<string, string | null>;

/** Sin expresiones no hay nada que resolver (y una imagen puede pesar mucho). */
const needsServer = (source: string) => source.includes('{{');

/**
 * El HTML de cada elemento del papel, resuelto en el servidor. Se guarda por contenido: mover
 * o redimensionar no cambia nada que pedir, y al editar uno solo se pide ese. Mientras llega,
 * el elemento sigue con lo último que se tenía.
 */
export function useElementRenders(
  layout: CanvasLayout,
  docType: string | undefined,
  showData: boolean,
): { renders: ElementRenders; failed: boolean } {
  const [resolved, setResolved] = useState<Map<string, string | null>>(() => new Map());
  const [latest, setLatest] = useState<ElementRenders>(() => new Map());
  const [failed, setFailed] = useState(false);

  const { bands, watermark, showDocQr, showDocBarcode, queries, testParams } = layout;
  const sources = useMemo(
    () => paperSources({ ...layout, bands, watermark, showDocQr, showDocBarcode }, showData),
    // El resto del layout no cambia lo que se pinta dentro de cada elemento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bands, watermark, showDocQr, showDocBarcode, showData],
  );

  // Otras consultas o parámetros de prueba pueden dar otros datos: es otra entrada.
  const dataKey = JSON.stringify([queries ?? [], testParams ?? {}]);

  useEffect(() => {
    if (!docType) return;
    const pieces = [...new Set(sources.values())].filter(
      (source) => needsServer(source) && !resolved.has(dataKey + source),
    );
    if (!pieces.length) return;
    const timer = window.setTimeout(() => {
      templatesApi
        .renderElements({ docType, pieces, queries: queries ?? [], params: testParams ?? {} })
        .then(({ html }) => {
          setResolved((prev) => {
            const next = new Map(prev);
            pieces.forEach((source, index) => next.set(dataKey + source, html[index] ?? null));
            return next;
          });
          setLatest((prev) => {
            const next = new Map(prev);
            for (const [id, source] of sources) {
              const index = pieces.indexOf(source);
              if (index >= 0) next.set(id, html[index] ?? null);
            }
            return next;
          });
          setFailed(false);
        })
        .catch(() => setFailed(true));
    }, RENDER_DELAY_MS);
    return () => window.clearTimeout(timer);
    // dataKey resume queries y testParams.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, docType, dataKey, resolved]);

  const renders = useMemo(() => {
    const next: ElementRenders = new Map();
    for (const [id, source] of sources) {
      let html: string | null | undefined = source;
      if (needsServer(source)) {
        html = resolved.has(dataKey + source) ? resolved.get(dataKey + source) : latest.get(id);
      }
      if (html !== undefined) next.set(id, html);
    }
    return next;
  }, [sources, resolved, latest, dataKey]);

  return { renders, failed };
}
