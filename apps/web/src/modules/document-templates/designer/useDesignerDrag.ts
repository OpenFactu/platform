import { useState } from 'react';
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core';
import { useI18n } from '@/i18n/I18nContext';
import type {
  CanvasElement,
  CanvasLayout,
  ElementKind,
  LinesTableColumn,
  LinesTableElement,
} from '../components/canvas/types';
import { flowsInBand } from '../components/canvas/compileCanvas';
import { blockContext, type BlockDef } from './blocks';
import { DEFAULT_SIZE, PX_PER_MM } from './constants';
import { buildDefaultElement, genId } from './elements';
import { addToBand, moveElements, tableTakesColumn } from './layoutOps';
import { computeSnap } from './snap';
import type { FieldDescriptor } from './types';

type DragData =
  | { action: 'create'; kind: ElementKind }
  | { action: 'createField'; descriptor: FieldDescriptor }
  | { action: 'createBlock'; block: BlockDef; label: string }
  | { action: 'move'; bandId: string; elementId: string };

/** Arrastrar: añadir desde el panel y mover lo que ya está en el papel. */
export function useDesignerDrag(args: {
  layout: CanvasLayout;
  setLayout: React.Dispatch<React.SetStateAction<CanvasLayout>>;
  selection: string[];
  select: (ids: string[]) => void;
  docType: string | undefined;
  zoom: number;
}) {
  const { layout, setLayout, selection, select, docType, zoom } = args;
  const { t } = useI18n();
  const pxPerMm = PX_PER_MM * zoom;
  // Etiqueta que sigue al cursor (bloques, campos y elementos del panel).
  const [activeDrag, setActiveDrag] = useState<{ label: string } | null>(null);
  // Líneas guía de alineación mientras se mueve un elemento.
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  // Lo que se mueve a la vez que el elemento arrastrado, en px de pantalla.
  const [groupDrag, setGroupDrag] = useState<{ ids: string[]; dx: number; dy: number } | null>(
    null,
  );

  const reset = () => {
    setActiveDrag(null);
    setGuides({ v: [], h: [] });
    setGroupDrag(null);
  };

  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (data?.action === 'create') {
      setActiveDrag({ label: t(`templates.designer.palette.${data.kind}`) });
    } else if (data?.action === 'createField') {
      setActiveDrag({ label: data.descriptor.label });
    } else if (data?.action === 'createBlock') {
      setActiveDrag({ label: data.label });
    } else {
      setActiveDrag(null);
    }
  };

  const onDragMove = (event: DragMoveEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (data?.action !== 'move') return;
    if (selection.length > 1 && selection.includes(data.elementId)) {
      setGroupDrag({
        ids: selection.filter((id) => id !== data.elementId),
        dx: event.delta.x,
        dy: event.delta.y,
      });
      return;
    }
    const band = layout.bands.find((b) => b.id === data.bandId);
    const el = band?.elements.find((e) => e.id === data.elementId);
    if (!el) return;
    const snap = computeSnap(
      layout,
      data.bandId,
      el,
      el.x + event.delta.x / pxPerMm,
      el.y + event.delta.y / pxPerMm,
    );
    setGuides({ v: snap.v, h: snap.h });
  };

  const onDragEnd = (event: DragEndEvent) => {
    reset();
    const { active, over, delta } = event;
    if (!over) return;
    const targetBandId = String(over.id);
    const data = active.data.current as DragData | undefined;
    if (!data) return;

    // Dónde cayó el puntero, en mm desde la esquina de la banda.
    const pointer = (event.activatorEvent as PointerEvent) ?? null;
    const dropRect = over.rect;
    const pointerMm = () =>
      pointer && dropRect
        ? {
            x: Math.max(0, Math.round((pointer.clientX + delta.x - dropRect.left) / pxPerMm)),
            y: Math.max(0, Math.round((pointer.clientY + delta.y - dropRect.top) / pxPerMm)),
          }
        : { x: 5, y: 5 };

    if (data.action === 'createBlock') {
      if (!docType) return;
      const elements = data.block.build(blockContext(layout, docType));
      const left = Math.min(...elements.map((e) => e.x));
      const top = Math.min(...elements.map((e) => e.y));
      const at = pointerMm();
      const placed = elements.map((el) => ({
        ...el,
        x: el.x - left + at.x,
        y: el.y - top + at.y,
      }));
      setLayout((prev) => addToBand(prev, targetBandId, placed));
      select(placed.map((el) => el.id));
      return;
    }

    if (data.action === 'createField') {
      const desc = data.descriptor;
      const at = pointerMm();
      const targetBand = layout.bands.find((b) => b.id === targetBandId);
      // ¿Se soltó encima de una tabla de líneas? → añadir columna en vez de elemento.
      const overTable = targetBand?.elements.find(
        (e) =>
          e.kind === 'linesTable' &&
          at.x >= e.x &&
          at.x <= e.x + e.w &&
          at.y >= e.y &&
          at.y <= e.y + e.h,
      ) as LinesTableElement | undefined;

      if (overTable && desc.linePath && tableTakesColumn(overTable, desc.lineSource, docType)) {
        const newCol: LinesTableColumn = {
          id: genId('col'),
          label: desc.label,
          path: desc.linePath,
          widthPct: Math.round(100 / (overTable.columns.length + 1)),
          align: 'left',
          format: desc.format,
        };
        setLayout((prev) => ({
          ...prev,
          bands: prev.bands.map((b) =>
            b.id === targetBandId
              ? {
                  ...b,
                  elements: b.elements.map((e) =>
                    e.id === overTable.id
                      ? ({
                          ...e,
                          // Si la columna viene de una query, enganchamos la tabla a esa fuente.
                          source: desc.lineSource ?? (e as LinesTableElement).source,
                          columns: [...(e as LinesTableElement).columns, newCol],
                        } as LinesTableElement)
                      : e,
                  ),
                }
              : b,
          ),
        }));
        select([overTable.id]);
        return;
      }

      const size = DEFAULT_SIZE.field;
      const fieldEl = {
        id: genId('field'),
        kind: 'field' as const,
        x: at.x,
        y: at.y,
        w: size.w,
        h: size.h,
        path: desc.canvasPath,
        format: desc.format,
      } as CanvasElement;
      setLayout((prev) => addToBand(prev, targetBandId, [fieldEl]));
      select([fieldEl.id]);
      return;
    }

    if (data.action === 'create') {
      const at = pointerMm();
      const size = DEFAULT_SIZE[data.kind];
      const newEl = buildDefaultElement(data.kind, at.x, at.y, size.w, size.h);
      setLayout((prev) => addToBand(prev, targetBandId, [newEl]));
      select([newEl.id]);
      return;
    }

    // Varios seleccionados: se mueven juntos, cada uno dentro de su banda.
    if (selection.length > 1 && selection.includes(data.elementId)) {
      const snapped = (px: number) => Math.round((px / pxPerMm) * 2) / 2;
      setLayout((prev) => moveElements(prev, selection, snapped(delta.x), snapped(delta.y)));
      return;
    }

    // Mover elemento existente: actualizar x,y (convertir delta px→mm) y, si la
    // banda destino difiere, moverlo de banda.
    const dxMm = Math.round(delta.x / pxPerMm);
    const dyMm = Math.round(delta.y / pxPerMm);
    // Si la banda destino es distinta de la origen, calculamos la `y` relativa
    // a la banda destino a partir del puntero (igual que al crear). Con la
    // fórmula antigua (y_origen + dy) el elemento podía caer fuera del alto
    // de la banda nueva — ej. al soltar en el pie de página — y quedar
    // recortado por `overflow:hidden`, pareciendo que "desaparecía".
    const isCrossBand = targetBandId !== data.bandId;
    setLayout((prev) => {
      const sourceBand = prev.bands.find((b) => b.id === data.bandId);
      const targetBand = prev.bands.find((b) => b.id === targetBandId);
      const el = sourceBand?.elements.find((e) => e.id === data.elementId);
      if (!el) return prev;

      let newX = Math.max(0, el.x + dxMm);
      let newY = Math.max(0, el.y + dyMm);
      if (isCrossBand && dropRect && pointer) {
        const at = pointerMm();
        newX = Math.max(0, at.x - Math.round(el.w / 2));
        newY = Math.max(0, at.y - Math.round(el.h / 2));
      }
      // Imantado a guías de alineación (bordes/centros de vecinos, márgenes,
      // centro de página/banda) al soltar.
      const snap = computeSnap(prev, targetBandId, el, newX, newY);
      newX = snap.x;
      newY = snap.y;
      // Clamp final para que el elemento no quede fuera de la banda destino.
      if (targetBand && !flowsInBand(el)) {
        const maxY = Math.max(0, targetBand.height - el.h);
        if (newY > maxY) newY = maxY;
      }
      const updated: CanvasElement = { ...el, x: newX, y: newY };

      return {
        ...prev,
        bands: prev.bands.map((b) => {
          if (b.id === data.bandId && data.bandId === targetBandId) {
            return { ...b, elements: b.elements.map((e) => (e.id === el.id ? updated : e)) };
          }
          if (b.id === data.bandId) {
            return { ...b, elements: b.elements.filter((e) => e.id !== el.id) };
          }
          if (b.id === targetBandId) {
            return { ...b, elements: [...b.elements, updated] };
          }
          return b;
        }),
      };
    });
  };

  return { activeDrag, guides, groupDrag, onDragStart, onDragMove, onDragEnd, onDragCancel: reset };
}
