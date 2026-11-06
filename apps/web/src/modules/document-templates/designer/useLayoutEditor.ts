import { useRef, useState } from 'react';
import {
  resolvePageDimensions,
  type Band,
  type BandKind,
  type CanvasElement,
  type CanvasLayout,
  type ElementKind,
  type ElementStyle,
  type LinesTableColumn,
  type LinesTableElement,
} from '../components/canvas/types';
import { useI18n } from '@/i18n/I18nContext';
import { flowsInBand } from '../components/canvas/compileCanvas';
import { blockContext, type BlockDef } from './blocks';
import { DEFAULT_SIZE, NATURAL_BAND } from './constants';
import { buildDefaultElement, cloneElement, genId } from './elements';
import { columnsFromQueryCols } from './fieldDescriptors';
import {
  addToBand,
  alignSelection,
  alignToPage,
  bandOf,
  distributeSelection,
  findElement,
  mapElements,
  moveElements,
  naturalBand,
  removeElements,
  stackBelow,
  tableTakesColumn,
  type AlignMode,
} from './layoutOps';
import type { FieldDescriptor } from './types';

/** Banda natural de un campo según de quién sea el dato. */
function bandForField(path: string): BandKind {
  if (path.startsWith('partner.')) return 'docHeader';
  if (path.startsWith('lines.')) return 'detail';
  return 'pageHeader';
}

/** Selección y todos los cambios que se le pueden hacer a la plantilla. */
export function useLayoutEditor(
  layout: CanvasLayout,
  setLayout: React.Dispatch<React.SetStateAction<CanvasLayout>>,
  docType: string | undefined,
) {
  const { t } = useI18n();
  const [selection, setSelection] = useState<string[]>([]);
  const clipboardRef = useRef<CanvasElement | null>(null);
  const styleClipboardRef = useRef<ElementStyle | null>(null);

  const selectedElement = selection.length === 1 ? findElement(layout, selection[0]) : null;

  /** Un clic elige; con Mayús añade o quita. Sobre lo ya elegido, no pierde el grupo al arrastrar. */
  const selectElement = (id: string | null, additive = false) => {
    if (!id) {
      setSelection([]);
      return;
    }
    setSelection((prev) => {
      if (additive) return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      return prev.includes(id) && prev.length > 1 ? prev : [id];
    });
  };

  /** Banda donde añadir con un clic: la de lo seleccionado o la que le corresponde. */
  const targetBand = (kind?: BandKind): Band | undefined => {
    const current = selection[0] ? bandOf(layout, selection[0]) : undefined;
    return current ?? naturalBand(layout, kind ?? 'docHeader');
  };

  const addBlock = (block: BlockDef) => {
    if (!docType) return;
    const band = naturalBand(layout, block.band);
    if (!band) return;
    const built = block.build(blockContext(layout, docType));
    // La primera banda empieza en el borde del papel: baja hasta el margen.
    const isFirst = layout.bands.find((b) => !b.hidden)?.id === band.id;
    const inset = isFirst ? layout.margins.top : 0;
    const placed = stackBelow(
      band,
      built.map((el) => ({ ...el, y: el.y + inset })),
      block.side,
    );
    setLayout((prev) => addToBand(prev, band.id, placed));
    setSelection(placed.map((el) => el.id));
  };

  const addField = (field: FieldDescriptor) => {
    // Un dato de línea va como columna si ya hay una tabla que pinte esos datos.
    const table = layout.bands
      .flatMap((b) => b.elements)
      .find((e) => e.kind === 'linesTable' && tableTakesColumn(e, field.lineSource, docType)) as
      | LinesTableElement
      | undefined;
    // Si ya la lleva, lo que se quiere es ese dato suelto en el papel.
    if (table && field.linePath && !table.columns.some((c) => c.path === field.linePath)) {
      const column: LinesTableColumn = {
        id: genId('col'),
        label: field.label,
        path: field.linePath,
        widthPct: Math.round(100 / (table.columns.length + 1)),
        align: 'left',
        format: field.format,
      };
      setLayout((prev) =>
        mapElements(prev, (el) =>
          el.id === table.id
            ? ({
                ...el,
                source: field.lineSource ?? (el as LinesTableElement).source,
                columns: [...(el as LinesTableElement).columns, column],
              } as CanvasElement)
            : el,
        ),
      );
      setSelection([table.id]);
      return;
    }
    const band = targetBand(bandForField(field.canvasPath));
    if (!band) return;
    const size = DEFAULT_SIZE.field;
    const [element] = stackBelow(band, [
      {
        id: genId('field'),
        kind: 'field',
        x: layout.margins.left,
        y: 2,
        w: size.w,
        h: size.h,
        path: field.canvasPath,
        format: field.format,
      } as CanvasElement,
    ]);
    setLayout((prev) => addToBand(prev, band.id, [element]));
    setSelection([element.id]);
  };

  const addElement = (kind: ElementKind) => {
    const band = NATURAL_BAND[kind] ? naturalBand(layout, NATURAL_BAND[kind]) : targetBand();
    if (!band) return;
    const size = DEFAULT_SIZE[kind];
    const usable = resolvePageDimensions(layout).width - layout.margins.left - layout.margins.right;
    const [element] = stackBelow(band, [
      buildDefaultElement(
        kind,
        layout.margins.left,
        2,
        kind === 'linesTable' ? usable : size.w,
        size.h,
      ),
    ]);
    setLayout((prev) => addToBand(prev, band.id, [element]));
    setSelection([element.id]);
  };

  /** Las filas de una consulta como tabla, con todas sus columnas. */
  const addQueryTable = (name: string, columns: string[]) => {
    const band = naturalBand(layout, 'detail');
    if (!band) return;
    const usable = resolvePageDimensions(layout).width - layout.margins.left - layout.margins.right;
    // Lo que va en flujo no ocupa sitio fijo: solo hay que librar lo que sí lo ocupa.
    const [element] = stackBelow(
      { ...band, elements: band.elements.filter((e) => !flowsInBand(e)) },
      [
        {
          ...buildDefaultElement('linesTable', layout.margins.left, 4, usable, 14),
          source: `query:${name}`,
          columns: columnsFromQueryCols(columns),
          ...(layout.style === 'neutral' ? { tableStyle: 'neutral' } : {}),
        } as CanvasElement,
      ],
    );
    setLayout((prev) => addToBand(prev, band.id, [element]));
    setSelection([element.id]);
  };

  const removeSelection = () => {
    setLayout((prev) => removeElements(prev, selection));
    setSelection([]);
  };

  const deleteElement = (_bandId: string, id: string) => {
    setLayout((prev) => removeElements(prev, [id]));
    setSelection((prev) => prev.filter((x) => x !== id));
  };

  const updateElement = (id: string, patch: Partial<CanvasElement>) =>
    setLayout((prev) =>
      mapElements(prev, (el) => (el.id === id ? ({ ...el, ...patch } as CanvasElement) : el)),
    );

  const resizeElement = (id: string, w: number, h: number) =>
    updateElement(id, { w: Math.max(2, w), h: Math.max(2, h) } as Partial<CanvasElement>);

  const duplicateElement = (id: string) => {
    const band = bandOf(layout, id);
    const element = findElement(layout, id);
    if (!band || !element) return;
    const clone = cloneElement(element);
    setLayout((prev) => ({
      ...prev,
      bands: prev.bands.map((b) => {
        if (b.id !== band.id) return b;
        const elements = [...b.elements];
        // Tras el original → queda encima.
        elements.splice(elements.findIndex((e) => e.id === id) + 1, 0, clone);
        return { ...b, elements };
      }),
    }));
    setSelection([clone.id]);
  };

  const copyElement = (id: string) => {
    const element = findElement(layout, id);
    if (element) clipboardRef.current = JSON.parse(JSON.stringify(element));
  };

  const pasteElement = (bandId: string, xMm?: number, yMm?: number) => {
    const source = clipboardRef.current;
    if (!source) return;
    const clone = cloneElement(source, xMm == null ? 5 : 0, yMm == null ? 5 : 0);
    if (xMm != null) clone.x = Math.max(0, Math.round(xMm));
    if (yMm != null) clone.y = Math.max(0, Math.round(yMm));
    setLayout((prev) => addToBand(prev, bandId, [clone]));
    setSelection([clone.id]);
  };

  /** Pegar sin decir dónde: en la banda de lo seleccionado o en la primera visible. */
  const pasteHere = () => {
    const band = selection[0] ? bandOf(layout, selection[0]) : layout.bands.find((b) => !b.hidden);
    if (band) pasteElement(band.id);
  };

  const setZOrder = (bandId: string, id: string, mode: 'front' | 'back') =>
    setLayout((prev) => ({
      ...prev,
      bands: prev.bands.map((b) => {
        if (b.id !== bandId) return b;
        const el = b.elements.find((e) => e.id === id);
        if (!el) return b;
        const rest = b.elements.filter((e) => e.id !== id);
        // El orden del array = orden de pintado (el PDF no usa z-index): final = frente.
        return { ...b, elements: mode === 'front' ? [...rest, el] : [el, ...rest] };
      }),
    }));

  const copyStyle = (id: string) => {
    const el = findElement(layout, id);
    styleClipboardRef.current = (el && 'style' in el ? el.style : undefined) ?? null;
  };

  const pasteStyle = (id: string) => {
    const style = styleClipboardRef.current;
    if (style) updateElement(id, { style: { ...style } } as Partial<CanvasElement>);
  };

  const addElementToBand = (bandId: string, kind: ElementKind, xMm: number, yMm: number) => {
    const size = DEFAULT_SIZE[kind];
    const element = buildDefaultElement(
      kind,
      Math.max(0, Math.round(xMm)),
      Math.max(0, Math.round(yMm)),
      size.w,
      size.h,
    );
    setLayout((prev) => addToBand(prev, bandId, [element]));
    setSelection([element.id]);
  };

  const updateBand = (bandId: string, patch: Partial<Band>) =>
    setLayout((prev) => ({
      ...prev,
      bands: prev.bands.map((b) => (b.id === bandId ? { ...b, ...patch } : b)),
    }));

  const addBand = () =>
    setLayout((prev) => ({
      ...prev,
      bands: [
        ...prev.bands,
        {
          id: genId('band'),
          kind: 'custom',
          height: 20,
          elements: [],
          label: t('templates.designer.bands.custom'),
        },
      ],
    }));

  const deleteBand = (bandId: string) => {
    const band = layout.bands.find((b) => b.id === bandId);
    // Si lo seleccionado vivía en esta banda, se deselecciona.
    if (band) setSelection((prev) => prev.filter((id) => !band.elements.some((e) => e.id === id)));
    setLayout((prev) => ({ ...prev, bands: prev.bands.filter((b) => b.id !== bandId) }));
  };

  const moveBand = (bandId: string, dir: -1 | 1) =>
    setLayout((prev) => {
      const idx = prev.bands.findIndex((b) => b.id === bandId);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.bands.length) return prev;
      const bands = [...prev.bands];
      [bands[idx], bands[target]] = [bands[target], bands[idx]];
      return { ...prev, bands };
    });

  return {
    selection,
    setSelection,
    selectedElement,
    selectElement,
    hasClipboard: () => !!clipboardRef.current,
    hasStyleClipboard: () => !!styleClipboardRef.current,
    addBlock,
    addField,
    addElement,
    addQueryTable,
    addElementToBand,
    removeSelection,
    deleteElement,
    updateElement,
    resizeElement,
    duplicateElement,
    copyElement,
    pasteElement,
    pasteHere,
    setZOrder,
    copyStyle,
    pasteStyle,
    updateBand,
    addBand,
    deleteBand,
    moveBand,
    updatePage: (patch: Partial<CanvasLayout>) => setLayout((prev) => ({ ...prev, ...patch })),
    nudge: (dx: number, dy: number) => setLayout((prev) => moveElements(prev, selection, dx, dy)),
    alignOne: (id: string, mode: AlignMode) => setLayout((prev) => alignToPage(prev, id, mode)),
    alignMany: (mode: AlignMode) => setLayout((prev) => alignSelection(prev, selection, mode)),
    distribute: (axis: 'horizontal' | 'vertical') =>
      setLayout((prev) => distributeSelection(prev, selection, axis)),
    toggleLock: (id: string) => {
      const element = findElement(layout, id);
      if (element) updateElement(id, { locked: !element.locked });
    },
  };
}

export type LayoutEditor = ReturnType<typeof useLayoutEditor>;
