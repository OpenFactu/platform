import { useCallback, useRef, useState } from 'react';

/**
 * Zona de "soltar archivos" reutilizable: devuelve los handlers que hay que
 * esparcir sobre el contenedor y si hay un arrastre encima ahora mismo.
 *
 * Tres detalles que se hacen mal a menudo y que aquí van resueltos:
 *
 * - `dragenter`/`dragleave` se disparan TAMBIÉN al pasar de un hijo a otro
 *   dentro de la zona. Sin un contador de profundidad, el resaltado parpadea
 *   cada vez que el cursor cruza el textarea o una burbuja de mensaje.
 * - Un arrastre que no lleva archivos (texto seleccionado, la propia bolita
 *   flotante de Keiro) no debe encender la zona: se filtra por
 *   `dataTransfer.types`.
 * - Sin `preventDefault` en `dragover` el navegador NO permite el drop, y sin
 *   él en `drop` abre el archivo en la pestaña. Los dos se hacen siempre que
 *   el arrastre lleve archivos, incluso con la zona deshabilitada — así
 *   soltar durante un turno en curso no se lleva por delante la conversación.
 */
export function useFileDropZone(onFiles: (files: File[]) => void, disabled = false) {
  const [dragOver, setDragOver] = useState(false);
  const depth = useRef(0);

  const carriesFiles = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes('Files');

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      if (!disabled) setDragOver(true);
    },
    [disabled],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!carriesFiles(e)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragOver(false);
      if (disabled) return;
      onFiles(Array.from(e.dataTransfer.files));
    },
    [disabled, onFiles],
  );

  return {
    dragOver,
    dropZoneProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}
