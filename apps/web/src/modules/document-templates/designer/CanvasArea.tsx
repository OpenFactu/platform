import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useI18n } from '@/i18n/I18nContext';
import {
  resolvePageDimensions,
  type Band,
  type CanvasElement,
  type CanvasLayout,
} from '../components/canvas/types';
import { flowsInBand, pageFlow, PAPER_FONT } from '../components/canvas/compileCanvas';
import { bandLabel, PAGE_NUMBER_BOTTOM_MM, PAGE_NUMBER_PT, PX_PER_MM } from './constants';
import { ElementPreview } from './ElementPreview';
import { PaperHtml } from './PaperHtml';
import { DOC_FOOTER_KEY, WATERMARK_KEY } from './paperRender';
import { useDesignerPreview } from './PreviewContext';
import type { CtxTarget } from './types';

interface GroupDrag {
  ids: string[];
  dx: number;
  dy: number;
}

interface CanvasAreaProps {
  layout: CanvasLayout;
  zoom: number;
  containerRef?: React.Ref<HTMLElement>;
  selection: string[];
  /** Con Mayús, añade o quita de la selección en vez de sustituirla. */
  onSelectElement: (id: string | null, additive?: boolean) => void;
  onDeleteElement: (bandId: string, elementId: string) => void;
  onResizeBand: (bandId: string, height: number) => void;
  onResizeElement: (elementId: string, w: number, h: number) => void;
  onContext?: (t: CtxTarget) => void;
  guides?: { v: number[]; h: number[] };
  /** Lo que se está moviendo a la vez que el elemento que se arrastra. */
  groupDrag?: GroupDrag | null;
}

/**
 * El lienzo: el papel, siempre blanco porque así saldrá impreso, y al margen el nombre
 * de cada banda para que no pise el contenido. El zoom es CSS: los mm no cambian, solo
 * cuántos píxeles ocupan, y por eso todo arrastre divide entre `PX_PER_MM * zoom`.
 */
export const CanvasArea: React.FC<CanvasAreaProps> = ({
  layout,
  zoom,
  containerRef,
  selection,
  onSelectElement,
  onDeleteElement,
  onResizeBand,
  onResizeElement,
  onContext,
  guides,
  groupDrag,
}) => {
  const { t } = useI18n();
  const { renders } = useDesignerPreview();
  const { width, height } = resolvePageDimensions(layout);
  const margins = layout.margins;
  const watermark = renders.get(WATERMARK_KEY);
  const docFooter = renders.get(DOC_FOOTER_KEY);
  const pageNumbers = layout.pageNumbers;
  const flow = pageFlow(layout);
  return (
    <main
      ref={containerRef}
      className="flex-1 min-w-0 overflow-auto bg-bg-muted"
      onMouseDown={(e) => {
        // Deseleccionar al hacer click fuera de un elemento.
        if (e.target === e.currentTarget) onSelectElement(null);
      }}
    >
      <div
        className="flex justify-center py-6 pl-24 pr-6 min-w-fit"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onSelectElement(null);
        }}
      >
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onSelectElement(null);
          }}
          onContextMenu={(e) => {
            // Solo sobre el fondo de la página (no sobre una banda/elemento).
            if (e.target === e.currentTarget && onContext) {
              e.preventDefault();
              onContext({ scope: 'canvas', x: e.clientX, y: e.clientY });
            }
          }}
          className="relative bg-white text-black shadow-md shrink-0"
          style={{ width: `${width}mm`, minHeight: `${height}mm`, zoom }}
        >
          {/* Hasta dónde llega lo que se imprime con holgura: solo una guía, no sale en el PDF. */}
          <div
            className="absolute pointer-events-none border border-dotted border-slate-200"
            style={{
              left: `${margins.left}mm`,
              right: `${margins.right}mm`,
              top: `${margins.top}mm`,
              bottom: `${margins.bottom}mm`,
            }}
          />
          {watermark && <PaperHtml html={watermark} className="absolute inset-0" />}
          <div className="relative">
            {layout.bands
              .filter((b) => !b.hidden)
              .map((b) => (
                <BandSlot
                  key={b.id}
                  band={b}
                  pageWidth={width}
                  zoom={zoom}
                  selection={selection}
                  groupDrag={groupDrag}
                  onSelectElement={onSelectElement}
                  onDeleteElement={onDeleteElement}
                  onResize={(h) => onResizeBand(b.id, h)}
                  onResizeElement={onResizeElement}
                  onContext={onContext}
                />
              ))}
            {/* Lo que no cabe en la hoja sigue en la siguiente, como en el PDF. Solo tiene
                altura, y por tanto solo se ve, si el contenido llega hasta ahí. */}
            <div
              className="absolute right-0 bottom-0 overflow-hidden pointer-events-none z-30"
              style={{
                top: `${flow.firstPage}mm`,
                left: `${-84 / zoom}px`,
                backgroundImage: `repeating-linear-gradient(to bottom, #f43f5e 0, #f43f5e 1px, transparent 1px, transparent ${flow.nextPage}mm)`,
              }}
            >
              <span
                className="absolute left-0 top-0.5 text-right leading-tight text-rose-500"
                style={{ width: `${76 / zoom}px`, fontSize: `${10 / zoom}px` }}
              >
                {t('templates.designer.canvas.pageEnd')}
              </span>
            </div>
          </div>
          {docFooter && <PaperHtml html={docFooter} className="absolute inset-0" />}
          {pageNumbers?.enabled && !docFooter && (
            <div
              className="absolute inset-x-0 pointer-events-none flex"
              style={{
                bottom: PAGE_NUMBER_BOTTOM_MM + 'mm',
                padding: '0 15mm',
                fontSize: PAGE_NUMBER_PT + 'pt',
                fontFamily: PAPER_FONT,
                color: layout.style === 'neutral' ? '#000' : '#94a3b8',
                justifyContent:
                  pageNumbers.alignment === 'left'
                    ? 'flex-start'
                    : pageNumbers.alignment === 'right'
                      ? 'flex-end'
                      : 'center',
              }}
            >
              1 / 1
            </div>
          )}
          {/* Líneas guía de alineación (mientras se arrastra un elemento). */}
          {guides?.v.map((x, i) => (
            <div
              key={`gv-${i}`}
              className="absolute top-0 bottom-0 pointer-events-none z-40"
              style={{ left: `${x}mm`, borderLeft: '1px dashed #ec4899' }}
            />
          ))}
          {guides?.h.map((y, i) => (
            <div
              key={`gh-${i}`}
              className="absolute left-0 right-0 pointer-events-none z-40"
              style={{ top: `${y}mm`, borderTop: '1px dashed #ec4899' }}
            />
          ))}
        </div>
      </div>
    </main>
  );
};

interface BandSlotProps {
  band: Band;
  pageWidth: number;
  zoom: number;
  selection: string[];
  groupDrag?: GroupDrag | null;
  onSelectElement: (id: string | null, additive?: boolean) => void;
  onDeleteElement: (bandId: string, elementId: string) => void;
  onResize: (heightMm: number) => void;
  onResizeElement: (elementId: string, w: number, h: number) => void;
  onContext?: (t: CtxTarget) => void;
}

const BandSlot: React.FC<BandSlotProps> = ({
  band,
  pageWidth,
  zoom,
  selection,
  groupDrag,
  onSelectElement,
  onDeleteElement,
  onResize,
  onResizeElement,
  onContext,
}) => {
  const { t } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: band.id });
  const pxPerMm = PX_PER_MM * zoom;
  // Igual que en el PDF: la banda con algo en flujo crece con ello; las demás recortan
  // lo que se salga de ellas.
  const grows = band.elements.some(flowsInBand);
  const handleResizeDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startH = band.height;
    const onMove = (ev: MouseEvent) => {
      const deltaMm = (ev.clientY - startY) / pxPerMm;
      onResize(Math.max(5, Math.round(startH + deltaMm)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  return (
    <section
      ref={setNodeRef}
      onMouseDown={(e) => {
        // Si el click cae directamente sobre la banda (no sobre un elemento),
        // deseleccionamos. Los elementos detienen la propagación con su propio
        // handler de selección.
        if (e.target === e.currentTarget) onSelectElement(null);
      }}
      onContextMenu={(e) => {
        if (!onContext) return;
        // Los elementos detienen la propagación → aquí solo cae el espacio vacío.
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const xMm = Math.max(0, (e.clientX - rect.left) / pxPerMm);
        const yMm = Math.max(0, (e.clientY - rect.top) / pxPerMm);
        onContext({ scope: 'band', x: e.clientX, y: e.clientY, bandId: band.id, xMm, yMm });
      }}
      className={`group/band relative transition-colors ${isOver ? 'bg-blue-50' : ''}`}
      style={
        grows
          ? { minHeight: `${band.height}mm`, display: 'flow-root' }
          : { height: `${band.height}mm` }
      }
    >
      {/* Encima y sin ocupar sitio: un borde se sumaría al alto de lo que crece con su contenido. */}
      <div
        className={`absolute inset-x-0 bottom-0 border-b border-dashed pointer-events-none ${
          isOver ? 'border-blue-400' : 'border-slate-100 group-hover/band:border-slate-300'
        }`}
      />
      {/* Fuera del papel, para no pisar lo que hay dentro. */}
      <div
        className="absolute top-0 text-right leading-tight pointer-events-none select-none text-fg-muted"
        style={{
          right: `calc(100% + ${8 / zoom}px)`,
          width: `${76 / zoom}px`,
          fontSize: `${10 / zoom}px`,
        }}
      >
        {bandLabel(band)}
      </div>
      {band.elements.length === 0 && (
        <div
          className={`absolute inset-0 flex items-center justify-center text-xs text-slate-400 pointer-events-none ${
            isOver ? '' : 'opacity-0 group-hover/band:opacity-100'
          }`}
        >
          {isOver
            ? t('templates.designer.canvas.dropHere')
            : t('templates.designer.canvas.dragHere')}
        </div>
      )}
      {band.elements.map((el) => (
        <ElementBox
          key={el.id}
          element={el}
          bandId={band.id}
          zoom={zoom}
          clipTo={grows ? null : { width: pageWidth, height: band.height }}
          selected={selection.includes(el.id)}
          groupOffset={
            groupDrag?.ids.includes(el.id) ? { dx: groupDrag.dx, dy: groupDrag.dy } : null
          }
          onSelect={(additive) => onSelectElement(el.id, additive)}
          onResize={(w, h) => onResizeElement(el.id, w, h)}
          onContext={onContext}
        />
      ))}
      {/* Handle de resize: arrastra para cambiar el alto de la banda */}
      <div
        onMouseDown={handleResizeDown}
        title={t('templates.designer.canvas.resizeBand')}
        className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize bg-transparent hover:bg-blue-400/40 z-20"
      />
    </section>
  );
};

interface ElementBoxProps {
  element: CanvasElement;
  bandId: string;
  zoom: number;
  /** Hasta dónde se ve, en mm desde el origen de la banda; `null` si no recorta. */
  clipTo: { width: number; height: number } | null;
  selected: boolean;
  /** Desplazamiento en px de pantalla si se mueve junto a otro elemento seleccionado. */
  groupOffset: { dx: number; dy: number } | null;
  onSelect: (additive: boolean) => void;
  onResize: (w: number, h: number) => void;
  onContext?: (t: CtxTarget) => void;
}

/** Recorta el trozo de un elemento que se sale de su banda: en el PDF no se ve. */
function clipPathFor(
  element: CanvasElement,
  clipTo: { width: number; height: number } | null,
): string | undefined {
  if (!clipTo) return undefined;
  const top = Math.max(0, -element.y);
  const left = Math.max(0, -element.x);
  const right = Math.max(0, element.x + element.w - clipTo.width);
  const bottom = Math.max(0, element.y + element.h - clipTo.height);
  if (!top && !left && !right && !bottom) return undefined;
  return `inset(${top}mm ${right}mm ${bottom}mm ${left}mm)`;
}

const ElementBox: React.FC<ElementBoxProps> = ({
  element,
  bandId,
  zoom,
  clipTo,
  selected,
  groupOffset,
  onSelect,
  onResize,
  onContext,
}) => {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `el-${element.id}`,
    data: { action: 'move', bandId, elementId: element.id },
    disabled: element.locked,
  });
  const pxPerMm = PX_PER_MM * zoom;
  const startResize = (edge: 'e' | 's' | 'se') => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = element.w;
    const startH = element.h;
    const onMove = (ev: MouseEvent) => {
      const dxMm = (ev.clientX - startX) / pxPerMm;
      const dyMm = (ev.clientY - startY) / pxPerMm;
      const newW = edge === 's' ? startW : Math.max(2, Math.round(startW + dxMm));
      const newH = edge === 'e' ? startH : Math.max(2, Math.round(startH + dyMm));
      onResize(newW, newH);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  // El transform se aplica dentro del zoom: hay que quitárselo a los píxeles de pantalla.
  const offset = transform
    ? { x: transform.x / zoom, y: transform.y / zoom }
    : groupOffset
      ? { x: groupOffset.dx / zoom, y: groupOffset.dy / zoom }
      : null;
  // Como en el PDF: lo que va en el flujo de la banda crece y empuja lo que venga detrás.
  const flows = flowsInBand(element);
  const box: React.CSSProperties = flows
    ? {
        position: 'relative',
        marginLeft: `${element.x}mm`,
        marginTop: `${element.y}mm`,
        width: `${element.w}mm`,
      }
    : {
        position: 'absolute',
        left: `${element.x}mm`,
        top: `${element.y}mm`,
        width: `${element.w}mm`,
        height: `${element.h}mm`,
      };
  const style: React.CSSProperties = {
    ...box,
    transform: offset ? `translate3d(${offset.x}px, ${offset.y}px, 0)` : undefined,
    // Los ocultos se ven tenues en el diseñador (pero NO se emiten al PDF).
    opacity: isDragging ? 0.6 : element.hidden ? 0.3 : 1,
    zIndex: isDragging ? 50 : selected ? 20 : 10,
  };
  const locked = element.locked;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect(e.shiftKey);
      }}
      onContextMenu={(e) => {
        if (!onContext) return;
        e.preventDefault();
        e.stopPropagation();
        if (!selected) onSelect(false); // el menú actúa sobre este elemento
        onContext({ scope: 'element', x: e.clientX, y: e.clientY, bandId, elementId: element.id });
      }}
      tabIndex={0}
      style={style}
      className={`group select-none outline-none touch-none overflow-visible ${
        locked ? 'cursor-default' : 'cursor-move'
      } ${selected ? 'ring-2 ring-blue-500' : 'hover:ring-1 hover:ring-blue-300'}`}
    >
      <div
        className={flows ? 'w-full' : 'w-full h-full overflow-hidden'}
        style={{ clipPath: offset ? undefined : clipPathFor(element, clipTo) }}
      >
        <ElementPreview element={element} />
      </div>
      {selected && !locked && (
        <>
          {/* stopPropagation en pointerdown impide que dnd-kit arranque un drag
              al pinchar un handle — dnd-kit escucha pointer events, no mouse. */}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={startResize('e')}
            title={t('templates.designer.canvas.resizeWidth')}
            className="absolute top-0 right-0 bottom-0 w-1.5 cursor-ew-resize bg-blue-500/20 hover:bg-blue-500/60"
          />
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={startResize('s')}
            title={t('templates.designer.canvas.resizeHeight')}
            className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize bg-blue-500/20 hover:bg-blue-500/60"
          />
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={startResize('se')}
            title={t('templates.designer.canvas.resize')}
            className="absolute -right-1 -bottom-1 w-3 h-3 rounded-sm bg-blue-600 border border-white cursor-nwse-resize z-10"
          />
        </>
      )}
    </div>
  );
};
