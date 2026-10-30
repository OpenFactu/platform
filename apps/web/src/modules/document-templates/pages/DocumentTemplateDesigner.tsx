import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast, Select, Textarea } from '@openfactu/ui';
import {
  ArrowLeft,
  Save,
  FileDown,
  FileUp,
  Undo,
  Redo,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  Copy,
  ClipboardPaste,
  BringToFront,
  SendToBack,
  Lock,
  Unlock,
  Code,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  Band,
  BandKind,
  CanvasElement,
  CanvasLayout,
  createDocumentLabelLayout,
  createEmptyLayout,
  createLabelLayout,
  ElementKind,
  ElementStyle,
  LinesTableColumn,
  LinesTableElement,
  PAGE_SIZE_LABELS,
  ParamDef,
  PageSize,
  resolvePageDimensions,
} from '../components/canvas/types';
import { useAuth } from '@/context/AuthContext';
import { TemplateRow } from '../components/constants';
import {
  buildSimpleLabelLayout,
  defaultSimpleArticleSettings,
} from '../components/canvas/buildSimpleLabel';
import { compileCanvas } from '../components/canvas/compileCanvas';
import { usePluginFields } from '../components/canvas/usePluginFields';
import { useQueryFields } from '../components/canvas/useQueryFields';
// El menú del canvas se queda con ContextMenu a pelo (no con rowActions de
// Table): es el único sitio de la app que usa `submenu`, que RowAction no tiene.
import { ContextMenu, type ContextMenuItem } from '@openfactu/ui';
import { CssEditorModal } from '../components/canvas/CssEditorModal';
import { ImportFromTemplateDialog } from '../components/canvas/ImportFromTemplateDialog';
import { SimpleLabelEditor } from '../components/SimpleLabelEditor';
import {
  FieldDef,
  FieldGroup,
  getFieldGroupsForFieldElement,
  getLineFieldGroup,
  inferDefaultFormat,
} from '../components/canvas/fieldRegistry';
import { extractPlaceholders } from '../components/canvas/params';
import { SqlEditorModal } from '../components/SqlEditorModal';
import { templatesApi } from '../api';
import { t } from '@/i18n/i18n';
import { useI18n } from '@/i18n/I18nContext';

/** Claves i18n (se traducen al pintar). */
const BAND_LABELS: Record<BandKind, string> = {
  pageHeader: 'templates.designer.bands.pageHeader',
  docHeader: 'templates.designer.bands.docHeader',
  detail: 'templates.designer.bands.detail',
  totals: 'templates.designer.bands.totals',
  pageFooter: 'templates.designer.bands.pageFooter',
  custom: 'templates.designer.bands.custom',
};

/** Etiqueta visible de una banda: su `label` propio o el genérico por `kind`. */
const bandLabel = (b: Band): string => b.label ?? t(BAND_LABELS[b.kind]);

/** `label` es una clave i18n: se traduce al pintar. */
const PALETTE_ITEMS: { kind: ElementKind; label: string }[] = [
  { kind: 'text', label: 'templates.designer.palette.text' },
  { kind: 'image', label: 'templates.designer.palette.image' },
  { kind: 'shape', label: 'templates.designer.palette.shape' },
  { kind: 'divider', label: 'templates.designer.palette.divider' },
  { kind: 'box', label: 'templates.designer.palette.box' },
  { kind: 'spacer', label: 'templates.designer.palette.spacer' },
  { kind: 'field', label: 'templates.designer.palette.field' },
  { kind: 'linesTable', label: 'templates.designer.palette.linesTable' },
  { kind: 'list', label: 'templates.designer.palette.list' },
  { kind: 'summary', label: 'templates.designer.palette.summary' },
  { kind: 'totals', label: 'templates.designer.palette.totals' },
  { kind: 'currentDate', label: 'templates.designer.palette.currentDate' },
  { kind: 'qr', label: 'templates.designer.palette.qr' },
  { kind: 'barcode', label: 'templates.designer.palette.barcode' },
  { kind: 'conditional', label: 'templates.designer.palette.conditional' },
  { kind: 'signature', label: 'templates.designer.palette.signature' },
  { kind: 'pageBreak', label: 'templates.designer.palette.pageBreak' },
];

/** Tamaño por defecto en mm cuando se suelta un elemento de la paleta. */
const DEFAULT_SIZE: Record<ElementKind, { w: number; h: number }> = {
  text: { w: 60, h: 8 },
  image: { w: 40, h: 20 },
  shape: { w: 60, h: 4 },
  spacer: { w: 60, h: 6 },
  field: { w: 60, h: 8 },
  linesTable: { w: 180, h: 80 },
  totals: { w: 80, h: 30 },
  qr: { w: 25, h: 25 },
  barcode: { w: 60, h: 15 },
  conditional: { w: 60, h: 8 },
  signature: { w: 70, h: 25 },
  pageBreak: { w: 60, h: 4 },
  divider: { w: 80, h: 4 },
  summary: { w: 60, h: 8 },
  box: { w: 80, h: 30 },
  list: { w: 80, h: 40 },
  currentDate: { w: 50, h: 8 },
};

/** Constante CSS: 1mm = 3.779527 px a 96 DPI. */
const PX_PER_MM = 3.779527559;

/** Tipos sin texto: en la sección Estilo solo muestran fondo/borde, no fuente. */
const STYLE_NO_FONT = new Set<ElementKind>(['shape', 'image', 'divider', 'box', 'qr', 'barcode']);

/** Umbral de imantado (mm) para las guías de alineación. */
const SNAP_MM = 1.5;

/** Top acumulado (mm) de una banda, saltando las ocultas. */
function bandTopMm(layout: CanvasLayout, bandId: string): number {
  let top = 0;
  for (const b of layout.bands) {
    if (b.hidden) continue;
    if (b.id === bandId) break;
    top += b.height;
  }
  return top;
}

interface SnapResult {
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
function computeSnap(
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

let nextId = 1;
const genId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${nextId++}`;

/**
 * Campo arrastrable del panel "Campos" (estilo Crystal Reports). Al soltarlo en
 * el lienzo crea un elemento `field` enlazado a `canvasPath`; al soltarlo sobre
 * una tabla de líneas añade una columna con `linePath` (y engancha la tabla a
 * `lineSource` si la columna viene de una query).
 */
interface FieldDescriptor {
  key: string;
  label: string;
  group: string;
  /** Ruta absoluta para un elemento Campo en el lienzo (ej. `doc.docCode`, `queries.q.0.col`). */
  canvasPath: string;
  /** Ruta relativa cuando se usa como columna de tabla (ej. `itemName`, `col`). */
  linePath?: string;
  /** `query:<nombre>` si la columna proviene de una consulta SQL. */
  lineSource?: string;
  format?: 'currency' | 'date' | 'number' | 'percent' | 'address';
}

/** Objetivo del menú contextual: canvas vacío, una banda o un elemento. */
type CtxTarget =
  | { scope: 'canvas'; x: number; y: number }
  | { scope: 'band'; x: number; y: number; bandId: string; xMm: number; yMm: number }
  | { scope: 'element'; x: number; y: number; bandId: string; elementId: string };

/** Clona un elemento con un id nuevo (deep-clone para arrays como columns). */
function cloneElement(el: CanvasElement, dx = 5, dy = 5): CanvasElement {
  const copy = JSON.parse(JSON.stringify(el)) as CanvasElement;
  copy.id = genId(el.kind);
  copy.x = Math.max(0, el.x + dx);
  copy.y = Math.max(0, el.y + dy);
  return copy;
}

export const DocumentTemplateDesigner: React.FC = () => {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { token, user } = useAuth();

  const [template, setTemplate] = useState<TemplateRow | null>(null);
  const [layout, setLayout] = useState<CanvasLayout>(createEmptyLayout());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Estado del autoguardado: 'saved' = todo guardado; 'dirty' = hay cambios sin
  // guardar; 'saving' = guardando ahora. `lastSavedRef` guarda la última versión
  // persistida (serializada) para no guardar si no cambió nada.
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving'>('saved');
  const lastSavedRef = useRef<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  /**
   * Modo del editor para plantillas FREE: 'simple' = formulario tonto;
   * 'advanced' = canvas designer. Si el layout trae `simpleLabel` arrancamos
   * en 'simple'; en otro caso en 'advanced'.
   */
  const [labelEditMode, setLabelEditMode] = useState<'simple' | 'advanced'>('simple');
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Overlay visual de arrastre (paleta / campos) que sigue al cursor.
  const [activeDrag, setActiveDrag] = useState<{ kind: 'palette' | 'field'; label: string } | null>(
    null,
  );
  // Líneas guía de alineación mientras se mueve un elemento.
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  // Menú contextual + portapapeles interno (elemento y estilo).
  const [ctxMenu, setCtxMenu] = useState<CtxTarget | null>(null);
  const [cssElementId, setCssElementId] = useState<string | null>(null);
  const [globalCssOpen, setGlobalCssOpen] = useState(false);
  const clipboardRef = useRef<CanvasElement | null>(null);
  const styleClipboardRef = useRef<ElementStyle | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (!rootRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      rootRef.current
        .requestFullscreen()
        .catch(() => toast.error(t('templates.designer.toast.fullscreenUnavailable')));
    }
  };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token ?? ''}`,
    'x-tenant-id': user?.tenantId ?? '',
    'Content-Type': 'application/json',
  };

  useEffect(() => {
    if (!id || !user?.tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = (await templatesApi.get(id)) as TemplateRow & {
          canvasLayout?: CanvasLayout | null;
        };
        if (cancelled) return;
        setTemplate(data);
        let initialLayout: CanvasLayout | null = null;
        if (data.canvasLayout && data.canvasLayout.version === 1) {
          initialLayout = data.canvasLayout;
          // Si el layout fue construido por el modo simple, abrimos en simple.
          setLabelEditMode((data.canvasLayout as any).simpleLabel ? 'simple' : 'advanced');
        } else if ((data as any).docType === 'LABEL') {
          // Etiqueta nueva → arrancamos en modo simple con defaults de artículo,
          // la ruta más rápida para tener una etiqueta funcional sin tocar el canvas.
          initialLayout = buildSimpleLabelLayout(defaultSimpleArticleSettings());
          setLabelEditMode('simple');
        } else if ((data as any).docType === 'FREE') {
          // Documento Libre nuevo → lienzo en blanco A4 en el diseñador avanzado;
          // se diseña desde cero, sin formulario de etiqueta.
          initialLayout = createEmptyLayout();
          setLabelEditMode('advanced');
        }
        if (initialLayout) {
          setLayout(initialLayout);
          // Marcamos esta versión como "guardada" para que el autoguardado no
          // dispare nada más abrir (solo tras una edición real).
          lastSavedRef.current = JSON.stringify(initialLayout);
          setSaveState('saved');
        }
      } catch {
        toast.error(t('templates.designer.toast.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.tenantId]);

  const handleBack = () => navigate('/document-templates');

  const handleSave = async (opts: { returnAfter?: boolean; silent?: boolean } = {}) => {
    if (!template) return;
    const snapshot = JSON.stringify(layout);
    setSaving(true);
    setSaveState('saving');
    try {
      const html = compileCanvas(layout, {
        docType: template.docType,
        extraCss: layout.customCss,
      });
      await templatesApi.update(template.id, {
        ...template,
        canvasLayout: layout,
        html,
        legacyHtml: false,
      });
      lastSavedRef.current = snapshot;
      // Si entretanto el usuario siguió editando, queda 'dirty'; si no, 'saved'.
      setSaveState(JSON.stringify(layout) === snapshot ? 'saved' : 'dirty');
      if (!opts.silent) toast.success(t('templates.designer.toast.saved'));
      if (opts.returnAfter) navigate('/document-templates');
    } catch {
      setSaveState('dirty');
      // El autoguardado no molesta con toasts; el manual sí avisa del fallo.
      if (!opts.silent) toast.error(t('templates.designer.toast.saveError'));
    } finally {
      setSaving(false);
    }
  };

  // Autoguardado: 1,5 s después del último cambio del layout. Solo si hay
  // cambios reales respecto a lo último guardado y no hay otro guardado en curso.
  useEffect(() => {
    if (loading || !template) return;
    if (JSON.stringify(layout) === lastSavedRef.current) {
      if (!saving) setSaveState('saved');
      return;
    }
    setSaveState('dirty');
    const handle = setTimeout(() => {
      if (!saving) handleSave({ silent: true });
    }, 1500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, loading, template]);

  // ---- Deshacer / Rehacer ----
  // Pilas de estados de `layout`. Una ráfaga de cambios (arrastre, tecleo) se
  // agrupa en un solo paso vía debounce: guardamos el estado PRE-ráfaga una vez.
  const pastRef = useRef<CanvasLayout[]>([]);
  const futureRef = useRef<CanvasLayout[]>([]);
  const prevLayoutRef = useRef<CanvasLayout>(layout);
  const pendingBeforeRef = useRef<CanvasLayout | null>(null);
  const histTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipHistoryRef = useRef(false);
  const [, setHistVer] = useState(0);
  const forceHist = () => setHistVer((v) => v + 1);

  const commitPending = () => {
    if (histTimerRef.current) {
      clearTimeout(histTimerRef.current);
      histTimerRef.current = null;
    }
    if (pendingBeforeRef.current) {
      pastRef.current.push(pendingBeforeRef.current);
      if (pastRef.current.length > 60) pastRef.current.shift();
      pendingBeforeRef.current = null;
    }
  };

  useEffect(() => {
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      prevLayoutRef.current = layout;
      return;
    }
    if (loading || !template) {
      prevLayoutRef.current = layout;
      return;
    }
    // Arranque de ráfaga: capturamos el estado previo una sola vez y limpiamos redo.
    if (!histTimerRef.current && !pendingBeforeRef.current) {
      pendingBeforeRef.current = prevLayoutRef.current;
      futureRef.current = [];
      forceHist();
    }
    if (histTimerRef.current) clearTimeout(histTimerRef.current);
    histTimerRef.current = setTimeout(() => {
      commitPending();
      forceHist();
    }, 500);
    prevLayoutRef.current = layout;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, loading, template]);

  const undo = () => {
    commitPending();
    if (pastRef.current.length === 0) return;
    const prev = pastRef.current.pop() as CanvasLayout;
    futureRef.current.push(prevLayoutRef.current);
    skipHistoryRef.current = true;
    prevLayoutRef.current = prev;
    setLayout(prev);
    setSelectedElementId(null);
    forceHist();
  };

  const redo = () => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current.pop() as CanvasLayout;
    pastRef.current.push(prevLayoutRef.current);
    skipHistoryRef.current = true;
    prevLayoutRef.current = next;
    setLayout(next);
    setSelectedElementId(null);
    forceHist();
  };

  const canUndo = pastRef.current.length > 0 || pendingBeforeRef.current != null;
  const canRedo = futureRef.current.length > 0;

  // Atajos de teclado (no interceptamos si el foco está en un input/edición de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as any;
    if (data?.action === 'create') {
      const item = PALETTE_ITEMS.find((p) => p.kind === data.kind);
      const label = item ? t(item.label) : String(data.kind);
      setActiveDrag({ kind: 'palette', label });
    } else if (data?.action === 'createField') {
      setActiveDrag({
        kind: 'field',
        label: data.descriptor?.label ?? t('templates.designer.palette.field'),
      });
    } else {
      setActiveDrag(null);
    }
  };

  const handleDragMove = (event: DragEndEvent) => {
    const data = event.active.data.current as any;
    if (data?.action !== 'move') return;
    const band = layout.bands.find((b) => b.id === data.bandId);
    const el = band?.elements.find((e) => e.id === data.elementId);
    if (!el) return;
    const projX = el.x + event.delta.x / PX_PER_MM;
    const projY = el.y + event.delta.y / PX_PER_MM;
    const snap = computeSnap(layout, data.bandId, el, projX, projY);
    setGuides({ v: snap.v, h: snap.h });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    setGuides({ v: [], h: [] });
    const { active, over, delta } = event;
    if (!over) return;
    const targetBandId = String(over.id);
    const data = active.data.current as
      | { action: 'create'; kind: ElementKind }
      | { action: 'createField'; descriptor: FieldDescriptor }
      | { action: 'move'; bandId: string; elementId: string }
      | undefined;
    if (!data) return;

    // ----- Crystal-style: arrastrar un campo del panel → elemento enlazado o columna -----
    if (data.action === 'createField') {
      const desc = data.descriptor;
      const activatorRect = event.over?.rect;
      const pointer = (event.activatorEvent as PointerEvent) ?? null;
      let xMm = 5;
      let yMm = 5;
      if (activatorRect && pointer) {
        xMm = Math.max(0, Math.round((pointer.clientX + delta.x - activatorRect.left) / PX_PER_MM));
        yMm = Math.max(0, Math.round((pointer.clientY + delta.y - activatorRect.top) / PX_PER_MM));
      }
      const targetBand = layout.bands.find((b) => b.id === targetBandId);
      // ¿Se soltó encima de una tabla de líneas? → añadir columna en vez de elemento.
      const overTable = targetBand?.elements.find(
        (e) =>
          e.kind === 'linesTable' &&
          xMm >= e.x &&
          xMm <= e.x + e.w &&
          yMm >= e.y &&
          yMm <= e.y + e.h,
      ) as LinesTableElement | undefined;

      if (overTable && desc.linePath) {
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
        setSelectedElementId(overTable.id);
        return;
      }

      // Si no, creamos un elemento `field` enlazado a la ruta absoluta.
      const size = DEFAULT_SIZE.field;
      if (targetBand) {
        const maxY = Math.max(0, targetBand.height - size.h);
        if (yMm > maxY) yMm = maxY;
      }
      const fieldEl = {
        id: genId('field'),
        kind: 'field' as const,
        x: xMm,
        y: yMm,
        w: size.w,
        h: size.h,
        path: desc.canvasPath,
        format: desc.format,
      } as CanvasElement;
      setLayout((prev) => ({
        ...prev,
        bands: prev.bands.map((b) =>
          b.id === targetBandId ? { ...b, elements: [...b.elements, fieldEl] } : b,
        ),
      }));
      setSelectedElementId(fieldEl.id);
      return;
    }

    if (data.action === 'create') {
      const activatorRect = event.over?.rect;
      const pointer = (event.activatorEvent as PointerEvent) ?? null;
      let xMm = 5;
      let yMm = 5;
      if (activatorRect && pointer) {
        const pxX = pointer.clientX + delta.x - activatorRect.left;
        const pxY = pointer.clientY + delta.y - activatorRect.top;
        xMm = Math.max(0, Math.round(pxX / PX_PER_MM));
        yMm = Math.max(0, Math.round(pxY / PX_PER_MM));
      }
      const size = DEFAULT_SIZE[data.kind];
      // Clamp para que el elemento no nazca fuera de la banda.
      const targetBand = layout.bands.find((b) => b.id === targetBandId);
      if (targetBand) {
        const maxY = Math.max(0, targetBand.height - size.h);
        if (yMm > maxY) yMm = maxY;
      }
      const newEl = buildDefaultElement(data.kind, xMm, yMm, size.w, size.h);
      setLayout((prev) => ({
        ...prev,
        bands: prev.bands.map((b) =>
          b.id === targetBandId ? { ...b, elements: [...b.elements, newEl] } : b,
        ),
      }));
      setSelectedElementId(newEl.id);
      return;
    }

    // Mover elemento existente: actualizar x,y (convertir delta px→mm) y, si la
    // banda destino difiere, moverlo de banda.
    const dxMm = Math.round(delta.x / PX_PER_MM);
    const dyMm = Math.round(delta.y / PX_PER_MM);
    // Si la banda destino es distinta de la origen, calculamos la `y` relativa
    // a la banda destino a partir del puntero (igual que al crear). Con la
    // fórmula antigua (y_origen + dy) el elemento podía caer fuera del alto
    // de la banda nueva — ej. al soltar en el pie de página — y quedar
    // recortado por `overflow:hidden`, pareciendo que "desaparecía".
    const isCrossBand = targetBandId !== data.bandId;
    const pointer = (event.activatorEvent as PointerEvent) ?? null;
    const dropRect = event.over?.rect;
    setLayout((prev) => {
      const sourceBand = prev.bands.find((b) => b.id === data.bandId);
      const targetBand = prev.bands.find((b) => b.id === targetBandId);
      const el = sourceBand?.elements.find((e) => e.id === data.elementId);
      if (!el) return prev;

      let newX = Math.max(0, el.x + dxMm);
      let newY = Math.max(0, el.y + dyMm);
      if (isCrossBand && dropRect && pointer) {
        const pxX = pointer.clientX + delta.x - dropRect.left;
        const pxY = pointer.clientY + delta.y - dropRect.top;
        newX = Math.max(0, Math.round(pxX / PX_PER_MM) - Math.round(el.w / 2));
        newY = Math.max(0, Math.round(pxY / PX_PER_MM) - Math.round(el.h / 2));
      }
      // Imantado a guías de alineación (bordes/centros de vecinos, márgenes,
      // centro de página/banda) al soltar.
      const snap = computeSnap(prev, targetBandId, el, newX, newY);
      newX = snap.x;
      newY = snap.y;
      // Clamp final para que el elemento no quede fuera de la banda destino.
      if (targetBand) {
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

  const [importOpen, setImportOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const handlePreview = async () => {
    if (!template) return;
    setPreviewLoading(true);
    try {
      const html = compileCanvas(layout, {
        docType: template.docType,
        extraCss: layout.customCss,
      });
      const { blob } = await templatesApi.previewPdf({
        html,
        docType: template.docType,
        queries: layout.queries ?? [],
        params: layout.testParams ?? {},
      });
      const url = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
    } catch (e) {
      toast.error(
        t('templates.designer.toast.previewFailed', {
          error: String(e instanceof Error ? e.message : undefined),
        }),
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(template?.name || t('templates.designer.exportFileName')).replace(/\s+/g, '_')}.canvas.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJsonFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.bands)) {
        throw new Error(t('templates.designer.toast.invalidFormat'));
      }
      setLayout(parsed as CanvasLayout);
      setSelectedElementId(null);
      toast.success(t('templates.designer.toast.layoutImported'));
    } catch (e) {
      toast.error(
        t('templates.designer.toast.importFailed', {
          error:
            (e instanceof Error ? e.message : undefined) ||
            t('templates.designer.toast.invalidJson'),
        }),
      );
    }
  };

  const handleImportFromTemplate = async (sourceId: string) => {
    try {
      const data = (await templatesApi.get(sourceId)) as TemplateRow & {
        canvasLayout?: CanvasLayout | null;
      };
      if (!data.canvasLayout || data.canvasLayout.version !== 1) {
        toast.error(t('templates.designer.toast.noCanvasLayout'));
        return;
      }
      setLayout(data.canvasLayout);
      setSelectedElementId(null);
      setImportOpen(false);
      toast.success(t('templates.designer.toast.importedFrom', { name: data.name }));
    } catch {
      toast.error(t('templates.designer.toast.importTemplateError'));
    }
  };

  const handleDeleteElement = (bandId: string, elementId: string) => {
    setLayout((prev) => ({
      ...prev,
      bands: prev.bands.map((b) =>
        b.id === bandId ? { ...b, elements: b.elements.filter((e) => e.id !== elementId) } : b,
      ),
    }));
    if (selectedElementId === elementId) setSelectedElementId(null);
  };

  const handleUpdateBand = (bandId: string, patch: Partial<Band>) => {
    setLayout((prev) => ({
      ...prev,
      bands: prev.bands.map((b) => (b.id === bandId ? { ...b, ...patch } : b)),
    }));
  };

  const handleAddBand = () => {
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
  };

  const handleDeleteBand = (bandId: string) => {
    setLayout((prev) => {
      const band = prev.bands.find((b) => b.id === bandId);
      // Si el elemento seleccionado vivía en esta banda, deseleccionamos.
      if (band && band.elements.some((e) => e.id === selectedElementId)) {
        setSelectedElementId(null);
      }
      return { ...prev, bands: prev.bands.filter((b) => b.id !== bandId) };
    });
  };

  const handleMoveBand = (bandId: string, dir: -1 | 1) => {
    setLayout((prev) => {
      const idx = prev.bands.findIndex((b) => b.id === bandId);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.bands.length) return prev;
      const bands = [...prev.bands];
      [bands[idx], bands[target]] = [bands[target], bands[idx]];
      return { ...prev, bands };
    });
  };

  const handleUpdatePage = (patch: Partial<CanvasLayout>) => {
    setLayout((prev) => ({ ...prev, ...patch }));
  };

  const handleUpdateElement = (elementId: string, patch: Partial<CanvasElement>) => {
    setLayout((prev) => ({
      ...prev,
      bands: prev.bands.map((b) => ({
        ...b,
        elements: b.elements.map((e) =>
          e.id === elementId ? ({ ...e, ...patch } as CanvasElement) : e,
        ),
      })),
    }));
  };

  const handleResizeElement = (elementId: string, newW: number, newH: number) => {
    setLayout((prev) => ({
      ...prev,
      bands: prev.bands.map((b) => ({
        ...b,
        elements: b.elements.map((e) =>
          e.id === elementId
            ? ({ ...e, w: Math.max(2, newW), h: Math.max(2, newH) } as CanvasElement)
            : e,
        ),
      })),
    }));
  };

  // ---- acciones del menú contextual (mutan `layout`) ----

  const findElement = (elementId: string): CanvasElement | null =>
    layout.bands.flatMap((b) => b.elements).find((e) => e.id === elementId) ?? null;

  const handleDuplicateElement = (bandId: string, elementId: string) => {
    setLayout((prev) => ({
      ...prev,
      bands: prev.bands.map((b) => {
        if (b.id !== bandId) return b;
        const idx = b.elements.findIndex((e) => e.id === elementId);
        if (idx < 0) return b;
        const clone = cloneElement(b.elements[idx]);
        const elements = [...b.elements];
        elements.splice(idx + 1, 0, clone); // tras el original → queda encima
        setSelectedElementId(clone.id);
        return { ...b, elements };
      }),
    }));
  };

  const handleCopyElement = (elementId: string) => {
    const el = findElement(elementId);
    if (el) clipboardRef.current = JSON.parse(JSON.stringify(el));
  };

  const handlePasteElement = (bandId: string, xMm?: number, yMm?: number) => {
    const src = clipboardRef.current;
    if (!src) return;
    const clone = cloneElement(src, 0, 0);
    if (xMm != null) clone.x = Math.max(0, Math.round(xMm));
    if (yMm != null) clone.y = Math.max(0, Math.round(yMm));
    setLayout((prev) => ({
      ...prev,
      bands: prev.bands.map((b) =>
        b.id === bandId ? { ...b, elements: [...b.elements, clone] } : b,
      ),
    }));
    setSelectedElementId(clone.id);
  };

  const handleZOrder = (bandId: string, elementId: string, mode: 'front' | 'back') => {
    setLayout((prev) => ({
      ...prev,
      bands: prev.bands.map((b) => {
        if (b.id !== bandId) return b;
        const el = b.elements.find((e) => e.id === elementId);
        if (!el) return b;
        const rest = b.elements.filter((e) => e.id !== elementId);
        // El orden del array = orden de pintado (el PDF no usa z-index): final = frente.
        return { ...b, elements: mode === 'front' ? [...rest, el] : [el, ...rest] };
      }),
    }));
  };

  const handleCopyStyle = (elementId: string) => {
    const el = findElement(elementId);
    styleClipboardRef.current = (el && 'style' in el ? el.style : undefined) ?? null;
  };

  const handlePasteStyle = (elementId: string) => {
    const s = styleClipboardRef.current;
    if (!s) return;
    handleUpdateElement(elementId, { style: { ...s } } as Partial<CanvasElement>);
  };

  const handleAddElementToBand = (bandId: string, kind: ElementKind, xMm: number, yMm: number) => {
    const size = DEFAULT_SIZE[kind];
    const newEl = buildDefaultElement(
      kind,
      Math.max(0, Math.round(xMm)),
      Math.max(0, Math.round(yMm)),
      size.w,
      size.h,
    );
    setLayout((prev) => ({
      ...prev,
      bands: prev.bands.map((b) =>
        b.id === bandId ? { ...b, elements: [...b.elements, newEl] } : b,
      ),
    }));
    setSelectedElementId(newEl.id);
  };

  const { pluginGroup, linePluginFields } = usePluginFields(template?.docType, headers);
  // Para FREE/LABEL no hay catálogo de documento: los campos salen de las
  // consultas SQL definidas (columnas) + params.
  const isFreeOrLabel = template?.docType === 'FREE' || template?.docType === 'LABEL';
  const { fieldGroups: queryFieldGroups, queryColumns } = useQueryFields(
    layout.queries,
    layout.testParams,
    headers,
    isFreeOrLabel,
  );
  const queryNames = (layout.queries ?? []).map((q) => q.name);
  // Campos arrastrables (estilo Crystal) para el panel lateral.
  const fieldDescriptors = buildFieldDescriptors({
    isFreeOrLabel,
    queryColumns,
    paramKeys: Object.keys(layout.testParams ?? {}),
    pluginGroup,
    linePluginFields,
  });

  const selectedElement =
    selectedElementId == null
      ? null
      : (layout.bands.flatMap((b) => b.elements).find((e) => e.id === selectedElementId) ?? null);

  // Elemento cuyo CSS se edita desde el menú contextual (modal a nivel padre).
  const cssElement = cssElementId ? findElement(cssElementId) : null;

  /** Construye las opciones del menú contextual según el objetivo. */
  const buildCtxItems = (tg: CtxTarget): ContextMenuItem[] => {
    const hasClip = !!clipboardRef.current;
    const hasStyleClip = !!styleClipboardRef.current;
    if (tg.scope === 'element') {
      const el = findElement(tg.elementId);
      const locked = !!el?.locked;
      const hidden = !!el?.hidden;
      const canStyle = !!el && 'style' in el;
      return [
        {
          label: t('templates.designer.ctx.duplicate'),
          icon: <Copy size={14} />,
          onClick: () => handleDuplicateElement(tg.bandId, tg.elementId),
        },
        {
          label: t('templates.designer.ctx.copy'),
          icon: <Copy size={14} />,
          onClick: () => handleCopyElement(tg.elementId),
        },
        {
          label: t('templates.designer.ctx.paste'),
          icon: <ClipboardPaste size={14} />,
          disabled: !hasClip,
          onClick: () => handlePasteElement(tg.bandId),
        },
        {
          label: t('templates.designer.ctx.copyStyle'),
          disabled: !canStyle,
          onClick: () => handleCopyStyle(tg.elementId),
        },
        {
          label: t('templates.designer.ctx.pasteStyle'),
          disabled: !hasStyleClip || !canStyle,
          onClick: () => handlePasteStyle(tg.elementId),
        },
        {
          label: t('templates.designer.ctx.bringToFront'),
          icon: <BringToFront size={14} />,
          separatorBefore: true,
          onClick: () => handleZOrder(tg.bandId, tg.elementId, 'front'),
        },
        {
          label: t('templates.designer.ctx.sendToBack'),
          icon: <SendToBack size={14} />,
          onClick: () => handleZOrder(tg.bandId, tg.elementId, 'back'),
        },
        {
          label: hidden ? t('templates.designer.ctx.show') : t('templates.designer.ctx.hide'),
          icon: hidden ? <Eye size={14} /> : <EyeOff size={14} />,
          separatorBefore: true,
          onClick: () => handleUpdateElement(tg.elementId, { hidden: !hidden }),
        },
        {
          label: locked ? t('templates.designer.ctx.unlock') : t('templates.designer.ctx.lock'),
          icon: locked ? <Unlock size={14} /> : <Lock size={14} />,
          onClick: () => handleUpdateElement(tg.elementId, { locked: !locked }),
        },
        {
          label: t('templates.designer.ctx.editCss'),
          icon: <Code size={14} />,
          onClick: () => setCssElementId(tg.elementId),
        },
        {
          label: t('templates.designer.ctx.delete'),
          icon: <Trash2 size={14} />,
          destructive: true,
          separatorBefore: true,
          onClick: () => handleDeleteElement(tg.bandId, tg.elementId),
        },
      ];
    }
    if (tg.scope === 'band') {
      return [
        {
          label: t('templates.designer.ctx.addElementHere'),
          icon: <Plus size={14} />,
          submenu: PALETTE_ITEMS.map((p) => ({
            label: t(p.label),
            onClick: () => handleAddElementToBand(tg.bandId, p.kind, tg.xMm, tg.yMm),
          })),
        },
        {
          label: t('templates.designer.ctx.paste'),
          icon: <ClipboardPaste size={14} />,
          disabled: !hasClip,
          onClick: () => handlePasteElement(tg.bandId, tg.xMm, tg.yMm),
        },
        {
          label: t('templates.designer.ctx.hideBand'),
          icon: <EyeOff size={14} />,
          separatorBefore: true,
          onClick: () => handleUpdateBand(tg.bandId, { hidden: true }),
        },
        {
          label: t('templates.designer.ctx.moveBandUp'),
          icon: <ChevronUp size={14} />,
          onClick: () => handleMoveBand(tg.bandId, -1),
        },
        {
          label: t('templates.designer.ctx.moveBandDown'),
          icon: <ChevronDown size={14} />,
          onClick: () => handleMoveBand(tg.bandId, 1),
        },
        {
          label: t('templates.designer.ctx.deleteSection'),
          icon: <Trash2 size={14} />,
          destructive: true,
          separatorBefore: true,
          disabled: layout.bands.find((b) => b.id === tg.bandId)?.kind !== 'custom',
          onClick: () => handleDeleteBand(tg.bandId),
        },
      ];
    }
    // canvas vacío
    return [
      {
        label: t('templates.designer.ctx.paste'),
        icon: <ClipboardPaste size={14} />,
        disabled: !hasClip,
        onClick: () => {
          const firstVisible = layout.bands.find((b) => !b.hidden);
          if (firstVisible) handlePasteElement(firstVisible.id, 5, 5);
        },
      },
      {
        label: t('templates.designer.ctx.editGlobalCss'),
        icon: <Code size={14} />,
        separatorBefore: true,
        onClick: () => setGlobalCssOpen(true),
      },
    ];
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        {t('templates.designer.loadingTemplate')}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="absolute inset-0 flex flex-col bg-slate-50 dark:bg-slate-950">
      <Toolbar
        title={template?.name ?? t('templates.designer.untitled')}
        onBack={handleBack}
        onSave={() => handleSave()}
        saving={saving}
        saveState={saveState}
        onToggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
        onExport={handleExportJson}
        onImport={handleImportJsonFile}
        onImportFromTemplate={() => setImportOpen(true)}
        onPreview={handlePreview}
        previewLoading={previewLoading}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />
      {(template as any)?.docType === 'LABEL' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-200 dark:border-purple-800/40 text-xs flex-wrap">
          <span className="font-bold text-purple-700 dark:text-purple-300">
            {t('templates.designer.label.mode')}
          </span>
          <div className="inline-flex rounded border border-purple-300 dark:border-purple-700 overflow-hidden">
            <button
              type="button"
              onClick={() => {
                if (labelEditMode === 'simple') return;
                if (!(layout as any).simpleLabel) {
                  // Sin simpleLabel no hay forma de mapear el layout al
                  // formulario → reconstruimos a defaults de artículo. Sin
                  // confirm para no asustar al usuario; lo importante es que
                  // el modo simple realmente funcione (el avanzado siempre
                  // está disponible para deshacer).
                  setLayout(buildSimpleLabelLayout(defaultSimpleArticleSettings()));
                  setSelectedElementId(null);
                }
                setLabelEditMode('simple');
              }}
              className={`px-3 py-1 ${labelEditMode === 'simple' ? 'bg-purple-600 text-white font-bold' : 'bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-200'}`}
            >
              {t('templates.designer.label.simple')}
            </button>
            <button
              type="button"
              onClick={() => setLabelEditMode('advanced')}
              className={`px-3 py-1 border-l border-purple-300 dark:border-purple-700 ${labelEditMode === 'advanced' ? 'bg-purple-600 text-white font-bold' : 'bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-200'}`}
            >
              {t('templates.designer.label.advanced')}
            </button>
          </div>
          {labelEditMode === 'advanced' && (
            <>
              <span className="font-bold text-purple-700 dark:text-purple-300 ml-2">
                {t('templates.designer.label.presets')}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (confirm(t('templates.designer.label.replaceArticleConfirm'))) {
                    setLayout(createLabelLayout());
                    setSelectedElementId(null);
                  }
                }}
                className="px-2 py-1 rounded border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/40"
              >
                {t('templates.designer.label.articleLabel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(t('templates.designer.label.replaceDocumentConfirm'))) {
                    setLayout(createDocumentLabelLayout());
                    setSelectedElementId(null);
                  }
                }}
                className="px-2 py-1 rounded border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/40"
              >
                {t('templates.designer.label.documentLabel')}
              </button>
            </>
          )}
        </div>
      )}
      {previewUrl && <PreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={buildCtxItems(ctxMenu)}
          onClose={() => setCtxMenu(null)}
        />
      )}
      <CssEditorModal
        open={globalCssOpen}
        value={layout.customCss ?? ''}
        onChange={(v) => handleUpdatePage({ customCss: v.trim() ? v : undefined })}
        onClose={() => setGlobalCssOpen(false)}
        title={t('templates.designer.css.globalTitle')}
        helpText={t('templates.designer.css.globalHelp')}
      />
      <CssEditorModal
        open={!!cssElement}
        value={cssElement?.customCss ?? ''}
        onChange={(v) =>
          cssElementId &&
          handleUpdateElement(cssElementId, {
            customCss: v.trim() ? v : undefined,
          } as Partial<CanvasElement>)
        }
        onClose={() => setCssElementId(null)}
        title={t('templates.designer.css.elementTitle')}
        helpText={t('templates.designer.css.elementHelp')}
      />
      {importOpen && (
        <ImportFromTemplateDialog
          currentId={template?.id}
          onClose={() => setImportOpen(false)}
          onPick={handleImportFromTemplate}
          headers={headers}
        />
      )}
      {(template as any)?.docType === 'LABEL' && labelEditMode === 'simple' ? (
        <div className="flex flex-1 min-h-0 bg-slate-50 dark:bg-slate-900">
          <div className="flex-1 min-h-0">
            <SimpleLabelEditor
              settings={(layout as any).simpleLabel ?? defaultSimpleArticleSettings()}
              onChange={(next) => {
                setLayout(next);
                setSelectedElementId(null);
              }}
            />
          </div>
          <CanvasArea
            layout={layout}
            selectedElementId={null}
            onSelectElement={() => {}}
            onDeleteElement={() => {}}
            onResizeBand={() => {}}
            onResizeElement={() => {}}
          />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setActiveDrag(null);
            setGuides({ v: [], h: [] });
          }}
        >
          <div className="flex flex-1 min-h-0">
            <PalettePanel />
            <FieldsPanel descriptors={fieldDescriptors} isFreeOrLabel={isFreeOrLabel} />
            <CanvasArea
              layout={layout}
              selectedElementId={selectedElementId}
              onSelectElement={setSelectedElementId}
              onDeleteElement={handleDeleteElement}
              onResizeBand={(id, h) => handleUpdateBand(id, { height: h })}
              onResizeElement={handleResizeElement}
              onContext={setCtxMenu}
              guides={guides}
            />
            <InspectorPanel
              element={selectedElement}
              onChange={handleUpdateElement}
              pluginGroup={pluginGroup}
              linePluginFields={linePluginFields}
              layout={layout}
              docType={template?.docType}
              queryFieldGroups={queryFieldGroups}
              queryColumns={queryColumns}
              queryNames={queryNames}
              onUpdatePage={handleUpdatePage}
              onUpdateBand={handleUpdateBand}
              onAddBand={handleAddBand}
              onDeleteBand={handleDeleteBand}
              onMoveBand={handleMoveBand}
            />
          </div>
          <DragOverlay dropAnimation={null}>
            {activeDrag ? (
              <div
                className={`px-2 py-1 rounded shadow-lg text-xs font-medium pointer-events-none ${
                  activeDrag.kind === 'field' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-white'
                }`}
              >
                {activeDrag.label}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
};

// ---------- toolbar ----------

interface ToolbarProps {
  title: string;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
  saveState: 'saved' | 'dirty' | 'saving';
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  onExport: () => void;
  onImport: (file: File) => void;
  onImportFromTemplate: () => void;
  onPreview: () => void;
  previewLoading: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const Toolbar: React.FC<ToolbarProps> = ({
  title,
  onBack,
  onSave,
  saving,
  saveState,
  onToggleFullscreen,
  isFullscreen,
  onExport,
  onImport,
  onImportFromTemplate,
  onPreview,
  previewLoading,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}) => {
  const { t } = useI18n();
  return (
    <header className="flex items-center gap-2 px-4 h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <button
        onClick={onBack}
        className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
        title={t('templates.designer.toolbar.back')}
      >
        <ArrowLeft size={18} />
      </button>
      <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{title}</div>
      <div className="flex-1" />
      <ToolbarButton
        icon={<Undo size={16} />}
        label={t('templates.designer.toolbar.undo')}
        disabled={!canUndo}
        onClick={onUndo}
      />
      <ToolbarButton
        icon={<Redo size={16} />}
        label={t('templates.designer.toolbar.redo')}
        disabled={!canRedo}
        onClick={onRedo}
      />
      <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
      <button
        type="button"
        onClick={onImportFromTemplate}
        title={t('templates.designer.toolbar.importFromTemplate')}
        className="flex items-center gap-1 px-2 py-1.5 rounded text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <FileUp size={16} />
      </button>
      <label
        title={t('templates.designer.toolbar.importJson')}
        className="flex items-center gap-1 px-2 py-1.5 rounded text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
      >
        <input
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              onImport(f);
              e.target.value = '';
            }
          }}
        />
        <FileUp size={16} className="opacity-60" />
        <span className="text-[10px]">JSON</span>
      </label>
      <button
        type="button"
        onClick={onExport}
        title={t('templates.designer.toolbar.exportJson')}
        className="flex items-center gap-1 px-2 py-1.5 rounded text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <FileDown size={16} />
        <span className="text-[10px]">JSON</span>
      </button>
      <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
      <button
        type="button"
        onClick={onPreview}
        disabled={previewLoading}
        title={t('templates.designer.toolbar.preview')}
        className="flex items-center gap-1 px-2 py-1.5 rounded text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
      >
        <Eye size={16} /> {previewLoading && <span className="text-[10px]">…</span>}
      </button>
      <button
        type="button"
        onClick={onToggleFullscreen}
        title={
          isFullscreen
            ? t('templates.designer.toolbar.exitFullscreen')
            : t('templates.designer.toolbar.fullscreen')
        }
        className="p-2 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>
      <span
        className={`text-[11px] mr-1 select-none ${
          saveState === 'saved'
            ? 'text-emerald-600 dark:text-emerald-400'
            : saveState === 'saving'
              ? 'text-slate-400'
              : 'text-amber-600 dark:text-amber-400'
        }`}
        title={t('templates.designer.toolbar.autosaveOn')}
      >
        {saveState === 'saving'
          ? t('templates.designer.toolbar.saving')
          : saveState === 'saved'
            ? t('templates.designer.toolbar.saved')
            : t('templates.designer.toolbar.unsaved')}
      </span>
      <button
        onClick={onSave}
        disabled={saving}
        title={t('templates.designer.toolbar.saveNow')}
        className="flex items-center gap-2 px-3 py-1.5 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        <Save size={16} />{' '}
        {saving ? t('templates.designer.toolbar.saving') : t('templates.designer.toolbar.save')}
      </button>
    </header>
  );
};

const PreviewModal: React.FC<{ url: string; onClose: () => void }> = ({ url, onClose }) => {
  const { t } = useI18n();
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-[min(900px,95vw)] h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 dark:text-slate-100">
            {t('templates.designer.previewModal.title')}
          </h2>
          <div className="flex items-center gap-2">
            <a
              href={url}
              download="preview.pdf"
              className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200"
            >
              {t('templates.designer.previewModal.download')}
            </a>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              ✕
            </button>
          </div>
        </div>
        <iframe
          src={url}
          className="flex-1 w-full"
          title={t('templates.designer.previewModal.iframeTitle')}
        />
      </div>
    </div>
  );
};

const ToolbarButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}> = ({ icon, label, disabled, onClick }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    title={label}
    className="flex items-center gap-1 px-2 py-1.5 rounded text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
  >
    {icon}
  </button>
);

// ---------- paleta ----------

const PalettePanel: React.FC = () => {
  const { t } = useI18n();
  return (
    <aside className="w-56 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto">
      <div className="px-3 py-2 text-xs uppercase tracking-wide font-bold text-slate-400">
        {t('templates.designer.palette.title')}
      </div>
      <ul className="px-2 pb-4 space-y-1">
        {PALETTE_ITEMS.map((it) => (
          <PaletteItem key={it.kind} kind={it.kind} label={t(it.label)} />
        ))}
      </ul>
    </aside>
  );
};

const PaletteItem: React.FC<{ kind: ElementKind; label: string }> = ({ kind, label }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${kind}`,
    data: { action: 'create', kind },
  });
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`px-3 py-2 rounded border border-dashed border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-200 cursor-grab select-none active:cursor-grabbing bg-white dark:bg-slate-800 ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      {label}
    </li>
  );
};

// ---------- panel de Campos (drag&drop estilo Crystal) ----------

/** Etiqueta corta y capitalizada a partir de un path (último segmento). */
function shortLabel(path: string): string {
  const seg = (path.split('.').pop() ?? path).replace(/_/g, ' ');
  return seg.charAt(0).toUpperCase() + seg.slice(1);
}

/** Adivina un formato de columna a partir del nombre (heurística ES/EN). */
function guessColumnFormat(
  name: string,
): 'currency' | 'date' | 'number' | 'percent' | 'address' | undefined {
  const n = name.toLowerCase();
  if (/(price|precio|total|amount|importe|subtotal|valor|coste|\bcost\b)/.test(n))
    return 'currency';
  if (/(date|fecha|expiry|caducidad|created|updated|vencimiento)/.test(n)) return 'date';
  if (/(qty|cantidad|quantity|stock|units|unidades|count|num|cant)/.test(n)) return 'number';
  return undefined;
}

/** Construye las columnas de una tabla a partir de los nombres de columna de una query. */
function columnsFromQueryCols(cols: string[]): LinesTableColumn[] {
  return cols.map((c) => ({
    id: genId('col'),
    label: shortLabel(c),
    path: c,
    widthPct: Math.round(100 / Math.max(cols.length, 1)),
    align: 'left',
    format: guessColumnFormat(c),
  }));
}

/**
 * Construye los campos arrastrables según el tipo de documento:
 *  - FREE/LABEL → columnas de las consultas (relativas para tablas, absolutas
 *    para el lienzo) + params.
 *  - Documento normal → campos de documento (lienzo) + campos de línea (tabla).
 */
function buildFieldDescriptors(args: {
  isFreeOrLabel: boolean;
  queryColumns: Record<string, string[]>;
  paramKeys: string[];
  pluginGroup: FieldGroup | null;
  linePluginFields: FieldDef[];
}): FieldDescriptor[] {
  const out: FieldDescriptor[] = [];
  if (args.isFreeOrLabel) {
    for (const [name, cols] of Object.entries(args.queryColumns)) {
      for (const c of cols) {
        out.push({
          key: `q-${name}-${c}`,
          label: c,
          group: t('templates.designer.fields.queryGroup', { name }),
          canvasPath: `queries.${name}.0.${c}`,
          linePath: c,
          lineSource: `query:${name}`,
        });
      }
    }
    for (const k of args.paramKeys) {
      out.push({
        key: `p-${k}`,
        label: k,
        group: t('templates.designer.fields.params'),
        canvasPath: `params.${k}`,
      });
    }
    return out;
  }
  const docGroups = args.pluginGroup
    ? [...getFieldGroupsForFieldElement('docHeader'), args.pluginGroup]
    : getFieldGroupsForFieldElement('docHeader');
  for (const g of docGroups) {
    for (const f of g.fields) {
      out.push({
        key: `d-${g.label}-${f.path}`,
        label: shortLabel(f.path),
        group: g.label,
        canvasPath: f.path,
        format: inferDefaultFormat(f),
      });
    }
  }
  const baseLine = getLineFieldGroup();
  const lineFields = baseLine
    ? [...baseLine.fields, ...args.linePluginFields]
    : args.linePluginFields;
  for (const f of lineFields) {
    out.push({
      key: `l-${f.path}`,
      label: shortLabel(f.path),
      group: t('templates.designer.fields.lines'),
      canvasPath: `lines.0.${f.path}`,
      linePath: f.path,
      format: inferDefaultFormat(f),
    });
  }
  return out;
}

const FieldsPanel: React.FC<{ descriptors: FieldDescriptor[]; isFreeOrLabel: boolean }> = ({
  descriptors,
  isFreeOrLabel,
}) => {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const nq = q.trim().toLowerCase();
  const filtered = nq
    ? descriptors.filter(
        (d) =>
          d.label.toLowerCase().includes(nq) ||
          d.canvasPath.toLowerCase().includes(nq) ||
          d.group.toLowerCase().includes(nq),
      )
    : descriptors;
  const groups = Array.from(new Set(filtered.map((d) => d.group)));
  return (
    <aside className="w-56 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto">
      <div className="px-3 py-2 text-xs uppercase tracking-wide font-bold text-slate-400">
        {t('templates.designer.fields.title')}
      </div>
      <div className="px-2 pb-1">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('templates.designer.fields.search')}
          className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
        />
      </div>
      {descriptors.length === 0 && (
        <div className="px-3 py-2 text-[11px] text-slate-400 italic leading-snug">
          {isFreeOrLabel
            ? t('templates.designer.fields.emptyFree')
            : t('templates.designer.fields.empty')}
        </div>
      )}
      {groups.map((g) => (
        <div key={g} className="pb-1">
          <div className="px-3 pt-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
            {g}
          </div>
          <ul className="px-2 space-y-1">
            {filtered
              .filter((d) => d.group === g)
              .map((d) => (
                <FieldChip key={d.key} descriptor={d} />
              ))}
          </ul>
        </div>
      ))}
      <div className="px-3 py-2 text-[10px] text-slate-400 leading-snug">
        {t('templates.designer.fields.dragHint')}
      </div>
    </aside>
  );
};

const FieldChip: React.FC<{ descriptor: FieldDescriptor }> = ({ descriptor }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `fld-${descriptor.key}`,
    data: { action: 'createField', descriptor },
  });
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      title={descriptor.canvasPath}
      className={`px-2 py-1 rounded border border-dashed border-slate-300 dark:border-slate-600 cursor-grab select-none active:cursor-grabbing bg-white dark:bg-slate-800 ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <span className="block text-xs text-slate-700 dark:text-slate-200 truncate">
        {descriptor.label}
      </span>
      <span className="block text-[9px] text-slate-400 font-mono truncate">
        {descriptor.linePath ?? descriptor.canvasPath}
      </span>
    </li>
  );
};

// ---------- canvas ----------

interface CanvasAreaProps {
  layout: CanvasLayout;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onDeleteElement: (bandId: string, elementId: string) => void;
  onResizeBand: (bandId: string, height: number) => void;
  onResizeElement: (elementId: string, w: number, h: number) => void;
  onContext?: (t: CtxTarget) => void;
  guides?: { v: number[]; h: number[] };
}

const CanvasArea: React.FC<CanvasAreaProps> = ({
  layout,
  selectedElementId,
  onSelectElement,
  onDeleteElement,
  onResizeBand,
  onResizeElement,
  onContext,
  guides,
}) => (
  <main
    className="flex-1 min-w-0 overflow-auto flex justify-center py-8 bg-slate-100 dark:bg-slate-900"
    onMouseDown={(e) => {
      // Deseleccionar al hacer click fuera de un elemento.
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
      className="relative bg-white dark:bg-slate-950 shadow-lg rounded overflow-hidden"
      style={(() => {
        const { width, height } = resolvePageDimensions(layout);
        return { width: `${width}mm`, minHeight: `${height}mm` };
      })()}
    >
      {layout.watermark?.enabled && layout.watermark.text && (
        <div
          className="absolute left-1/2 top-1/2 pointer-events-none select-none whitespace-nowrap"
          style={{
            color: layout.watermark.color ?? '#94a3b8',
            opacity: layout.watermark.opacity ?? 0.15,
            fontSize: `${layout.watermark.fontSize ?? 84}pt`,
            fontWeight: layout.watermark.fontWeight ?? 'bold',
            transform: `translate(-50%, -50%) rotate(${layout.watermark.rotation ?? -30}deg)`,
            zIndex: 0,
          }}
        >
          {layout.watermark.text}
        </div>
      )}
      {layout.bands
        .filter((b) => !b.hidden)
        .map((b) => (
          <BandSlot
            key={b.id}
            band={b}
            selectedElementId={selectedElementId}
            onSelectElement={onSelectElement}
            onDeleteElement={onDeleteElement}
            onResize={(h) => onResizeBand(b.id, h)}
            onResizeElement={onResizeElement}
            onContext={onContext}
          />
        ))}
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
  </main>
);

interface BandSlotProps {
  band: Band;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onDeleteElement: (bandId: string, elementId: string) => void;
  onResize: (heightMm: number) => void;
  onResizeElement: (elementId: string, w: number, h: number) => void;
  onContext?: (t: CtxTarget) => void;
}

const BandSlot: React.FC<BandSlotProps> = ({
  band,
  selectedElementId,
  onSelectElement,
  onDeleteElement,
  onResize,
  onResizeElement,
  onContext,
}) => {
  const { t } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: band.id });
  const handleResizeDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startH = band.height;
    const onMove = (ev: MouseEvent) => {
      const deltaMm = (ev.clientY - startY) / PX_PER_MM;
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
        const xMm = Math.max(0, (e.clientX - rect.left) / PX_PER_MM);
        const yMm = Math.max(0, (e.clientY - rect.top) / PX_PER_MM);
        onContext({ scope: 'band', x: e.clientX, y: e.clientY, bandId: band.id, xMm, yMm });
      }}
      className={`relative border-b border-dashed transition-colors ${
        isOver
          ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-400'
          : 'border-slate-200 dark:border-slate-700'
      }`}
      style={{ height: `${band.height}mm` }}
    >
      <div className="absolute top-1 left-2 text-[10px] uppercase tracking-wide font-bold text-slate-400 pointer-events-none z-10">
        {bandLabel(band)}
      </div>
      {band.elements.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 pointer-events-none">
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
          selected={el.id === selectedElementId}
          onSelect={() => onSelectElement(el.id)}
          onDelete={() => onDeleteElement(band.id, el.id)}
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
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onResize: (w: number, h: number) => void;
  onContext?: (t: CtxTarget) => void;
}

const ElementBox: React.FC<ElementBoxProps> = ({
  element,
  bandId,
  selected,
  onSelect,
  onDelete,
  onResize,
  onContext,
}) => {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `el-${element.id}`,
    data: { action: 'move', bandId, elementId: element.id },
    disabled: element.locked,
  });
  const startResize = (edge: 'e' | 's' | 'se') => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = element.w;
    const startH = element.h;
    const onMove = (ev: MouseEvent) => {
      const dxMm = (ev.clientX - startX) / PX_PER_MM;
      const dyMm = (ev.clientY - startY) / PX_PER_MM;
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
  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${element.x}mm`,
    top: `${element.y}mm`,
    width: `${element.w}mm`,
    height: `${element.h}mm`,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
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
        onSelect();
      }}
      onContextMenu={(e) => {
        if (!onContext) return;
        e.preventDefault();
        e.stopPropagation();
        onSelect(); // seleccionar primero → el menú actúa sobre este elemento
        onContext({ scope: 'element', x: e.clientX, y: e.clientY, bandId, elementId: element.id });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          onDelete();
        }
      }}
      tabIndex={0}
      style={style}
      className={`group rounded select-none outline-none touch-none overflow-visible ${
        locked ? 'cursor-default' : 'cursor-move'
      } ${
        selected
          ? 'ring-2 ring-blue-500'
          : 'ring-1 ring-slate-300 dark:ring-slate-600 hover:ring-slate-400'
      }`}
    >
      <div className="w-full h-full overflow-hidden rounded">
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

const ElementPreview: React.FC<{ element: CanvasElement }> = ({ element }) => {
  const { t } = useI18n();
  const s = element.style ?? {};
  const base: React.CSSProperties = {
    width: '100%',
    height: '100%',
    fontSize: s.fontSize ? `${s.fontSize}pt` : '10pt',
    color: s.color,
    fontWeight: s.fontWeight,
    fontStyle: s.fontStyle,
    textAlign: s.textAlign,
    fontFamily: s.fontFamily,
    backgroundColor: s.backgroundColor,
    border:
      s.borderStyle && s.borderStyle !== 'none'
        ? `${s.borderWidth ?? 1}px ${s.borderStyle} ${s.borderColor ?? '#000'}`
        : undefined,
    padding: s.padding ? `${s.padding}px` : '2px',
    display: 'flex',
    alignItems: 'center',
    justifyContent:
      s.textAlign === 'center' ? 'center' : s.textAlign === 'right' ? 'flex-end' : 'flex-start',
    overflow: 'hidden',
  };

  switch (element.kind) {
    case 'text':
      if (element.rich && element.text) {
        // Render como HTML para que se vea el formato (negritas/colores/...)
        // tal y como saldrá en el PDF. Confiamos en el HTML porque lo produce
        // nuestro propio editor de texto rico (whitelist de tags).
        return (
          <div
            style={base}
            className="whitespace-pre-wrap break-words"
            dangerouslySetInnerHTML={{ __html: element.text }}
          />
        );
      }
      return (
        <div style={base} className="whitespace-pre-wrap break-words">
          {element.text || (
            <span className="text-slate-400 italic">{t('templates.designer.preview.text')}</span>
          )}
        </div>
      );
    case 'image':
      return element.src ? (
        <img
          src={element.src}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: element.fit ?? 'contain' }}
          draggable={false}
        />
      ) : (
        <div style={base} className="text-slate-400 italic">
          🖼 {t('templates.designer.preview.pickImage')}
        </div>
      );
    case 'shape':
      if (element.shape === 'line') {
        return (
          <div
            style={{
              width: '100%',
              height: '100%',
              borderTop: `${s.borderWidth ?? 1}px ${s.borderStyle ?? 'solid'} ${s.borderColor ?? '#000'}`,
            }}
          />
        );
      }
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            border: `${s.borderWidth ?? 1}px ${s.borderStyle ?? 'solid'} ${s.borderColor ?? '#000'}`,
            backgroundColor: s.backgroundColor ?? 'transparent',
          }}
        />
      );
    case 'spacer':
      return (
        <div style={base} className="text-slate-300 italic">
          ␣
        </div>
      );
    case 'field':
      if (element.rich && (element.prefix || element.suffix)) {
        return (
          <div style={base} className="font-mono text-slate-700 dark:text-slate-300">
            {element.prefix && <span dangerouslySetInnerHTML={{ __html: element.prefix }} />}
            {`{{${element.path || t('templates.designer.preview.fieldPlaceholder')}}}`}
            {element.suffix && <span dangerouslySetInnerHTML={{ __html: element.suffix }} />}
          </div>
        );
      }
      return (
        <div style={base} className="font-mono text-slate-700 dark:text-slate-300">
          {element.prefix}
          {`{{${element.path || t('templates.designer.preview.fieldPlaceholder')}}}`}
          {element.suffix}
        </div>
      );
    case 'linesTable':
      if (element.layout === 'keyValue') {
        return (
          <div className="w-full h-full bg-white dark:bg-slate-800 p-1 text-[8pt] space-y-0.5 overflow-hidden">
            {element.columns.map((c) => (
              <div key={c.id} className="flex justify-between gap-2">
                <span className="text-slate-500 font-semibold">{c.label}</span>
                <span className="text-slate-400 italic font-mono">{`{{${c.path}}}`}</span>
              </div>
            ))}
          </div>
        );
      }
      return (
        <div className="w-full h-full bg-white dark:bg-slate-800 p-1">
          <table
            className={`w-full text-[8pt] border-collapse ${element.tableStyle === 'compact' ? 'leading-tight' : ''}`}
          >
            {element.showHeader !== false && (
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-700">
                  {element.columns.map((c) => {
                    const hs = c.headerStyle ?? c.style ?? {};
                    return (
                      <th
                        key={c.id}
                        style={{
                          width: `${c.widthPct}%`,
                          textAlign: c.align ?? 'left',
                          fontSize: hs.fontSize ? `${hs.fontSize}pt` : undefined,
                          fontWeight: hs.fontWeight,
                          fontStyle: hs.fontStyle,
                          color: hs.color,
                          fontFamily: hs.fontFamily,
                        }}
                        className="px-1 border-b border-slate-200 dark:border-slate-600 font-semibold"
                      >
                        {c.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
            )}
            <tbody>
              <tr>
                {element.columns.map((c) => {
                  const cs = c.style ?? {};
                  return (
                    <td
                      key={c.id}
                      style={{
                        textAlign: c.align ?? 'left',
                        fontSize: cs.fontSize ? `${cs.fontSize}pt` : undefined,
                        fontWeight: cs.fontWeight,
                        fontStyle: cs.fontStyle,
                        color: cs.color,
                        fontFamily: cs.fontFamily,
                      }}
                      className="px-1 text-slate-400 italic"
                    >
                      {`{{${c.path}}}`}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      );
    case 'totals':
      return (
        <div className="w-full h-full px-1 flex flex-col justify-end text-[9pt]">
          {element.showSubtotal !== false && (
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono text-slate-400">{`{{doc.subtotal}}`}</span>
            </div>
          )}
          {element.showTaxBreakdown !== false && (
            <div className="flex justify-between text-slate-500">
              <span>IVA …</span>
              <span className="font-mono text-slate-400">{`{{…}}`}</span>
            </div>
          )}
          {element.showTotal !== false && (
            <div className="flex justify-between border-t border-slate-400 mt-0.5 font-bold">
              <span>Total</span>
              <span className="font-mono">{`{{doc.total}}`}</span>
            </div>
          )}
        </div>
      );
    case 'qr':
      return (
        <div style={base} className="justify-center text-slate-400">
          <div className="w-full h-full border border-dashed border-slate-400 flex items-center justify-center text-[8pt]">
            QR
          </div>
        </div>
      );
    case 'barcode':
      return (
        <div style={base} className="justify-center text-slate-500 text-[8pt]">
          <div className="w-full h-full flex flex-col items-center justify-center">
            <div className="h-full w-full bg-[repeating-linear-gradient(90deg,#000_0_2px,transparent_2px_4px)]" />
            {element.includeText && <span className="font-mono">{`{{${element.value}}}`}</span>}
          </div>
        </div>
      );
    case 'signature':
      return (
        <div style={base} className="flex-col items-stretch text-[9pt]">
          <div className="flex-1 flex items-end border-b border-slate-700 dark:border-slate-300" />
          <div className="text-center text-[9pt] text-slate-600 dark:text-slate-300 pt-1">
            {element.label || 'Firma'}
          </div>
        </div>
      );
    case 'pageBreak':
      return (
        <div className="w-full h-full flex items-center justify-center gap-2 border-2 border-dashed border-rose-400 bg-rose-50/50 dark:bg-rose-900/20 rounded">
          <span className="text-[9pt] text-rose-600 dark:text-rose-300 font-semibold uppercase tracking-wider">
            ✂ Salto de página
          </span>
        </div>
      );
    case 'conditional': {
      const op = element.operator;
      const cmp =
        op === 'truthy'
          ? `${element.path} ✓`
          : op === 'falsy'
            ? `${element.path} ✗`
            : `${element.path} ${op} ${element.value ?? ''}`;
      return (
        <div style={base} className="flex-col items-stretch text-[9pt]">
          <div className="text-[8pt] text-slate-400 font-mono truncate">{`if ${cmp}`}</div>
          <div className="truncate text-slate-700 dark:text-slate-200">
            {element.thenText || <span className="italic text-slate-400">(then)</span>}
          </div>
          {element.elseText ? (
            <div className="truncate text-[8pt] text-slate-500">else: {element.elseText}</div>
          ) : null}
        </div>
      );
    }
    case 'divider': {
      const ds = element.style ?? {};
      const vertical = element.orientation === 'vertical';
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div
            style={{
              width: vertical ? 0 : '100%',
              height: vertical ? '100%' : 0,
              [vertical ? 'borderLeft' : 'borderTop']:
                `${ds.borderWidth ?? 1}px ${ds.borderStyle && ds.borderStyle !== 'none' ? ds.borderStyle : 'solid'} ${ds.borderColor ?? '#94a3b8'}`,
            }}
          />
        </div>
      );
    }
    case 'box':
      return (
        <div
          className="w-full h-full"
          style={{
            backgroundColor: s.backgroundColor ?? 'transparent',
            border:
              s.borderStyle && s.borderStyle !== 'none'
                ? `${s.borderWidth ?? 1}px ${s.borderStyle} ${s.borderColor ?? '#000'}`
                : '1px dashed #cbd5e1',
            borderRadius: s.borderRadius ? `${s.borderRadius}px` : undefined,
          }}
        />
      );
    case 'summary':
      return (
        <div style={base} className="font-mono text-slate-700 dark:text-slate-300">
          {element.prefix}
          {`Σ ${element.op}(${element.op === 'count' ? (element.source ?? 'lines') : (element.path ?? '')})`}
          {element.suffix}
        </div>
      );
    case 'list':
      return (
        <div style={base} className="text-[9pt] text-slate-500">
          <div className="flex gap-1">
            <span>{element.ordered || element.marker === 'number' ? '1.' : '•'}</span>
            <span className="font-mono text-slate-400 truncate">{`{{${element.itemPath || 'campo'}}}`}</span>
          </div>
          <div className="flex gap-1">
            <span>{element.ordered || element.marker === 'number' ? '2.' : '•'}</span>
            <span className="font-mono text-slate-400 truncate">{`{{${element.itemPath || 'campo'}}}`}</span>
          </div>
        </div>
      );
    case 'currentDate':
      return (
        <div style={base} className="text-slate-600 dark:text-slate-300">
          {element.prefix}
          {element.mode === 'datetime' ? '📅 dd/mm/aaaa hh:mm' : '📅 dd/mm/aaaa'}
        </div>
      );
  }
};

// ---------- inspector ----------

interface InspectorPanelProps {
  element: CanvasElement | null;
  onChange: (id: string, patch: Partial<CanvasElement>) => void;
  pluginGroup: FieldGroup | null;
  linePluginFields: FieldDef[];
  layout: CanvasLayout;
  docType?: string;
  queryFieldGroups: FieldGroup[];
  queryColumns: Record<string, string[]>;
  queryNames: string[];
  onUpdatePage: (patch: Partial<CanvasLayout>) => void;
  onUpdateBand: (bandId: string, patch: Partial<Band>) => void;
  onAddBand: () => void;
  onDeleteBand: (bandId: string) => void;
  onMoveBand: (bandId: string, dir: -1 | 1) => void;
}

const InspectorPanel: React.FC<InspectorPanelProps> = ({
  element,
  onChange,
  pluginGroup,
  linePluginFields,
  layout,
  docType,
  queryFieldGroups,
  queryColumns,
  queryNames,
  onUpdatePage,
  onUpdateBand,
  onAddBand,
  onDeleteBand,
  onMoveBand,
}) => {
  const { t } = useI18n();
  return (
    <aside className="w-80 shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto">
      <div className="px-3 py-2 text-xs uppercase tracking-wide font-bold text-slate-400">
        {t('templates.designer.inspector.title')}
      </div>
      {element ? (
        <ElementInspector
          element={element}
          onChange={onChange}
          pluginGroup={pluginGroup}
          linePluginFields={linePluginFields}
          docType={docType}
          queryFieldGroups={queryFieldGroups}
          queryColumns={queryColumns}
          queryNames={queryNames}
          layout={layout}
        />
      ) : (
        <PageInspector
          layout={layout}
          onUpdatePage={onUpdatePage}
          onUpdateBand={onUpdateBand}
          onAddBand={onAddBand}
          onDeleteBand={onDeleteBand}
          onMoveBand={onMoveBand}
        />
      )}
    </aside>
  );
};

const PageInspector: React.FC<{
  layout: CanvasLayout;
  onUpdatePage: (patch: Partial<CanvasLayout>) => void;
  onUpdateBand: (bandId: string, patch: Partial<Band>) => void;
  onAddBand: () => void;
  onDeleteBand: (bandId: string) => void;
  onMoveBand: (bandId: string, dir: -1 | 1) => void;
}> = ({ layout, onUpdatePage, onUpdateBand, onAddBand, onDeleteBand, onMoveBand }) => {
  const { t } = useI18n();
  const [cssOpen, setCssOpen] = useState(false);
  return (
    <div className="px-3 py-3 space-y-4 text-sm">
      <div className="text-[11px] uppercase tracking-wide font-bold text-slate-500">
        {t('templates.designer.page.title')}
      </div>
      <Section title={t('templates.designer.page.format')}>
        <Label>{t('templates.designer.common.size')}</Label>
        <Select
          options={[
            { value: 'A4', label: t(PAGE_SIZE_LABELS.A4) },
            { value: 'Letter', label: t(PAGE_SIZE_LABELS.Letter) },
            { value: 'Ticket80', label: t(PAGE_SIZE_LABELS.Ticket80) },
            { value: 'Ticket58', label: t(PAGE_SIZE_LABELS.Ticket58) },
            { value: 'Label100x62', label: t(PAGE_SIZE_LABELS.Label100x62) },
            { value: 'Label70x37', label: t(PAGE_SIZE_LABELS.Label70x37) },
            { value: 'Label50x25', label: t(PAGE_SIZE_LABELS.Label50x25) },
            { value: 'Custom', label: t(PAGE_SIZE_LABELS.Custom) },
          ]}
          value={layout.pageSize}
          onChange={(v) => onUpdatePage({ pageSize: v as PageSize })}
          ariaLabel={t('templates.designer.common.option')}
        />
        {layout.pageSize === 'Custom' && (
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label={t('templates.designer.common.widthMm')}
              value={layout.customWidthMm ?? 100}
              onChange={(v) => onUpdatePage({ customWidthMm: Math.max(10, v) })}
            />
            <NumberField
              label={t('templates.designer.common.heightMm')}
              value={layout.customHeightMm ?? 100}
              onChange={(v) => onUpdatePage({ customHeightMm: Math.max(10, v) })}
            />
          </div>
        )}
        <Label>{t('templates.designer.page.marginsMm')}</Label>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={t('templates.designer.page.top')}
            value={layout.margins.top}
            onChange={(v) => onUpdatePage({ margins: { ...layout.margins, top: v } })}
          />
          <NumberField
            label={t('templates.designer.page.right')}
            value={layout.margins.right}
            onChange={(v) => onUpdatePage({ margins: { ...layout.margins, right: v } })}
          />
          <NumberField
            label={t('templates.designer.page.bottom')}
            value={layout.margins.bottom}
            onChange={(v) => onUpdatePage({ margins: { ...layout.margins, bottom: v } })}
          />
          <NumberField
            label={t('templates.designer.page.left')}
            value={layout.margins.left}
            onChange={(v) => onUpdatePage({ margins: { ...layout.margins, left: v } })}
          />
        </div>
      </Section>
      <Section title={t('templates.designer.page.bands')}>
        {layout.bands.map((b, i) => (
          <div key={b.id} className={`flex items-center gap-1 ${b.hidden ? 'opacity-50' : ''}`}>
            {b.kind === 'custom' ? (
              <input
                value={b.label ?? ''}
                placeholder={t('templates.designer.bands.custom')}
                onChange={(e) => onUpdateBand(b.id, { label: e.target.value })}
                className="flex-1 min-w-0 px-1.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            ) : (
              <div className="flex-1 min-w-0 truncate text-xs text-slate-600 dark:text-slate-300">
                {bandLabel(b)}
              </div>
            )}
            <button
              type="button"
              title={
                b.hidden
                  ? t('templates.designer.page.showBand')
                  : t('templates.designer.ctx.hideBand')
              }
              onClick={() => onUpdateBand(b.id, { hidden: !b.hidden })}
              className="p-1 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {b.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              type="button"
              title={t('templates.designer.page.moveUp')}
              disabled={i === 0}
              onClick={() => onMoveBand(b.id, -1)}
              className="p-1 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              title={t('templates.designer.page.moveDown')}
              disabled={i === layout.bands.length - 1}
              onClick={() => onMoveBand(b.id, 1)}
              className="p-1 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
            >
              <ChevronDown size={14} />
            </button>
            <input
              type="number"
              min={0}
              value={b.height}
              onChange={(e) =>
                onUpdateBand(b.id, { height: Math.max(0, Number(e.target.value) || 0) })
              }
              className="w-14 px-1.5 py-1 text-xs text-right rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
            {b.kind === 'custom' && (
              <button
                type="button"
                title={t('templates.designer.ctx.deleteSection')}
                onClick={() => onDeleteBand(b.id)}
                className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={onAddBand}
          className="flex items-center gap-1 mt-1 px-2 py-1 text-xs rounded border border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Plus size={13} /> {t('templates.designer.page.addBand')}
        </button>
        <div className="pt-1 text-[11px] text-slate-400">
          {t('templates.designer.page.bandsTotal', {
            total: layout.bands.filter((b) => !b.hidden).reduce((a, b) => a + b.height, 0),
            usable:
              resolvePageDimensions(layout).height - layout.margins.top - layout.margins.bottom,
          })}
        </div>
      </Section>
      <WatermarkInspector
        watermark={layout.watermark}
        onChange={(w) => onUpdatePage({ watermark: w })}
      />
      <PageNumbersInspector
        value={layout.pageNumbers}
        onChange={(pn) => onUpdatePage({ pageNumbers: pn })}
      />
      <TraceabilityFooterInspector
        showDocQr={layout.showDocQr}
        showDocBarcode={layout.showDocBarcode}
        onChange={(v) => onUpdatePage(v)}
      />
      <QueriesInspector
        queries={layout.queries}
        testParams={layout.testParams ?? {}}
        paramsSchema={layout.paramsSchema}
        onChange={(q) => onUpdatePage({ queries: q })}
        onTestParamsChange={(p) => onUpdatePage({ testParams: p })}
      />
      <ParamsSchemaInspector
        queries={layout.queries}
        schema={layout.paramsSchema}
        onChange={(s) => onUpdatePage({ paramsSchema: s })}
      />
      <Section title={t('templates.designer.page.customCss')}>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
          {t('templates.designer.page.customCssHint')}{' '}
          <code>
            .mi-clase {'{'} color:red {'}'}
          </code>
          ).
        </p>
        <button
          type="button"
          onClick={() => setCssOpen(true)}
          className="flex items-center gap-2 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <Code size={14} /> {t('templates.designer.ctx.editGlobalCss')}
          {layout.customCss ? (
            <span className="text-emerald-600 dark:text-emerald-400">●</span>
          ) : null}
        </button>
      </Section>
      <div className="text-[11px] text-slate-400 italic">
        {t('templates.designer.page.selectElementHint')}
      </div>
      <CssEditorModal
        open={cssOpen}
        value={layout.customCss ?? ''}
        onChange={(v) => onUpdatePage({ customCss: v.trim() ? v : undefined })}
        onClose={() => setCssOpen(false)}
        title={t('templates.designer.css.globalTitle')}
        helpText={t('templates.designer.css.globalHelpLong')}
      />
    </div>
  );
};

// ---------- QueriesInspector: editor de consultas SQL (solo ADMIN/SUPERUSER) ----------

const QueriesInspector: React.FC<{
  queries: CanvasLayout['queries'];
  testParams: Record<string, unknown>;
  paramsSchema?: ParamDef[];
  onChange: (q: CanvasLayout['queries']) => void;
  onTestParamsChange: (p: Record<string, unknown>) => void;
}> = ({ queries, testParams, paramsSchema, onChange, onTestParamsChange }) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERUSER';
  const list = queries ?? [];

  if (!isAdmin && list.length === 0) {
    // Para roles no admin ocultamos la sección salvo que la plantilla ya traiga
    // consultas (en ese caso se ve en modo lectura para dar contexto).
    return null;
  }

  const setList = (next: NonNullable<CanvasLayout['queries']>) => {
    onChange(next.length === 0 ? undefined : next);
  };
  const updateAt = (idx: number, patch: Partial<{ name: string; sql: string }>) => {
    setList(list.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };
  const removeAt = (idx: number) => setList(list.filter((_, i) => i !== idx));
  const add = () =>
    setList([...list, { name: `consulta${list.length + 1}`, sql: 'SELECT 1 AS valor' }]);

  return (
    <Section title={t('templates.designer.queries.title')}>
      {!isAdmin && (
        <div className="text-[11px] text-amber-600 dark:text-amber-400">
          {t('templates.designer.queries.readOnly')}
        </div>
      )}
      <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
        {t('templates.designer.queries.hint1')}{' '}
        <code className="px-1 rounded bg-slate-100 dark:bg-slate-800">
          queries.{t('templates.designer.queries.nameUpper')}
        </code>
        . {t('templates.designer.queries.hint2')} <code>SELECT</code> / <code>WITH</code>.
        Placeholders: <code>:docId</code>, <code>:partnerId</code>, <code>:companyId</code>,{' '}
        <code>:tenantId</code>.
      </div>
      {list.map((q, idx) => (
        <QueryEditor
          key={idx}
          query={q}
          testParams={testParams}
          readOnly={!isAdmin}
          onChange={(p) => updateAt(idx, p)}
          onRemove={() => removeAt(idx)}
        />
      ))}
      {isAdmin && (
        <button
          type="button"
          onClick={add}
          className="text-[11px] px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600"
        >
          + {t('templates.designer.queries.add')}
        </button>
      )}
      {list.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
          <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-2">
            {t('templates.designer.queries.testParams')}
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500 mb-2">
            {t('templates.designer.queries.testParamsHint1')} <code>:xxx</code>{' '}
            {t('templates.designer.queries.testParamsHint2')}
          </div>
          <TestParamsEditor
            queries={queries}
            value={testParams}
            onChange={onTestParamsChange}
            readOnly={!isAdmin}
            labels={Object.fromEntries(
              (paramsSchema ?? []).filter((p) => p.label).map((p) => [p.name, p.label as string]),
            )}
          />
        </div>
      )}
    </Section>
  );
};

const QueryEditor: React.FC<{
  query: { name: string; sql: string };
  testParams: Record<string, unknown>;
  readOnly: boolean;
  onChange: (p: Partial<{ name: string; sql: string }>) => void;
  onRemove: () => void;
}> = ({ query, testParams, readOnly, onChange, onRemove }) => {
  const { t } = useI18n();
  const [result, setResult] = useState<
    | { ok: true; rows: unknown[]; rowCount: number; truncated: boolean }
    | { ok: false; error: string }
    | null
  >(null);
  const [testing, setTesting] = useState(false);

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const body: any = await templatesApi.testQuery({
        name: query.name,
        sql: query.sql,
        params: testParams,
      });
      if (body?.ok === false) {
        setResult({ ok: false, error: body.error || t('templates.designer.queries.queryError') });
      } else {
        setResult({
          ok: true,
          rows: body.rows ?? [],
          rowCount: body.rowCount ?? 0,
          truncated: body.truncated ?? false,
        });
      }
    } catch (e) {
      setResult({
        ok: false,
        error:
          (e instanceof Error ? (e instanceof Error ? e.message : undefined) : undefined) ||
          t('templates.designer.queries.networkError'),
      });
    } finally {
      setTesting(false);
    }
  };

  const [editorOpen, setEditorOpen] = useState(false);
  const lineCount = (query.sql.match(/\n/g)?.length ?? 0) + 1;
  const preview = query.sql.split('\n').slice(0, 3).join('\n');
  return (
    <div className="p-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 space-y-1.5">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={query.name}
          onChange={(e) => onChange({ name: e.target.value })}
          disabled={readOnly}
          placeholder={t('templates.designer.queries.namePlaceholder')}
          className="flex-1 px-2 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
        />
        {!readOnly && (
          <button
            type="button"
            onClick={onRemove}
            className="text-[11px] px-1.5 py-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
            title={t('templates.designer.queries.remove')}
          >
            ✕
          </button>
        )}
      </div>
      <div
        onClick={() => !readOnly && setEditorOpen(true)}
        className={`p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-[11px] leading-snug whitespace-pre overflow-hidden text-slate-700 dark:text-slate-200 ${
          !readOnly ? 'cursor-pointer hover:border-blue-400' : ''
        }`}
        title={
          readOnly
            ? t('templates.designer.queries.readOnlyShort')
            : t('templates.designer.queries.clickToOpen')
        }
      >
        {preview || <span className="text-slate-400 italic">SELECT * FROM …</span>}
        {lineCount > 3 && (
          <div className="text-[10px] text-slate-400">
            {t('templates.designer.queries.moreLines', { count: lineCount - 3 })}
          </div>
        )}
      </div>
      {!readOnly && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            className="text-[11px] px-2 py-1 rounded bg-slate-700 hover:bg-slate-800 text-white"
          >
            ✎ {t('templates.designer.queries.sqlEditor')}
          </button>
          <button
            type="button"
            onClick={runTest}
            disabled={testing}
            className="text-[11px] px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          >
            {testing
              ? t('templates.designer.queries.testing')
              : t('templates.designer.queries.test')}
          </button>
          {result && result.ok && (
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
              {t('templates.designer.queries.rows', { count: result.rowCount ?? 0 })}
              {result.truncated ? t('templates.designer.queries.truncated') : ''}
            </span>
          )}
          {result && result.ok === false && (
            <span className="text-[11px] text-red-500" title={result.error}>
              ⚠ {result.error.slice(0, 60)}
            </span>
          )}
        </div>
      )}
      <SqlEditorModal
        open={editorOpen}
        title={t('templates.designer.queries.editorTitle', { name: query.name })}
        queryName={query.name}
        initialSql={query.sql}
        onSave={(v) => onChange({ sql: v })}
        onClose={() => setEditorOpen(false)}
      />
      {result && result.ok && result.rows.length > 0 && (
        <div className="max-h-40 overflow-auto border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900">
          <table className="w-full text-[10px] font-mono">
            <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
              <tr>
                {Object.keys((result.rows[0] as Record<string, unknown>) ?? {}).map((k) => (
                  <th key={k} className="px-1.5 py-1 text-left font-semibold">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.slice(0, 20).map((row, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                  {Object.values(row as Record<string, unknown>).map((v, j) => (
                    <td key={j} className="px-1.5 py-1 truncate max-w-[120px]">
                      {v == null ? (
                        <span className="text-slate-400 italic">null</span>
                      ) : typeof v === 'object' ? (
                        JSON.stringify(v)
                      ) : (
                        String(v)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/**
 * Editor de "Parámetros de prueba" DIRIGIDO POR PLACEHOLDERS: muestra un campo de
 * valor por cada placeholder `:nombre` detectado en las queries (∪ las claves ya
 * presentes en `value`). El nombre NO se edita (es etiqueta), por lo que la key de
 * React es estable y no se pierde el foco al teclear. Estos valores los usan tanto
 * el botón "Probar" como la preview 👁.
 */
const TestParamsEditor: React.FC<{
  queries: CanvasLayout['queries'];
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  readOnly: boolean;
  labels?: Record<string, string>;
}> = ({ queries, value, onChange, readOnly, labels }) => {
  const { t } = useI18n();
  const detected = extractPlaceholders(queries);
  // Unión de los placeholders detectados y las claves ya guardadas (para no
  // perder valores de un placeholder que se quitó temporalmente de la query).
  const names = Array.from(new Set([...detected, ...Object.keys(value)]));

  const setVal = (name: string, v: string) => onChange({ ...value, [name]: v });
  const remove = (name: string) => {
    const next = { ...value };
    delete next[name];
    onChange(next);
  };

  if (names.length === 0) {
    return (
      <div className="text-[10px] text-slate-400 italic">
        {t('templates.designer.testParams.none')} <code>:xxx</code>
        {t('templates.designer.testParams.noneSuffix')}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {names.map((name) => {
        const isDetected = detected.includes(name);
        return (
          <div key={name} className="flex items-center gap-2">
            <span
              className="w-28 shrink-0 truncate text-[10px] text-slate-500 dark:text-slate-400"
              title={`:${name}`}
            >
              {labels?.[name] ?? name}
            </span>
            <input
              type="text"
              value={String(value[name] ?? '')}
              onChange={(e) => setVal(name, e.target.value)}
              disabled={readOnly}
              placeholder={t('templates.designer.testParams.valuePlaceholder')}
              className="flex-1 min-w-0 px-2 py-1 text-[10px] font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
            {!readOnly && !isDetected && (
              <button
                type="button"
                title={t('templates.designer.testParams.removeOrphan')}
                onClick={() => remove(name)}
                className="text-[10px] px-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ---------- ParamsSchemaInspector: metadata de los parámetros de entrada ----------
// Define cómo se pide cada placeholder de las queries al GENERAR el documento
// (etiqueta, tipo de campo, obligatorio, valor por defecto). Solo admin.

const ParamsSchemaInspector: React.FC<{
  queries: CanvasLayout['queries'];
  schema: ParamDef[] | undefined;
  onChange: (s: ParamDef[] | undefined) => void;
}> = ({ queries, schema, onChange }) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERUSER';
  const detected = extractPlaceholders(queries);
  if (!isAdmin || detected.length === 0) return null;

  const byName = new Map((schema ?? []).map((p) => [p.name, p]));
  const update = (name: string, patch: Partial<ParamDef>) => {
    // Reconstruimos el schema con todos los placeholders detectados, aplicando
    // el patch al que cambia y conservando la metadata del resto.
    const next = detected.map((n) => {
      const base = byName.get(n) ?? { name: n };
      return n === name ? { ...base, ...patch, name: n } : base;
    });
    onChange(next);
  };

  return (
    <Section title={t('templates.designer.paramsSchema.title')}>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
        {t('templates.designer.paramsSchema.hint1')}{' '}
        <strong>{t('templates.designer.paramsSchema.hintGenerate')}</strong>{' '}
        {t('templates.designer.paramsSchema.hint2')}
      </p>
      {detected.map((name) => {
        const p = byName.get(name) ?? { name };
        return (
          <div
            key={name}
            className="p-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 space-y-1.5"
          >
            <div className="font-mono text-[11px] text-slate-500">:{name}</div>
            <input
              value={p.label ?? ''}
              onChange={(e) => update(name, { label: e.target.value || undefined })}
              placeholder={t('templates.designer.paramsSchema.labelPlaceholder')}
              className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
            <div className="grid grid-cols-2 gap-1">
              <Select
                options={[
                  { value: 'text', label: t('templates.designer.opt.text') },
                  { value: 'number', label: t('templates.designer.opt.number') },
                  { value: 'date', label: t('templates.designer.opt.date') },
                  { value: 'select', label: t('templates.designer.opt.select') },
                  { value: 'multiselect', label: t('templates.designer.opt.multiselect') },
                ]}
                value={p.type ?? 'text'}
                onChange={(v) => update(name, { type: v as ParamDef['type'] })}
                className="text-xs"
                ariaLabel={t('templates.designer.common.option')}
              />
              <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={!!p.required}
                  onChange={(e) => update(name, { required: e.target.checked })}
                />
                {t('templates.designer.paramsSchema.required')}
              </label>
            </div>
            <input
              value={p.default ?? ''}
              onChange={(e) => update(name, { default: e.target.value || undefined })}
              placeholder={t('templates.designer.paramsSchema.defaultPlaceholder')}
              className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
            {(p.type === 'select' || p.type === 'multiselect') && (
              <>
                <input
                  value={(p.options ?? []).join(', ')}
                  onChange={(e) =>
                    update(name, {
                      options: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder={t('templates.designer.paramsSchema.optionsPlaceholder')}
                  className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
                <Textarea
                  value={p.optionsQuery ?? ''}
                  onChange={(e) => update(name, { optionsQuery: e.target.value || undefined })}
                  placeholder={t('templates.designer.paramsSchema.optionsQueryPlaceholder')}
                  rows={2}
                  className="text-[11px] font-mono"
                />
                <div className="text-[10px] text-slate-400 leading-snug">
                  {t('templates.designer.paramsSchema.optionsQueryHint1')} <code>value</code>{' '}
                  {t('templates.designer.paramsSchema.optionsQueryHintAnd')} <code>label</code> (
                  {t('templates.designer.paramsSchema.eg')}{' '}
                  <code>SELECT id AS value, name AS label FROM "Warehouse" ORDER BY name</code>).
                </div>
              </>
            )}
          </div>
        );
      })}
    </Section>
  );
};

const PageNumbersInspector: React.FC<{
  value: CanvasLayout['pageNumbers'];
  onChange: (v: CanvasLayout['pageNumbers']) => void;
}> = ({ value, onChange }) => {
  const { t } = useI18n();
  const v = value ?? { enabled: false, alignment: 'center' as const };
  const patch = (p: Partial<NonNullable<CanvasLayout['pageNumbers']>>) => onChange({ ...v, ...p });
  return (
    <Section title={t('templates.designer.pageNumbers.title')}>
      <Toggle
        label={t('templates.designer.pageNumbers.show')}
        checked={v.enabled}
        onChange={(enabled) => patch({ enabled })}
      />
      {v.enabled && (
        <>
          <Label>{t('templates.designer.common.alignment')}</Label>
          <Select
            options={[
              { value: 'left', label: t('templates.designer.opt.left') },
              { value: 'center', label: t('templates.designer.opt.center') },
              { value: 'right', label: t('templates.designer.opt.right') },
            ]}
            value={v.alignment ?? 'center'}
            onChange={(v) => patch({ alignment: v as any })}
            ariaLabel={t('templates.designer.common.option')}
          />
          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            {t('templates.designer.pageNumbers.hint')}
          </div>
        </>
      )}
    </Section>
  );
};

const TraceabilityFooterInspector: React.FC<{
  showDocQr?: boolean;
  showDocBarcode?: boolean;
  onChange: (v: { showDocQr?: boolean; showDocBarcode?: boolean }) => void;
}> = ({ showDocQr, showDocBarcode, onChange }) => {
  const { t } = useI18n();
  return (
    <Section title={t('templates.designer.traceability.title')}>
      <Toggle
        label={t('templates.designer.traceability.showQr')}
        checked={showDocQr === true}
        onChange={(v) => onChange({ showDocQr: v })}
      />
      <Toggle
        label={t('templates.designer.traceability.showBarcode')}
        checked={showDocBarcode === true}
        onChange={(v) => onChange({ showDocBarcode: v })}
      />
      {(showDocQr || showDocBarcode) && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
          {t('templates.designer.traceability.hint')}
        </div>
      )}
    </Section>
  );
};

const WatermarkInspector: React.FC<{
  watermark: CanvasLayout['watermark'];
  onChange: (w: CanvasLayout['watermark']) => void;
}> = ({ watermark, onChange }) => {
  const { t } = useI18n();
  const w = watermark ?? {
    enabled: false,
    text: 'BORRADOR',
    color: '#94a3b8',
    opacity: 0.15,
    rotation: -30,
    fontSize: 84,
    fontWeight: 'bold' as const,
  };
  const patch = (p: Partial<NonNullable<CanvasLayout['watermark']>>) => onChange({ ...w, ...p });
  return (
    <Section title={t('templates.designer.watermark.title')}>
      <Toggle
        label={t('templates.designer.watermark.enable')}
        checked={w.enabled}
        onChange={(v) => patch({ enabled: v })}
      />
      {w.enabled && (
        <>
          <Label>{t('templates.designer.common.text')}</Label>
          <input
            type="text"
            value={w.text}
            onChange={(e) => patch({ text: e.target.value })}
            placeholder={t('templates.designer.watermark.textPlaceholder')}
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('templates.designer.common.color')}
              </div>
              <input
                type="color"
                value={w.color ?? '#94a3b8'}
                onChange={(e) => patch({ color: e.target.value })}
                className="h-8 w-full rounded border border-slate-200 dark:border-slate-700"
              />
            </label>
            <label className="block">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('templates.designer.common.sizePt')}
              </div>
              <input
                type="number"
                min={10}
                max={300}
                value={w.fontSize ?? 84}
                onChange={(e) => patch({ fontSize: Number(e.target.value) || 84 })}
                className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('templates.designer.common.rotationDeg')}
              </div>
              <input
                type="number"
                min={-180}
                max={180}
                value={w.rotation ?? -30}
                onChange={(e) => patch({ rotation: Number(e.target.value) || 0 })}
                className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </label>
            <label className="block">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('templates.designer.watermark.opacity')}
              </div>
              <input
                type="number"
                step={0.05}
                min={0}
                max={1}
                value={w.opacity ?? 0.15}
                onChange={(e) =>
                  patch({
                    opacity: Math.max(0, Math.min(1, Number(e.target.value) || 0)),
                  })
                }
                className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </label>
          </div>
          <Toggle
            label={t('templates.designer.common.bold')}
            checked={w.fontWeight === 'bold'}
            onChange={(v) => patch({ fontWeight: v ? 'bold' : 'normal' })}
          />
        </>
      )}
    </Section>
  );
};

/** Selector reutilizable de Fuente de datos + Columna (Resumen, Lista). */
const SourceColumnPicker: React.FC<{
  source?: string;
  path?: string;
  onSource: (s: string | undefined) => void;
  onPath: (p: string | undefined) => void;
  showPath?: boolean;
  pathLabel?: string;
  queryNames: string[];
  queryColumns: Record<string, string[]>;
}> = ({ source, path, onSource, onPath, showPath = true, pathLabel, queryNames, queryColumns }) => {
  const { t } = useI18n();
  const queryName = source && source.startsWith('query:') ? source.slice('query:'.length) : null;
  const cols = queryName ? (queryColumns[queryName] ?? []) : [];
  return (
    <>
      <Label>{t('templates.designer.source.title')}</Label>
      <Select
        options={[
          { value: '', label: t('templates.designer.source.docLines') },
          ...queryNames.map((n) => ({
            value: `query:${n}`,
            label: t('templates.designer.fields.queryGroup', { name: n }),
          })),
        ]}
        value={source ?? ''}
        onChange={(v) => onSource(v || undefined)}
        ariaLabel={t('templates.designer.source.title')}
      />
      {showPath && (
        <>
          <Label>{pathLabel ?? t('templates.designer.source.column')}</Label>
          <input
            value={path ?? ''}
            onChange={(e) => onPath(e.target.value || undefined)}
            placeholder={
              queryName ? t('templates.designer.source.columnPlaceholder') : 'itemName / lineTotal'
            }
            className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          />
          {cols.length > 0 && (
            <Select
              options={[
                { value: '', label: t('templates.designer.source.pickColumn') },
                ...cols.map((c) => ({ value: c, label: c })),
              ]}
              value=""
              onChange={(v) => v && onPath(v)}
              className="text-xs"
              ariaLabel={t('templates.designer.source.column')}
            />
          )}
        </>
      )}
    </>
  );
};

const ElementInspector: React.FC<{
  element: CanvasElement;
  onChange: (id: string, patch: Partial<CanvasElement>) => void;
  pluginGroup: FieldGroup | null;
  linePluginFields: FieldDef[];
  docType?: string;
  queryFieldGroups: FieldGroup[];
  queryColumns: Record<string, string[]>;
  queryNames: string[];
  layout: CanvasLayout;
}> = ({
  element,
  onChange,
  pluginGroup,
  linePluginFields,
  docType,
  queryFieldGroups,
  queryColumns,
  queryNames,
  layout,
}) => {
  const { t } = useI18n();
  const patch = (p: Partial<CanvasElement>) => onChange(element.id, p);
  // Dimensiones útiles para los botones "ocupar": ancho de página menos
  // márgenes y alto de la banda que contiene al elemento.
  const usableWidth = Math.max(
    10,
    resolvePageDimensions(layout).width - layout.margins.left - layout.margins.right,
  );
  const ownBand = layout.bands.find((b) => b.elements.some((e) => e.id === element.id));
  const fitWidth = () => patch({ x: layout.margins.left, w: Math.round(usableWidth) } as any);
  const fitBand = () =>
    patch({
      x: layout.margins.left,
      y: 0,
      w: Math.round(usableWidth),
      h: ownBand ? ownBand.height : element.h,
    } as any);
  const [cssOpen, setCssOpen] = useState(false);
  const isFreeOrLabel = docType === 'FREE' || docType === 'LABEL';
  // FREE/LABEL no tienen documento ligado: su catálogo son las columnas de las
  // consultas SQL + params. El resto de tipos usa el catálogo de documento.
  const fieldGroups = isFreeOrLabel
    ? queryFieldGroups
    : pluginGroup
      ? [...getFieldGroupsForFieldElement('docHeader'), pluginGroup]
      : getFieldGroupsForFieldElement('docHeader');
  return (
    <div className="px-3 py-3 space-y-4 text-sm">
      <div className="text-[11px] uppercase tracking-wide font-bold text-slate-500">
        {element.kind}
      </div>

      {/* Geometría común */}
      <Section title={t('templates.designer.el.geometry')}>
        <NumberGrid>
          <NumberField label="X (mm)" value={element.x} onChange={(v) => patch({ x: v } as any)} />
          <NumberField label="Y (mm)" value={element.y} onChange={(v) => patch({ y: v } as any)} />
          <NumberField
            label={t('templates.designer.common.widthMm')}
            value={element.w}
            onChange={(v) => patch({ w: Math.max(1, v) } as any)}
          />
          <NumberField
            label={t('templates.designer.common.heightMm')}
            value={element.h}
            onChange={(v) => patch({ h: Math.max(1, v) } as any)}
          />
        </NumberGrid>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={fitWidth}
            className="flex-1 px-2 py-1 text-[11px] rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700"
            title={t('templates.designer.el.fitWidthTitle')}
          >
            {t('templates.designer.el.fitWidth')}
          </button>
          <button
            type="button"
            onClick={fitBand}
            disabled={!ownBand}
            className="flex-1 px-2 py-1 text-[11px] rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40"
            title={t('templates.designer.el.fitBandTitle')}
          >
            {t('templates.designer.el.fitBand')}
          </button>
        </div>
      </Section>

      {/* Props específicas por tipo */}
      {element.kind === 'text' && (
        <Section title={t('templates.designer.el.content')}>
          {element.rich && !element.raw ? (
            <RichTextEditor
              value={element.text}
              onChange={(v) => patch({ text: v } as any)}
              defaultColor={element.style?.color}
              style={element.style}
            />
          ) : (
            <ExpandableTextarea
              value={element.text}
              onChange={(v) => patch({ text: v } as any)}
              rows={element.raw ? 5 : 3}
              mono={element.raw === true}
              placeholder={
                element.raw
                  ? t('templates.designer.el.exprPlaceholder')
                  : t('templates.designer.el.textPlaceholder')
              }
              modalTitle={t('templates.designer.el.exprEditor')}
            />
          )}
          <Toggle
            label={t('templates.designer.el.richText')}
            checked={element.rich === true}
            onChange={(v) =>
              patch({
                rich: v,
                // Mutuamente excluyente con `raw`.
                raw: v ? false : element.raw,
                // Al activar rich con texto plano sin etiquetas, conservamos
                // los saltos como <br/> para no perderlos al pasar a HTML.
                text:
                  v && element.text && !/<[a-z][^>]*>/i.test(element.text)
                    ? escapePlainToHtml(element.text)
                    : element.text,
              } as any)
            }
          />
          <Toggle
            label={t('templates.designer.el.rawExpr')}
            checked={element.raw === true}
            onChange={(v) => patch({ raw: v, rich: v ? false : element.rich } as any)}
          />
          {element.raw && (
            <ExprCommands
              onInsert={(snippet) => patch({ text: appendSnippet(element.text, snippet) } as any)}
            />
          )}
        </Section>
      )}

      {element.kind === 'image' && (
        <Section title={t('templates.designer.el.image')}>
          <label className="flex items-center justify-center text-xs px-3 py-6 rounded border-2 border-dashed border-slate-300 dark:border-slate-600 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const dataUrl = await fileToDataUrl(file);
                patch({ src: dataUrl } as any);
              }}
            />
            {element.src
              ? t('templates.designer.el.changeImage')
              : t('templates.designer.el.selectFile')}
          </label>
          {element.src && (
            <img
              src={element.src}
              alt="preview"
              className="mt-2 max-h-20 mx-auto rounded border border-slate-200 dark:border-slate-700"
            />
          )}
          <Label>{t('templates.designer.el.orPasteUrl')}</Label>
          <input
            type="text"
            value={element.src.startsWith('data:') ? '' : element.src}
            onChange={(e) => patch({ src: e.target.value } as any)}
            placeholder="https://..."
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
          />
          <Label>{t('templates.designer.el.fit')}</Label>
          <Select
            options={[
              { value: 'contain', label: t('templates.designer.opt.contain') },
              { value: 'cover', label: t('templates.designer.opt.cover') },
              { value: 'fill', label: t('templates.designer.opt.fill') },
            ]}
            value={element.fit ?? 'contain'}
            onChange={(v) => patch({ fit: v as any } as any)}
            ariaLabel={t('templates.designer.common.option')}
          />
        </Section>
      )}

      {element.kind === 'shape' && (
        <Section title={t('templates.designer.el.shape')}>
          <Label>{t('templates.designer.el.type')}</Label>
          <Select
            options={[
              { value: 'line', label: t('templates.designer.opt.line') },
              { value: 'rect', label: t('templates.designer.opt.rect') },
            ]}
            value={element.shape}
            onChange={(v) => patch({ shape: v as any } as any)}
            ariaLabel={t('templates.designer.common.option')}
          />
          <Label>{t('templates.designer.el.borderColor')}</Label>
          <input
            type="color"
            value={element.style?.borderColor ?? '#000000'}
            onChange={(e) =>
              patch({
                style: { ...(element.style ?? {}), borderColor: e.target.value },
              } as any)
            }
            className="h-8 w-full rounded border border-slate-200 dark:border-slate-700"
          />
        </Section>
      )}

      {element.kind === 'field' && (
        <Section title={t('templates.designer.el.field')}>
          <Label>{t('templates.designer.el.linkedField')}</Label>
          <FieldPicker
            value={element.path}
            groups={fieldGroups}
            onPick={(field) =>
              patch({
                path: field.path,
                format: inferDefaultFormat(field),
              } as any)
            }
          />
          <Label>Path</Label>
          <input
            type="text"
            value={element.path}
            onChange={(e) => patch({ path: e.target.value } as any)}
            placeholder="doc.docCode"
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
          />
          <Label>{t('templates.designer.el.format')}</Label>
          <Select
            options={[
              { value: '', label: t('templates.designer.opt.noFormat') },
              { value: 'currency', label: t('templates.designer.opt.currency') },
              { value: 'number', label: t('templates.designer.opt.number') },
              { value: 'date', label: t('templates.designer.opt.date') },
              { value: 'percent', label: t('templates.designer.opt.percent') },
              { value: 'address', label: t('templates.designer.opt.address') },
            ]}
            value={element.format ?? ''}
            onChange={(v) => patch({ format: (v || undefined) as any } as any)}
            ariaLabel={t('templates.designer.common.option')}
          />
          <Toggle
            label={t('templates.designer.el.richAffix')}
            checked={element.rich === true}
            onChange={(v) =>
              patch({
                rich: v,
                prefix:
                  v && element.prefix && !/<[a-z][^>]*>/i.test(element.prefix)
                    ? escapePlainToHtml(element.prefix)
                    : element.prefix,
                suffix:
                  v && element.suffix && !/<[a-z][^>]*>/i.test(element.suffix)
                    ? escapePlainToHtml(element.suffix)
                    : element.suffix,
              } as any)
            }
          />
          <Label>{t('templates.designer.el.prefix')}</Label>
          {element.rich ? (
            <RichTextEditor
              value={element.prefix ?? ''}
              onChange={(v) => patch({ prefix: v || undefined } as any)}
              defaultColor={element.style?.color}
            />
          ) : (
            <input
              type="text"
              value={element.prefix ?? ''}
              onChange={(e) => patch({ prefix: e.target.value || undefined } as any)}
              className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          )}
          <Label>{t('templates.designer.el.suffix')}</Label>
          {element.rich ? (
            <RichTextEditor
              value={element.suffix ?? ''}
              onChange={(v) => patch({ suffix: v || undefined } as any)}
              defaultColor={element.style?.color}
            />
          ) : (
            <input
              type="text"
              value={element.suffix ?? ''}
              onChange={(e) => patch({ suffix: e.target.value || undefined } as any)}
              className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          )}
        </Section>
      )}

      {element.kind === 'totals' && (
        <Section title={t('templates.designer.el.totalsToShow')}>
          <Toggle
            label="Subtotal"
            checked={element.showSubtotal !== false}
            onChange={(v) => patch({ showSubtotal: v } as any)}
          />
          <Toggle
            label={t('templates.designer.el.vatBreakdown')}
            checked={element.showTaxBreakdown !== false}
            onChange={(v) => patch({ showTaxBreakdown: v } as any)}
          />
          <Toggle
            label="Total"
            checked={element.showTotal !== false}
            onChange={(v) => patch({ showTotal: v } as any)}
          />
        </Section>
      )}

      {element.kind === 'qr' && (
        <Section title="QR">
          <Label>{t('templates.designer.el.valuePathOrLiteral')}</Label>
          <input
            type="text"
            value={element.value}
            onChange={(e) => patch({ value: e.target.value } as any)}
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
          />
        </Section>
      )}

      {element.kind === 'barcode' && (
        <Section title={t('templates.designer.el.barcode')}>
          <Label>{t('templates.designer.el.valuePathOrLiteral')}</Label>
          <input
            type="text"
            value={element.value}
            onChange={(e) => patch({ value: e.target.value } as any)}
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
          />
          <Label>{t('templates.designer.el.symbology')}</Label>
          <Select
            options={[
              { value: 'auto', label: t('templates.designer.sym.auto') },
              { value: 'code128', label: t('templates.designer.sym.code128') },
              { value: 'code39', label: t('templates.designer.sym.code39') },
              { value: 'code93', label: 'Code 93' },
              { value: 'codabar', label: 'Codabar' },
              { value: 'interleaved2of5', label: 'Interleaved 2 of 5 (ITF)' },
              { value: 'ean13', label: t('templates.designer.sym.ean13') },
              { value: 'ean8', label: t('templates.designer.sym.ean8') },
              { value: 'upca', label: t('templates.designer.sym.upca') },
              { value: 'upce', label: t('templates.designer.sym.upce') },
              { value: 'isbn', label: t('templates.designer.sym.isbn') },
              { value: 'itf14', label: t('templates.designer.sym.itf14') },
              { value: 'gs1-128', label: t('templates.designer.sym.gs1128') },
              { value: 'datamatrix', label: 'Data Matrix' },
              { value: 'pdf417', label: 'PDF417' },
              { value: 'qrcode', label: 'QR Code' },
              { value: 'azteccode', label: 'Aztec' },
            ]}
            value={element.symbology}
            onChange={(v) => patch({ symbology: v as any } as any)}
            ariaLabel={t('templates.designer.common.option')}
          />
          <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
            {t('templates.designer.el.barcodeHint')}
          </div>
          <Toggle
            label={t('templates.designer.el.showHumanText')}
            checked={element.includeText ?? false}
            onChange={(v) => patch({ includeText: v } as any)}
          />
        </Section>
      )}

      {element.kind === 'linesTable' && (
        <LinesTableEditor
          element={element}
          onPatch={(p) => patch(p as any)}
          extraLineFields={linePluginFields}
          queryColumns={queryColumns}
          queryNames={queryNames}
          isFreeOrLabel={isFreeOrLabel}
        />
      )}

      {element.kind === 'signature' && (
        <Section title={t('templates.designer.el.signature')}>
          <Label>{t('templates.designer.el.label')}</Label>
          <input
            type="text"
            value={element.label ?? ''}
            onChange={(e) => patch({ label: e.target.value } as any)}
            placeholder={t('templates.designer.el.signaturePlaceholder')}
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
          />
        </Section>
      )}

      {element.kind === 'pageBreak' && (
        <Section title={t('templates.designer.el.pageBreak')}>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            {t('templates.designer.el.pageBreakHint')}
          </div>
        </Section>
      )}

      {element.kind === 'conditional' && (
        <Section title={t('templates.designer.el.condition')}>
          <Label>{t('templates.designer.el.pathToEval')}</Label>
          <input
            type="text"
            value={element.path}
            onChange={(e) => patch({ path: e.target.value } as any)}
            placeholder="doc.paid"
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
          />
          <Label>{t('templates.designer.el.operator')}</Label>
          <Select
            options={[
              { value: 'truthy', label: t('templates.designer.cond.truthy') },
              { value: 'falsy', label: t('templates.designer.cond.falsy') },
              { value: 'eq', label: t('templates.designer.cond.eq') },
              { value: 'neq', label: t('templates.designer.cond.neq') },
              { value: 'gt', label: t('templates.designer.cond.gt') },
              { value: 'lt', label: t('templates.designer.cond.lt') },
            ]}
            value={element.operator}
            onChange={(v) => patch({ operator: v as any } as any)}
            ariaLabel={t('templates.designer.common.option')}
          />
          {element.operator !== 'truthy' && element.operator !== 'falsy' && (
            <>
              <Label>{t('templates.designer.el.compareValue')}</Label>
              <input
                type="text"
                value={element.value ?? ''}
                onChange={(e) => patch({ value: e.target.value } as any)}
                placeholder={t('templates.designer.el.compareValuePlaceholder')}
                className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
              />
              <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                {t('templates.designer.el.compareHint1')} <code>path.como.este</code>{' '}
                {t('templates.designer.el.compareHint2')}
              </div>
            </>
          )}
          <Label>{t('templates.designer.el.ifTrue')}</Label>
          <ExpandableTextarea
            value={element.thenText}
            onChange={(v) => patch({ thenText: v } as any)}
            rows={3}
            mono
            placeholder={t('templates.designer.el.ifTruePlaceholder')}
            modalTitle={t('templates.designer.el.ifTrueEditor')}
          />
          <Label>{t('templates.designer.el.ifFalse')}</Label>
          <ExpandableTextarea
            value={element.elseText ?? ''}
            onChange={(v) => patch({ elseText: v || undefined } as any)}
            rows={3}
            mono
            placeholder={t('templates.designer.el.ifFalsePlaceholder')}
            modalTitle={t('templates.designer.el.ifFalseEditor')}
          />
          <ExprCommands
            label={t('templates.designer.el.insertIntoTrue')}
            onInsert={(snippet) =>
              patch({ thenText: appendSnippet(element.thenText, snippet) } as any)
            }
          />
        </Section>
      )}

      {element.kind === 'divider' && (
        <Section title={t('templates.designer.el.divider')}>
          <Label>{t('templates.designer.el.orientation')}</Label>
          <Select
            options={[
              { value: 'horizontal', label: t('templates.designer.opt.horizontal') },
              { value: 'vertical', label: t('templates.designer.opt.vertical') },
            ]}
            value={element.orientation ?? 'horizontal'}
            onChange={(v) => patch({ orientation: v as any } as any)}
            ariaLabel={t('templates.designer.common.option')}
          />
          <div className="text-[10px] text-slate-400 leading-snug">
            Grosor, color y estilo de línea se ajustan en la sección Estilo (borde).
          </div>
        </Section>
      )}

      {element.kind === 'summary' && (
        <Section title={t('templates.designer.el.summary')}>
          <Label>{t('templates.designer.el.operation')}</Label>
          <Select
            options={[
              { value: 'sum', label: t('templates.designer.agg.sum') },
              { value: 'count', label: t('templates.designer.agg.count') },
              { value: 'avg', label: t('templates.designer.agg.avg') },
              { value: 'min', label: t('templates.designer.agg.min') },
              { value: 'max', label: t('templates.designer.agg.max') },
            ]}
            value={element.op}
            onChange={(v) => patch({ op: v as any } as any)}
            ariaLabel={t('templates.designer.common.option')}
          />
          <SourceColumnPicker
            source={element.source}
            path={element.path}
            onSource={(s) => patch({ source: s } as any)}
            onPath={(p) => patch({ path: p } as any)}
            showPath={element.op !== 'count'}
            queryNames={queryNames}
            queryColumns={queryColumns}
          />
          <Label>{t('templates.designer.el.format')}</Label>
          <Select
            options={[
              { value: '', label: '—' },
              { value: 'currency', label: t('templates.designer.opt.currencySym') },
              { value: 'number', label: t('templates.designer.opt.numberSym') },
              { value: 'percent', label: t('templates.designer.opt.percentSym') },
            ]}
            value={element.format ?? ''}
            onChange={(v) => patch({ format: (v || undefined) as any } as any)}
            ariaLabel={t('templates.designer.common.option')}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('templates.designer.el.prefix')}
              </div>
              <input
                value={element.prefix ?? ''}
                onChange={(e) => patch({ prefix: e.target.value || undefined } as any)}
                className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </label>
            <label className="block">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('templates.designer.el.suffix')}
              </div>
              <input
                value={element.suffix ?? ''}
                onChange={(e) => patch({ suffix: e.target.value || undefined } as any)}
                className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </label>
          </div>
        </Section>
      )}

      {element.kind === 'box' && (
        <Section title={t('templates.designer.el.box')}>
          <NumberField
            label={t('templates.designer.el.cornerRadius')}
            value={element.style?.borderRadius ?? 0}
            onChange={(v) =>
              patch({
                style: { ...(element.style ?? {}), borderRadius: Math.max(0, v) },
              } as any)
            }
          />
          <div className="text-[10px] text-slate-400 leading-snug">
            {t('templates.designer.el.boxHint')}
          </div>
        </Section>
      )}

      {element.kind === 'list' && (
        <Section title={t('templates.designer.el.list')}>
          <SourceColumnPicker
            source={element.source}
            path={element.itemPath}
            onSource={(s) => patch({ source: s } as any)}
            onPath={(p) => patch({ itemPath: p } as any)}
            pathLabel={t('templates.designer.el.fieldToShow')}
            queryNames={queryNames}
            queryColumns={queryColumns}
          />
          <Toggle
            label={t('templates.designer.el.numbered')}
            checked={!!element.ordered}
            onChange={(v) => patch({ ordered: v } as any)}
          />
          <Label>{t('templates.designer.el.marker')}</Label>
          <Select
            options={[
              { value: 'bullet', label: t('templates.designer.opt.bullet') },
              { value: 'number', label: t('templates.designer.opt.number') },
              { value: 'none', label: t('templates.designer.opt.none') },
            ]}
            value={element.marker ?? 'bullet'}
            onChange={(v) => patch({ marker: v as any } as any)}
            ariaLabel={t('templates.designer.common.option')}
          />
        </Section>
      )}

      {element.kind === 'currentDate' && (
        <Section title={t('templates.designer.el.date')}>
          <Label>{t('templates.designer.el.mode')}</Label>
          <Select
            options={[
              { value: 'date', label: t('templates.designer.opt.dateOnly') },
              { value: 'datetime', label: t('templates.designer.opt.datetime') },
            ]}
            value={element.mode ?? 'date'}
            onChange={(v) => patch({ mode: v as any } as any)}
            ariaLabel={t('templates.designer.common.option')}
          />
          <Label>{t('templates.designer.el.prefix')}</Label>
          <input
            value={element.prefix ?? ''}
            onChange={(e) => patch({ prefix: e.target.value || undefined } as any)}
            placeholder={t('templates.designer.el.datePrefixPlaceholder')}
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
          />
        </Section>
      )}

      {/* Estilo común — visible para todos los tipos salvo los que no tienen
          superficie estilizable (salto de página / espacio). Antes se gateaba
          por `'style' in element`, que oculta la sección en elementos recién
          creados sin clave `style` (p.ej. un texto nuevo). */}
      {element.kind !== 'pageBreak' && element.kind !== 'spacer' && (
        <Section title={t('templates.designer.el.style')}>
          {!STYLE_NO_FONT.has(element.kind) && (
            <>
              <Label>{t('templates.designer.el.font')}</Label>
              <Select
                options={[
                  { value: '', label: t('templates.designer.opt.systemDefault') },
                  {
                    value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                    label: 'Sans-serif',
                  },
                  { value: "Georgia, 'Times New Roman', serif", label: 'Serif (Georgia)' },
                  { value: "'Times New Roman', Times, serif", label: 'Times New Roman' },
                  { value: 'Arial, Helvetica, sans-serif', label: 'Arial / Helvetica' },
                  { value: "'Courier New', Courier, monospace", label: 'Courier (mono)' },
                  { value: "'Trebuchet MS', sans-serif", label: 'Trebuchet' },
                  { value: 'Verdana, sans-serif', label: 'Verdana' },
                ]}
                value={element.style?.fontFamily ?? ''}
                onChange={(v) =>
                  patch({
                    style: {
                      ...(element.style ?? {}),
                      fontFamily: v || undefined,
                    },
                  } as any)
                }
                ariaLabel={t('templates.designer.common.option')}
              />

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('templates.designer.common.sizePt')}
                  </div>
                  <input
                    type="number"
                    min={4}
                    max={72}
                    value={element.style?.fontSize ?? ''}
                    onChange={(e) =>
                      patch({
                        style: {
                          ...(element.style ?? {}),
                          fontSize: e.target.value ? Number(e.target.value) : undefined,
                        },
                      } as any)
                    }
                    className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  />
                </label>
                <label className="block">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('templates.designer.common.color')}
                  </div>
                  <input
                    type="color"
                    value={element.style?.color ?? '#000000'}
                    onChange={(e) =>
                      patch({ style: { ...(element.style ?? {}), color: e.target.value } } as any)
                    }
                    className="h-8 w-full rounded border border-slate-200 dark:border-slate-700"
                  />
                </label>
              </div>

              <div className="flex gap-1">
                <StyleToggleButton
                  active={element.style?.fontWeight === 'bold'}
                  onClick={() =>
                    patch({
                      style: {
                        ...(element.style ?? {}),
                        fontWeight: element.style?.fontWeight === 'bold' ? 'normal' : 'bold',
                      },
                    } as any)
                  }
                  title={t('templates.designer.common.bold')}
                  className="font-bold"
                >
                  B
                </StyleToggleButton>
                <StyleToggleButton
                  active={element.style?.fontStyle === 'italic'}
                  onClick={() =>
                    patch({
                      style: {
                        ...(element.style ?? {}),
                        fontStyle: element.style?.fontStyle === 'italic' ? 'normal' : 'italic',
                      },
                    } as any)
                  }
                  title={t('templates.designer.el.italic')}
                  className="italic"
                >
                  I
                </StyleToggleButton>
                <div className="w-px bg-slate-200 dark:bg-slate-700 mx-1" />
                <StyleToggleButton
                  active={element.style?.textAlign === 'left' || !element.style?.textAlign}
                  onClick={() =>
                    patch({ style: { ...(element.style ?? {}), textAlign: 'left' } } as any)
                  }
                  title={t('templates.designer.opt.left')}
                >
                  ⬅
                </StyleToggleButton>
                <StyleToggleButton
                  active={element.style?.textAlign === 'center'}
                  onClick={() =>
                    patch({ style: { ...(element.style ?? {}), textAlign: 'center' } } as any)
                  }
                  title={t('templates.designer.opt.center')}
                >
                  ↔
                </StyleToggleButton>
                <StyleToggleButton
                  active={element.style?.textAlign === 'right'}
                  onClick={() =>
                    patch({ style: { ...(element.style ?? {}), textAlign: 'right' } } as any)
                  }
                  title={t('templates.designer.opt.right')}
                >
                  ➡
                </StyleToggleButton>
              </div>
            </>
          )}

          <Label>{t('templates.designer.el.bgColor')}</Label>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={element.style?.backgroundColor ?? '#ffffff'}
              onChange={(e) =>
                patch({
                  style: { ...(element.style ?? {}), backgroundColor: e.target.value },
                } as any)
              }
              className="h-8 w-12 rounded border border-slate-200 dark:border-slate-700"
            />
            <button
              type="button"
              onClick={() =>
                patch({
                  style: { ...(element.style ?? {}), backgroundColor: undefined },
                } as any)
              }
              className="text-[11px] text-slate-500 hover:text-slate-700"
            >
              {t('templates.designer.el.transparent')}
            </button>
          </div>

          <Label>{t('templates.designer.el.border')}</Label>
          <div className="grid grid-cols-[1fr_70px_70px] gap-2 items-end">
            <label className="block">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('templates.designer.el.style')}
              </div>
              <Select
                options={[
                  { value: 'none', label: t('templates.designer.opt.noBorder') },
                  { value: 'solid', label: t('templates.designer.opt.line') },
                  { value: 'dashed', label: t('templates.designer.opt.dashed') },
                  { value: 'dotted', label: t('templates.designer.opt.dotted') },
                ]}
                value={element.style?.borderStyle ?? 'none'}
                onChange={(value) => {
                  const v = value as 'none' | 'solid' | 'dashed' | 'dotted';
                  patch({
                    style: {
                      ...(element.style ?? {}),
                      borderStyle: v,
                      // Al activar un borde, aseguramos valores sensatos.
                      borderWidth: v === 'none' ? undefined : (element.style?.borderWidth ?? 1),
                      borderColor:
                        v === 'none' ? undefined : (element.style?.borderColor ?? '#000000'),
                    },
                  } as any);
                }}
                ariaLabel={t('templates.designer.common.option')}
              />
            </label>
            <label className="block">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('templates.designer.el.borderWidth')}
              </div>
              <input
                type="number"
                min={0}
                max={20}
                value={element.style?.borderWidth ?? ''}
                onChange={(e) =>
                  patch({
                    style: {
                      ...(element.style ?? {}),
                      borderWidth: e.target.value ? Number(e.target.value) : undefined,
                    },
                  } as any)
                }
                className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </label>
            <label className="block">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('templates.designer.common.color')}
              </div>
              <input
                type="color"
                value={element.style?.borderColor ?? '#000000'}
                onChange={(e) =>
                  patch({
                    style: { ...(element.style ?? {}), borderColor: e.target.value },
                  } as any)
                }
                className="h-8 w-full rounded border border-slate-200 dark:border-slate-700"
              />
            </label>
          </div>
        </Section>
      )}

      {/* CSS por elemento — disponible para todos los kinds (fuera del guard de estilo). */}
      <Section title={t('templates.designer.css.elementTitle')}>
        <Label>{t('templates.designer.el.cssClass')}</Label>
        <input
          value={element.className ?? ''}
          placeholder={t('templates.designer.el.cssClassPlaceholder')}
          onChange={(e) => patch({ className: e.target.value || undefined } as any)}
          className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
        />
        <div className="text-[10px] text-slate-400 leading-snug">
          {t('templates.designer.el.cssClassHint')}
        </div>
        <Label>{t('templates.designer.el.ownCss')}</Label>
        <button
          type="button"
          onClick={() => setCssOpen(true)}
          className="flex items-center gap-2 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <Code size={13} /> {t('templates.designer.ctx.editCss')}
          {element.customCss ? (
            <span className="text-emerald-600 dark:text-emerald-400">●</span>
          ) : null}
        </button>
        <div className="text-[10px] text-slate-400 leading-snug">
          {t('templates.designer.el.ownCssHint1')}{' '}
          <code>letter-spacing:2px;text-transform:uppercase</code>
          {t('templates.designer.el.ownCssHint2')}
        </div>
      </Section>

      <CssEditorModal
        open={cssOpen}
        value={element.customCss ?? ''}
        onChange={(v) => patch({ customCss: v.trim() ? v : undefined } as any)}
        onClose={() => setCssOpen(false)}
        title={t('templates.designer.css.elementTitle')}
        helpText={t('templates.designer.css.elementHelpLong')}
      />
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-2">
    <div className="text-[11px] uppercase tracking-wide font-bold text-slate-400">{title}</div>
    <div className="space-y-2">{children}</div>
  </div>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{children}</div>
);

const NumberGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-2 gap-2">{children}</div>
);

const NumberField: React.FC<{ label: string; value: number; onChange: (v: number) => void }> = ({
  label,
  value,
  onChange,
}) => (
  <label className="block">
    <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
    />
  </label>
);

const StyleToggleButton: React.FC<{
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}> = ({ active, onClick, title, children, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`w-8 h-8 rounded border text-xs ${
      active
        ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-400 text-blue-700 dark:text-blue-200'
        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
    } ${className}`}
  >
    {children}
  </button>
);

const Toggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({
  label,
  checked,
  onChange,
}) => (
  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="accent-blue-600"
    />
    {label}
  </label>
);

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- LinesTableEditor ----------

const LinesTableEditor: React.FC<{
  element: LinesTableElement;
  onPatch: (p: Partial<LinesTableElement>) => void;
  extraLineFields?: FieldDef[];
  queryColumns?: Record<string, string[]>;
  queryNames?: string[];
  isFreeOrLabel?: boolean;
}> = ({
  element,
  onPatch,
  extraLineFields = [],
  queryColumns = {},
  queryNames = [],
  isFreeOrLabel = false,
}) => {
  const { t } = useI18n();
  // Fuente actual: 'lines' (documento) o 'query:NOMBRE'.
  const queryName =
    element.source && element.source.startsWith('query:')
      ? element.source.slice('query:'.length)
      : null;
  // Opciones de campo para el picker de columnas: si la fuente es una query,
  // son SUS columnas (paths relativos); si no, los campos de línea del documento.
  const queryCols = queryName ? (queryColumns[queryName] ?? []) : [];
  const baseLineGroup = getLineFieldGroup();
  const lineGroup = queryName
    ? queryCols.length > 0
      ? {
          group: 'lines' as const,
          label: `Consulta: ${queryName}`,
          icon: 'ListOrdered' as const,
          fields: queryCols.map((c) => ({ path: c, type: 'string' as const, description: c })),
        }
      : null
    : baseLineGroup
      ? { ...baseLineGroup, fields: [...baseLineGroup.fields, ...extraLineFields] }
      : null;
  const updateColumn = (idx: number, changes: Partial<LinesTableColumn>) => {
    onPatch({
      columns: element.columns.map((c, i) => (i === idx ? { ...c, ...changes } : c)),
    });
  };
  const addColumn = () => {
    // Si la fuente es una query, por defecto proponemos su primera columna libre.
    const used = new Set(element.columns.map((c) => c.path));
    const nextCol = queryName ? (queryCols.find((c) => !used.has(c)) ?? queryCols[0]) : null;
    const base = nextCol
      ? { label: shortLabel(nextCol), path: nextCol, format: guessColumnFormat(nextCol) }
      : { label: 'Nueva', path: 'itemName' as string };
    onPatch({
      columns: [
        ...element.columns,
        { id: genId('col'), widthPct: 10, align: 'left' as const, ...base },
      ],
    });
  };
  const removeColumn = (idx: number) => {
    onPatch({ columns: element.columns.filter((_, i) => i !== idx) });
  };
  const moveColumn = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= element.columns.length) return;
    const cols = [...element.columns];
    [cols[idx], cols[target]] = [cols[target], cols[idx]];
    onPatch({ columns: cols });
  };

  return (
    <Section title={t('templates.designer.lt.title')}>
      {(queryNames.length > 0 || isFreeOrLabel) && (
        <>
          <Label>{t('templates.designer.source.title')}</Label>
          <Select
            options={[
              { value: '', label: t('templates.designer.source.docLines') },
              ...queryNames.map((n) => ({
                value: `query:${n}`,
                label: t('templates.designer.fields.queryGroup', { name: n }),
              })),
            ]}
            value={element.source ?? ''}
            onChange={(value) => {
              if (!value) {
                onPatch({ source: undefined });
                return;
              }
              const name = value.slice('query:'.length);
              const cols = queryColumns[name] ?? [];
              // Al elegir una query con columnas conocidas, autocompletamos la
              // tabla con sus campos. Solo lo hacemos si tiene columnas (si no,
              // dejamos las actuales para no vaciar el diseño).
              if (cols.length > 0) {
                onPatch({ source: value, columns: columnsFromQueryCols(cols) });
              } else {
                onPatch({ source: value });
              }
            }}
            ariaLabel={t('templates.designer.source.title')}
          />
          {isFreeOrLabel && !queryName && (
            <div className="text-[10px] text-amber-600 dark:text-amber-400 leading-snug">
              {t('templates.designer.lt.freeHint')}
            </div>
          )}
          {queryName && queryCols.length === 0 && (
            <div className="text-[10px] text-amber-600 dark:text-amber-400 leading-snug">
              {t('templates.designer.lt.noColumns', { name: queryName })}
            </div>
          )}
        </>
      )}
      <Label>{t('templates.designer.lt.layout')}</Label>
      <Select
        options={[
          { value: 'table', label: t('templates.designer.lt.layoutTable') },
          { value: 'keyValue', label: t('templates.designer.lt.layoutKeyValue') },
        ]}
        value={element.layout ?? 'table'}
        onChange={(v) => onPatch({ layout: v as LinesTableElement['layout'] })}
        ariaLabel={t('templates.designer.common.option')}
      />
      {(element.layout ?? 'table') === 'table' && (
        <>
          <Label>{t('templates.designer.lt.preset')}</Label>
          <Select
            options={[
              { value: 'default', label: t('templates.designer.lt.presetDefault') },
              { value: 'bordered', label: t('templates.designer.lt.presetBordered') },
              { value: 'striped', label: t('templates.designer.lt.presetStriped') },
              { value: 'compact', label: t('templates.designer.lt.presetCompact') },
              { value: 'borderless', label: t('templates.designer.lt.presetBorderless') },
            ]}
            value={element.tableStyle ?? 'default'}
            onChange={(v) => onPatch({ tableStyle: v as LinesTableElement['tableStyle'] })}
            ariaLabel={t('templates.designer.common.option')}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('templates.designer.lt.headerBg')}
              </div>
              <input
                type="color"
                value={element.headerBg ?? '#f1f5f9'}
                onChange={(e) => onPatch({ headerBg: e.target.value })}
                className="h-8 w-full rounded border border-slate-200 dark:border-slate-700"
              />
            </label>
            <label className="block">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('templates.designer.lt.borderColor')}
              </div>
              <input
                type="color"
                value={element.borderColor ?? '#e5e7eb'}
                onChange={(e) => onPatch({ borderColor: e.target.value })}
                className="h-8 w-full rounded border border-slate-200 dark:border-slate-700"
              />
            </label>
          </div>
          <NumberField
            label={t('templates.designer.lt.cellPadding')}
            value={element.cellPadding ?? 4}
            onChange={(v) => onPatch({ cellPadding: Math.max(0, v) })}
          />
        </>
      )}
      <Toggle
        label={t('templates.designer.lt.showHeader')}
        checked={element.showHeader !== false}
        onChange={(v) => onPatch({ showHeader: v })}
      />
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{t('templates.designer.lt.columns', { count: element.columns.length })}</Label>
          <button
            type="button"
            onClick={addColumn}
            className="text-[11px] px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600"
          >
            + {t('templates.designer.lt.add')}
          </button>
        </div>
        {element.columns.map((col, idx) => (
          <div
            key={col.id}
            className="p-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 space-y-1.5"
          >
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={col.label}
                onChange={(e) => updateColumn(idx, { label: e.target.value })}
                placeholder={t('templates.designer.lt.headerPlaceholder')}
                className="flex-1 px-1.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <button
                type="button"
                onClick={() => moveColumn(idx, -1)}
                disabled={idx === 0}
                title={t('templates.designer.lt.moveUp')}
                className="p-1 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
              >
                <ChevronUp size={13} />
              </button>
              <button
                type="button"
                onClick={() => moveColumn(idx, 1)}
                disabled={idx === element.columns.length - 1}
                title={t('templates.designer.lt.moveDown')}
                className="p-1 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
              >
                <ChevronDown size={13} />
              </button>
              <button
                type="button"
                onClick={() => removeColumn(idx)}
                className="text-[11px] px-1.5 py-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                title={t('templates.designer.lt.delete')}
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-[1fr_50px] gap-1">
              <input
                type="text"
                value={col.path}
                onChange={(e) => updateColumn(idx, { path: e.target.value })}
                placeholder="itemName"
                className="px-1.5 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <input
                type="number"
                value={col.widthPct}
                onChange={(e) => updateColumn(idx, { widthPct: Number(e.target.value) || 0 })}
                title={t('templates.designer.lt.widthPct')}
                className="px-1.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
            <div className="grid grid-cols-2 gap-1">
              <Select
                options={[
                  { value: 'left', label: t('templates.designer.lt.alignLeft') },
                  { value: 'center', label: t('templates.designer.opt.center') },
                  { value: 'right', label: t('templates.designer.lt.alignRight') },
                ]}
                value={col.align ?? 'left'}
                onChange={(v) => updateColumn(idx, { align: v as any })}
                className="text-xs"
                ariaLabel={t('templates.designer.common.option')}
              />
              <Select
                options={[
                  { value: '', label: '—' },
                  { value: 'currency', label: '€' },
                  { value: 'number', label: '#' },
                  { value: 'date', label: '📅' },
                  { value: 'percent', label: '%' },
                  { value: 'address', label: '🏠' },
                ]}
                value={col.format ?? ''}
                onChange={(v) => updateColumn(idx, { format: (v || undefined) as any })}
                className="text-xs"
                ariaLabel={t('templates.designer.common.option')}
              />
            </div>
            {lineGroup && (
              <details className="text-[11px]">
                <summary className="cursor-pointer text-slate-500">
                  {queryName
                    ? t('templates.designer.lt.pickQueryColumn')
                    : t('templates.designer.lt.pickLineField')}
                </summary>
                <div className="mt-1 max-h-32 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded">
                  {lineGroup.fields.map((f) => (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() =>
                        updateColumn(idx, {
                          path: f.path,
                          format: inferDefaultFormat(f),
                          label: col.label === 'Nueva' ? capitalize(f.path) : col.label,
                        })
                      }
                      className={`w-full text-left px-2 py-0.5 font-mono hover:bg-blue-50 dark:hover:bg-blue-950/40 ${
                        f.path === col.path
                          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200'
                          : ''
                      }`}
                    >
                      {f.path}
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Convierte texto plano a un HTML mínimo seguro para el editor de texto rico:
 * escapa los metacarácteres y reemplaza saltos de línea por <br/>.
 */
function escapePlainToHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}

// ---------- RichTextEditor ----------

/**
 * Editor inline contenteditable con barra de formato. Permite negritas,
 * cursivas, subrayado, tachado, color de texto, color de fondo y limpiar
 * formato sobre la selección actual. Persiste como HTML en `value`.
 *
 * Implementado con `document.execCommand` por simplicidad: deprecated en
 * spec pero aún soportado por todos los navegadores actuales y suficiente
 * para los formatos que necesita una plantilla de documento. No requiere
 * dependencias externas (TipTap/Lexical/Quill no están instalados).
 */
const RichTextEditor: React.FC<{
  value: string;
  onChange: (html: string) => void;
  defaultColor?: string;
  style?: ElementStyle;
}> = ({ value, onChange, defaultColor, style }) => {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement | null>(null);
  const [color, setColor] = useState(defaultColor || '#1e40af');
  const [bgColor, setBgColor] = useState('#fef08a');

  // Vuelca el HTML al montar y cuando `value` cambia desde fuera (cambio de
  // elemento). Comparamos contra el contenido REAL del DOM para: (a) inicializar
  // el contenido al montar, y (b) no pisar el cursor mientras se teclea (al
  // teclear, value === innerHTML actual → no re-escribimos).
  useEffect(() => {
    if (ref.current && value !== ref.current.innerHTML) {
      ref.current.innerHTML = value || '';
    }
  }, [value]);

  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const emit = () => {
    if (!ref.current) return;
    onChange(ref.current.innerHTML);
  };

  const clearFormat = () => {
    ref.current?.focus();
    document.execCommand('removeFormat');
    document.execCommand('unlink');
    // Quita también color de fondo, que removeFormat no toca en algunos navegadores.
    document.execCommand('hiliteColor', false, 'transparent');
    emit();
  };

  const setBlockAlign = (align: 'left' | 'center' | 'right' | 'justify') => {
    ref.current?.focus();
    const map = {
      left: 'justifyLeft',
      center: 'justifyCenter',
      right: 'justifyRight',
      justify: 'justifyFull',
    } as const;
    document.execCommand(map[align]);
    emit();
  };

  const btnCls =
    'px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 active:bg-slate-200';

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => exec('bold')}
          className={`${btnCls} font-bold`}
          title={t('templates.designer.rt.bold')}
        >
          B
        </button>
        <button
          type="button"
          onClick={() => exec('italic')}
          className={`${btnCls} italic`}
          title={t('templates.designer.rt.italic')}
        >
          I
        </button>
        <button
          type="button"
          onClick={() => exec('underline')}
          className={`${btnCls} underline`}
          title={t('templates.designer.rt.underline')}
        >
          U
        </button>
        <button
          type="button"
          onClick={() => exec('strikeThrough')}
          className={`${btnCls} line-through`}
          title={t('templates.designer.rt.strike')}
        >
          S
        </button>
        <span className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
        <label className="flex items-center gap-1" title={t('templates.designer.rt.textColor')}>
          <input
            type="color"
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              exec('foreColor', e.target.value);
            }}
            className="h-6 w-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer"
          />
          <button type="button" onClick={() => exec('foreColor', color)} className={btnCls}>
            A
          </button>
        </label>
        <label className="flex items-center gap-1" title={t('templates.designer.rt.bgColor')}>
          <input
            type="color"
            value={bgColor}
            onChange={(e) => {
              setBgColor(e.target.value);
              exec('hiliteColor', e.target.value);
            }}
            className="h-6 w-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer"
          />
          <button
            type="button"
            onClick={() => exec('hiliteColor', bgColor)}
            className={`${btnCls} bg-yellow-100 dark:bg-yellow-900/40`}
          >
            ▓
          </button>
        </label>
        <span className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
        <button
          type="button"
          onClick={() => setBlockAlign('left')}
          className={btnCls}
          title={t('templates.designer.rt.alignLeft')}
        >
          ⯇
        </button>
        <button
          type="button"
          onClick={() => setBlockAlign('center')}
          className={btnCls}
          title={t('templates.designer.rt.center')}
        >
          ≡
        </button>
        <button
          type="button"
          onClick={() => setBlockAlign('right')}
          className={btnCls}
          title={t('templates.designer.rt.alignRight')}
        >
          ⯈
        </button>
        <span className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
        <button
          type="button"
          onClick={clearFormat}
          className={btnCls}
          title={t('templates.designer.rt.clear')}
        >
          ⨯
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          // Pegamos como texto plano para no traer estilos externos que el
          // PDF no podrá interpretar (ej: clases de Word/Google Docs).
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
        }}
        className="min-h-[80px] p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:border-blue-400 whitespace-pre-wrap break-words"
        style={{
          lineHeight: 1.4,
          // Reflejamos el estilo del elemento para que el editor sea WYSIWYG.
          textAlign: style?.textAlign,
          fontSize: style?.fontSize ? `${style.fontSize}pt` : undefined,
          fontFamily: style?.fontFamily,
          fontWeight: style?.fontWeight,
          fontStyle: style?.fontStyle,
          color: style?.color,
        }}
      />
      <div className="text-[10px] text-slate-400 leading-snug">
        {t('templates.designer.rt.hint')}
      </div>
    </div>
  );
};

// ---------- FieldPicker ----------

const FieldPicker: React.FC<{
  value: string;
  groups: FieldGroup[];
  onPick: (field: FieldDef) => void;
}> = ({ value, groups, onPick }) => {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  // Keyeamos por `label` (no por `group`) porque pueden coexistir varios grupos
  // con el mismo `group` (p.ej. varias consultas SQL para FREE/LABEL).
  const [openGroup, setOpenGroup] = useState<string | null>(groups[0]?.label ?? null);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = groups
    .map((g) => ({
      ...g,
      fields: g.fields.filter(
        (f) =>
          !normalizedQuery ||
          f.path.toLowerCase().includes(normalizedQuery) ||
          f.description.toLowerCase().includes(normalizedQuery),
      ),
    }))
    .filter((g) => g.fields.length > 0);

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('templates.designer.fields.search')}
        className="w-full px-2 py-1.5 text-xs bg-transparent border-b border-slate-200 dark:border-slate-700 focus:outline-none"
      />
      <div className="max-h-56 overflow-y-auto">
        {filteredGroups.length === 0 && (
          <div className="px-3 py-3 text-xs text-slate-400 italic">
            {t('templates.designer.fields.noResults')}
          </div>
        )}
        {filteredGroups.map((g) => {
          const expanded = normalizedQuery ? true : openGroup === g.label;
          return (
            <div
              key={g.label}
              className="border-b border-slate-200 dark:border-slate-700 last:border-0"
            >
              <button
                type="button"
                onClick={() => setOpenGroup(expanded ? null : g.label)}
                className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <span>{g.label}</span>
                <span className="text-slate-400">{g.fields.length}</span>
              </button>
              {expanded &&
                g.fields.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => onPick(f)}
                    className={`w-full text-left px-3 py-1 text-xs hover:bg-blue-50 dark:hover:bg-blue-950/40 ${
                      f.path === value
                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200 font-semibold'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                    title={f.description}
                  >
                    <div className="font-mono">{f.path}</div>
                    <div className="text-[10px] text-slate-400 truncate">{f.description}</div>
                  </button>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------- factoría de elementos ----------

function buildDefaultElement(
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
      return { ...base, kind, value: 'verifactu.qrPayload' };
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

// ---------- ExprCommands: paleta de comandos Handlebars ----------
// Pequeño cheatsheet interactivo con snippets de los helpers disponibles.
// Click inserta el snippet al final del textarea controlado por el padre.

interface ExprCommand {
  group: string;
  label: string;
  snippet: string;
  hint?: string;
}

/** `group`/`label`/`hint` son claves i18n; `snippet` va tal cual a la plantilla. */
const EXPR_COMMANDS: ExprCommand[] = [
  {
    group: 'templates.designer.expr.groups.fields',
    label: 'templates.designer.expr.labels.simpleField',
    snippet: '{{doc.docCode}}',
    hint: 'templates.designer.expr.hints.asIs',
  },
  {
    group: 'templates.designer.expr.groups.fields',
    label: 'templates.designer.expr.labels.rawField',
    snippet: '{{{company.logoUrl}}}',
    hint: 'templates.designer.expr.hints.noEscape',
  },
  {
    group: 'templates.designer.expr.groups.format',
    label: 'templates.designer.expr.labels.currency',
    snippet: '{{formatCurrency doc.total}}',
  },
  {
    group: 'templates.designer.expr.groups.format',
    label: 'templates.designer.expr.labels.number',
    snippet: '{{formatNumber valor 2}}',
    hint: 'templates.designer.expr.hints.decimals',
  },
  {
    group: 'templates.designer.expr.groups.format',
    label: 'templates.designer.expr.labels.date',
    snippet: '{{formatDate doc.issueDate}}',
  },
  {
    group: 'templates.designer.expr.groups.format',
    label: 'templates.designer.expr.labels.address',
    snippet: '{{{formatAddress partner.billingAddress}}}',
  },
  {
    group: 'templates.designer.expr.groups.format',
    label: 'templates.designer.expr.labels.padLeft',
    snippet: '{{padLeft valor 6 "0"}}',
  },
  {
    group: 'templates.designer.expr.groups.math',
    label: 'templates.designer.expr.labels.multiply',
    snippet: '{{multiply precio cantidad}}',
  },
  {
    group: 'templates.designer.expr.groups.conditional',
    label: 'templates.designer.expr.labels.ifElse',
    snippet: '{{#if doc.paid}}Pagada{{else}}Pendiente{{/if}}',
  },
  {
    group: 'templates.designer.expr.groups.conditional',
    label: 'templates.designer.expr.labels.unless',
    snippet: '{{#unless doc.notes}}—{{/unless}}',
  },
  {
    group: 'templates.designer.expr.groups.conditional',
    label: 'templates.designer.expr.labels.equal',
    snippet: '{{#if (eq doc.status "paid")}}OK{{/if}}',
  },
  {
    group: 'templates.designer.expr.groups.conditional',
    label: 'templates.designer.expr.labels.notEqual',
    snippet: '{{#if (neq doc.status "paid")}}!{{/if}}',
  },
  {
    group: 'templates.designer.expr.groups.conditional',
    label: 'templates.designer.expr.labels.greater',
    snippet: '{{#if (gt doc.total 100)}}grande{{/if}}',
  },
  {
    group: 'templates.designer.expr.groups.conditional',
    label: 'templates.designer.expr.labels.less',
    snippet: '{{#if (lt doc.total 100)}}pequeño{{/if}}',
  },
  {
    group: 'templates.designer.expr.groups.iteration',
    label: 'templates.designer.expr.labels.docLines',
    snippet: '{{#each lines}}{{itemName}} x{{quantity}}\n{{/each}}',
  },
  {
    group: 'templates.designer.expr.groups.iteration',
    label: 'templates.designer.expr.labels.vatBreakdown',
    snippet: '{{#each doc.taxBreakdown}}IVA {{rate}}%: {{formatCurrency amount}}\n{{/each}}',
  },
  {
    group: 'templates.designer.expr.groups.codes',
    label: 'templates.designer.expr.labels.qr',
    snippet: '<img src="{{{qrCode doc.docCode}}}" style="width:25mm;height:25mm" />',
  },
  {
    group: 'templates.designer.expr.groups.codes',
    label: 'templates.designer.expr.labels.barcode',
    snippet:
      '<img src="{{{barcode doc.docCode symbology="code128" includeText=true}}}" style="width:60mm;height:15mm" />',
  },
];

const ExprCommands: React.FC<{ onInsert: (snippet: string) => void; label?: string }> = ({
  onInsert,
  label,
}) => {
  const { t } = useI18n();
  const groups = Array.from(new Set(EXPR_COMMANDS.map((c) => c.group)));
  return (
    <details className="text-[11px] rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
      <summary className="cursor-pointer px-2 py-1.5 select-none font-semibold text-slate-600 dark:text-slate-300">
        ⌘ {label ?? t('templates.designer.expr.available')}
      </summary>
      <div className="px-2 pb-2 pt-1 space-y-2">
        {groups.map((g) => (
          <div key={g}>
            <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-0.5">
              {t(g)}
            </div>
            <div className="flex flex-wrap gap-1">
              {EXPR_COMMANDS.filter((c) => c.group === g).map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => onInsert(c.snippet)}
                  title={`${c.hint ? t(c.hint) + ' — ' : ''}${c.snippet}`}
                  className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
                >
                  {t(c.label)}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="text-[10px] text-slate-400 dark:text-slate-500 pt-1">
          {t('templates.designer.expr.hint')}
        </div>
      </div>
    </details>
  );
};

function appendSnippet(current: string | undefined, snippet: string): string {
  const cur = current ?? '';
  if (!cur) return snippet;
  return cur.endsWith('\n') ? cur + snippet : cur + ' ' + snippet;
}

// ---------- ExpandableTextarea ----------
// Textarea compacta con botón para expandirse a un editor grande en un
// overlay modal. Útil para escribir expresiones Handlebars largas o
// bloques multi-línea sin perder espacio en el inspector.

const ExpandableTextarea: React.FC<{
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  mono?: boolean;
  placeholder?: string;
  modalTitle?: string;
}> = ({ value, onChange, rows = 3, mono = false, placeholder, modalTitle }) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="relative">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={mono ? 'font-mono' : ''}
      />
      <button
        type="button"
        onClick={() => setExpanded(true)}
        title={t('templates.designer.expandable.open')}
        className="absolute top-1 right-1 px-1.5 py-0.5 text-[11px] rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
      >
        ⛶ {t('templates.designer.expandable.editor')}
      </button>
      {expanded &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center p-6 bg-slate-900/70 dark:bg-black/80 backdrop-blur-sm"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setExpanded(false);
            }}
          >
            <div className="w-[min(90vw,900px)] h-[min(85vh,700px)] rounded-lg shadow-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {modalTitle ?? t('templates.designer.expandable.defaultTitle')}
                </div>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title={t('templates.designer.expandable.close')}
                >
                  ✕
                </button>
              </div>
              <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={`flex-1 resize-none p-4 outline-none ${mono ? 'font-mono' : ''} bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm leading-relaxed`}
                autoFocus
              />
              <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <span className="self-center">
                  {t('templates.designer.expandable.stats', {
                    chars: value.length,
                    lines: value.split('\n').length,
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                >
                  {t('templates.designer.expandable.done')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};
