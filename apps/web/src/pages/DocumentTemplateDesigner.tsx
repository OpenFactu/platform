import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SqlEditorModal } from '../components/document-templates/SqlEditorModal';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '@openfactu/ui';
import {
  ArrowLeft,
  Save,
  FileDown,
  FileUp,
  Undo,
  Redo,
  Eye,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useAuth } from '../context/AuthContext';
import type { TemplateRow } from '../components/document-templates/constants';
import {
  createEmptyLayout,
  createLabelLayout,
  createDocumentLabelLayout,
  PAGE_SIZE_LABELS,
  resolvePageDimensions,
  type CanvasLayout,
  type Band,
  type BandKind,
  type CanvasElement,
  type ElementKind,
  type LinesTableElement,
  type LinesTableColumn,
  type PageSize,
} from '../components/document-templates/canvas/types';
import { compileCanvas } from '../components/document-templates/canvas/compileCanvas';
import {
  getFieldGroupsForFieldElement,
  getLineFieldGroup,
  inferDefaultFormat,
  type FieldDef,
  type FieldGroup,
} from '../components/document-templates/canvas/fieldRegistry';
import { ImportFromTemplateDialog } from '../components/document-templates/canvas/ImportFromTemplateDialog';
import { usePluginFields } from '../components/document-templates/canvas/usePluginFields';
import { SimpleLabelEditor } from '../components/document-templates/SimpleLabelEditor';
import {
  buildSimpleLabelLayout,
  defaultSimpleArticleSettings,
} from '../components/document-templates/canvas/buildSimpleLabel';

const BAND_LABELS: Record<BandKind, string> = {
  pageHeader: 'Cabecera de página',
  docHeader: 'Cabecera del documento',
  detail: 'Detalle (líneas)',
  totals: 'Totales',
  pageFooter: 'Pie de página',
};

const PALETTE_ITEMS: { kind: ElementKind; label: string }[] = [
  { kind: 'text', label: 'Texto' },
  { kind: 'image', label: 'Imagen' },
  { kind: 'shape', label: 'Forma' },
  { kind: 'spacer', label: 'Espaciador' },
  { kind: 'field', label: 'Campo' },
  { kind: 'linesTable', label: 'Tabla líneas' },
  { kind: 'totals', label: 'Totales' },
  { kind: 'qr', label: 'QR' },
  { kind: 'barcode', label: 'Código barras' },
  { kind: 'conditional', label: 'Condicional' },
  { kind: 'signature', label: 'Firma' },
  { kind: 'pageBreak', label: 'Salto página' },
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
};

/** Constante CSS: 1mm = 3.779527 px a 96 DPI. */
const PX_PER_MM = 3.779527559;

let nextId = 1;
const genId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${nextId++}`;

export const DocumentTemplateDesigner: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { token, user } = useAuth();

  const [template, setTemplate] = useState<TemplateRow | null>(null);
  const [layout, setLayout] = useState<CanvasLayout>(createEmptyLayout());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  /**
   * Modo del editor para plantillas FREE: 'simple' = formulario tonto;
   * 'advanced' = canvas designer. Si el layout trae `simpleLabel` arrancamos
   * en 'simple'; en otro caso en 'advanced'.
   */
  const [labelEditMode, setLabelEditMode] = useState<'simple' | 'advanced'>('simple');
  const rootRef = useRef<HTMLDivElement | null>(null);

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
      rootRef.current.requestFullscreen().catch(() => toast.error('Fullscreen no disponible'));
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
        const res = await fetch(`/api/document-templates/${id}`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as TemplateRow & { canvasLayout?: CanvasLayout | null };
        if (cancelled) return;
        setTemplate(data);
        if (data.canvasLayout && data.canvasLayout.version === 1) {
          setLayout(data.canvasLayout);
          // Si el layout fue construido por el modo simple, abrimos en simple.
          if ((data.canvasLayout as any).simpleLabel) {
            setLabelEditMode('simple');
          } else {
            setLabelEditMode('advanced');
          }
        } else if ((data as any).docType === 'FREE' || (data as any).docType === 'LABEL') {
          // Plantilla FREE nueva → arrancamos en modo simple con defaults
          // de artículo, lo que es la ruta más rápida para tener una etiqueta
          // funcional sin tocar el canvas.
          const initial = buildSimpleLabelLayout(defaultSimpleArticleSettings());
          setLayout(initial);
          setLabelEditMode('simple');
        }
      } catch {
        toast.error('No se pudo cargar la plantilla');
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

  const handleSave = async (opts: { returnAfter?: boolean } = {}) => {
    if (!template) return;
    setSaving(true);
    try {
      const html = compileCanvas(layout, { docType: template.docType });
      const res = await fetch(`/api/document-templates/${template.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          ...template,
          canvasLayout: layout,
          html,
          legacyHtml: false,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Plantilla guardada');
      if (opts.returnAfter) navigate('/document-templates');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over, delta } = event;
    if (!over) return;
    const targetBandId = String(over.id);
    const data = active.data.current as
      | { action: 'create'; kind: ElementKind }
      | { action: 'move'; bandId: string; elementId: string }
      | undefined;
    if (!data) return;

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
      const html = compileCanvas(layout, { docType: template.docType });
      const res = await fetch('/api/document-templates/preview', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          html,
          docType: template.docType,
          queries: layout.queries ?? [],
          params: layout.testParams ?? {},
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error al renderizar' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
    } catch (e: any) {
      toast.error(`Preview falló: ${e.message}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Auto-refresh del preview cuando el layout cambia — debounced a 900 ms
  // para no martillear al server en cada drag.
  useEffect(() => {
    if (!template) return;
    const handle = setTimeout(() => {
      handlePreview();
    }, 900);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, template?.docType]);

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(template?.name || 'plantilla').replace(/\s+/g, '_')}.canvas.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJsonFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.bands)) {
        throw new Error('Formato inválido');
      }
      setLayout(parsed as CanvasLayout);
      setSelectedElementId(null);
      toast.success('Layout importado');
    } catch (e: any) {
      toast.error(`No se pudo importar: ${e.message || 'JSON inválido'}`);
    }
  };

  const handleImportFromTemplate = async (sourceId: string) => {
    try {
      const res = await fetch(`/api/document-templates/${sourceId}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as TemplateRow & { canvasLayout?: CanvasLayout | null };
      if (!data.canvasLayout || data.canvasLayout.version !== 1) {
        toast.error('Esa plantilla no tiene canvas layout (posiblemente sea legacy HTML).');
        return;
      }
      setLayout(data.canvasLayout);
      setSelectedElementId(null);
      setImportOpen(false);
      toast.success(`Importado desde "${data.name}"`);
    } catch {
      toast.error('No se pudo importar la plantilla');
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

  const { pluginGroup, linePluginFields } = usePluginFields(template?.docType, headers);

  const selectedElement =
    selectedElementId == null
      ? null
      : (layout.bands.flatMap((b) => b.elements).find((e) => e.id === selectedElementId) ?? null);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        Cargando plantilla…
      </div>
    );
  }

  return (
    <div ref={rootRef} className="absolute inset-0 flex flex-col bg-slate-50 dark:bg-slate-950">
      <Toolbar
        title={template?.name ?? 'Sin título'}
        onBack={handleBack}
        onSave={() => handleSave({ returnAfter: true })}
        saving={saving}
        onToggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
        onExport={handleExportJson}
        onImport={handleImportJsonFile}
        onImportFromTemplate={() => setImportOpen(true)}
        onPreview={handlePreview}
        previewLoading={previewLoading}
      />
      {((template as any)?.docType === 'FREE' || (template as any)?.docType === 'LABEL') && (
        <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-200 dark:border-purple-800/40 text-xs flex-wrap">
          <span className="font-bold text-purple-700 dark:text-purple-300">Modo:</span>
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
              Simple (formulario)
            </button>
            <button
              type="button"
              onClick={() => setLabelEditMode('advanced')}
              className={`px-3 py-1 border-l border-purple-300 dark:border-purple-700 ${labelEditMode === 'advanced' ? 'bg-purple-600 text-white font-bold' : 'bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-200'}`}
            >
              Avanzado (canvas)
            </button>
          </div>
          {labelEditMode === 'advanced' && (
            <>
              <span className="font-bold text-purple-700 dark:text-purple-300 ml-2">
                Layouts predefinidos:
              </span>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Sustituir el layout por etiqueta de artículo. ¿Continuar?')) {
                    setLayout(createLabelLayout());
                    setSelectedElementId(null);
                  }
                }}
                className="px-2 py-1 rounded border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/40"
              >
                Etiqueta de artículo
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Sustituir el layout por etiqueta de documento. ¿Continuar?')) {
                    setLayout(createDocumentLabelLayout());
                    setSelectedElementId(null);
                  }
                }}
                className="px-2 py-1 rounded border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/40"
              >
                Etiqueta de documento
              </button>
            </>
          )}
        </div>
      )}
      {previewUrl && <PreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />}
      {importOpen && (
        <ImportFromTemplateDialog
          currentId={template?.id}
          onClose={() => setImportOpen(false)}
          onPick={handleImportFromTemplate}
          headers={headers}
        />
      )}
      {((template as any)?.docType === 'FREE' || (template as any)?.docType === 'LABEL') &&
      labelEditMode === 'simple' ? (
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
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex flex-1 min-h-0">
            <PalettePanel />
            <CanvasArea
              layout={layout}
              selectedElementId={selectedElementId}
              onSelectElement={setSelectedElementId}
              onDeleteElement={handleDeleteElement}
              onResizeBand={(id, h) => handleUpdateBand(id, { height: h })}
              onResizeElement={handleResizeElement}
            />
            <InspectorPanel
              element={selectedElement}
              onChange={handleUpdateElement}
              pluginGroup={pluginGroup}
              linePluginFields={linePluginFields}
              layout={layout}
              onUpdatePage={handleUpdatePage}
              onUpdateBand={handleUpdateBand}
            />
          </div>
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
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  onExport: () => void;
  onImport: (file: File) => void;
  onImportFromTemplate: () => void;
  onPreview: () => void;
  previewLoading: boolean;
}

const Toolbar: React.FC<ToolbarProps> = ({
  title,
  onBack,
  onSave,
  saving,
  onToggleFullscreen,
  isFullscreen,
  onExport,
  onImport,
  onImportFromTemplate,
  onPreview,
  previewLoading,
}) => (
  <header className="flex items-center gap-2 px-4 h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
    <button
      onClick={onBack}
      className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
      title="Volver a plantillas"
    >
      <ArrowLeft size={18} />
    </button>
    <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{title}</div>
    <div className="flex-1" />
    <ToolbarButton icon={<Undo size={16} />} label="Deshacer" disabled />
    <ToolbarButton icon={<Redo size={16} />} label="Rehacer" disabled />
    <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
    <button
      type="button"
      onClick={onImportFromTemplate}
      title="Importar desde otra plantilla"
      className="flex items-center gap-1 px-2 py-1.5 rounded text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      <FileUp size={16} />
    </button>
    <label
      title="Importar JSON"
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
      title="Exportar JSON"
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
      title="Previsualizar PDF"
      className="flex items-center gap-1 px-2 py-1.5 rounded text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
    >
      <Eye size={16} /> {previewLoading && <span className="text-[10px]">…</span>}
    </button>
    <button
      type="button"
      onClick={onToggleFullscreen}
      title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
      className="p-2 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
    </button>
    <button
      onClick={onSave}
      disabled={saving}
      className="flex items-center gap-2 px-3 py-1.5 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
    >
      <Save size={16} /> {saving ? 'Guardando…' : 'Guardar'}
    </button>
  </header>
);

const PreviewModal: React.FC<{ url: string; onClose: () => void }> = ({ url, onClose }) => (
  <div
    className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
    onClick={onClose}
  >
    <div
      className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-[min(900px,95vw)] h-[90vh] flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <h2 className="font-bold text-slate-900 dark:text-slate-100">Vista previa del PDF</h2>
        <div className="flex items-center gap-2">
          <a
            href={url}
            download="preview.pdf"
            className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200"
          >
            Descargar
          </a>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
      </div>
      <iframe src={url} className="flex-1 w-full" title="PDF preview" />
    </div>
  </div>
);

const ToolbarButton: React.FC<{ icon: React.ReactNode; label: string; disabled?: boolean }> = ({
  icon,
  label,
  disabled,
}) => (
  <button
    disabled={disabled}
    title={label}
    className="flex items-center gap-1 px-2 py-1.5 rounded text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
  >
    {icon}
  </button>
);

// ---------- paleta ----------

const PalettePanel: React.FC = () => (
  <aside className="w-56 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto">
    <div className="px-3 py-2 text-xs uppercase tracking-wide font-bold text-slate-400">Paleta</div>
    <ul className="px-2 pb-4 space-y-1">
      {PALETTE_ITEMS.map((it) => (
        <PaletteItem key={it.kind} kind={it.kind} label={it.label} />
      ))}
    </ul>
  </aside>
);

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

// ---------- canvas ----------

interface CanvasAreaProps {
  layout: CanvasLayout;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onDeleteElement: (bandId: string, elementId: string) => void;
  onResizeBand: (bandId: string, height: number) => void;
  onResizeElement: (elementId: string, w: number, h: number) => void;
}

const CanvasArea: React.FC<CanvasAreaProps> = ({
  layout,
  selectedElementId,
  onSelectElement,
  onDeleteElement,
  onResizeBand,
  onResizeElement,
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
      {layout.bands.map((b) => (
        <BandSlot
          key={b.id}
          band={b}
          selectedElementId={selectedElementId}
          onSelectElement={onSelectElement}
          onDeleteElement={onDeleteElement}
          onResize={(h) => onResizeBand(b.id, h)}
          onResizeElement={onResizeElement}
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
}

const BandSlot: React.FC<BandSlotProps> = ({
  band,
  selectedElementId,
  onSelectElement,
  onDeleteElement,
  onResize,
  onResizeElement,
}) => {
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
      className={`relative border-b border-dashed transition-colors ${
        isOver
          ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-400'
          : 'border-slate-200 dark:border-slate-700'
      }`}
      style={{ height: `${band.height}mm` }}
    >
      <div className="absolute top-1 left-2 text-[10px] uppercase tracking-wide font-bold text-slate-400 pointer-events-none z-10">
        {BAND_LABELS[band.kind]}
      </div>
      {band.elements.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 pointer-events-none">
          {isOver ? 'Suelta aquí' : 'Arrastra aquí un componente'}
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
        />
      ))}
      {/* Handle de resize: arrastra para cambiar el alto de la banda */}
      <div
        onMouseDown={handleResizeDown}
        title="Arrastra para cambiar el alto de la banda"
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
}

const ElementBox: React.FC<ElementBoxProps> = ({
  element,
  bandId,
  selected,
  onSelect,
  onDelete,
  onResize,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `el-${element.id}`,
    data: { action: 'move', bandId, elementId: element.id },
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
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : selected ? 20 : 10,
  };
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          onDelete();
        }
      }}
      tabIndex={0}
      style={style}
      className={`group rounded cursor-move select-none outline-none touch-none overflow-visible ${
        selected
          ? 'ring-2 ring-blue-500'
          : 'ring-1 ring-slate-300 dark:ring-slate-600 hover:ring-slate-400'
      }`}
    >
      <div className="w-full h-full overflow-hidden rounded">
        <ElementPreview element={element} />
      </div>
      {selected && (
        <>
          {/* stopPropagation en pointerdown impide que dnd-kit arranque un drag
              al pinchar un handle — dnd-kit escucha pointer events, no mouse. */}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={startResize('e')}
            title="Redimensionar ancho"
            className="absolute top-0 right-0 bottom-0 w-1.5 cursor-ew-resize bg-blue-500/20 hover:bg-blue-500/60"
          />
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={startResize('s')}
            title="Redimensionar alto"
            className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize bg-blue-500/20 hover:bg-blue-500/60"
          />
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={startResize('se')}
            title="Redimensionar"
            className="absolute -right-1 -bottom-1 w-3 h-3 rounded-sm bg-blue-600 border border-white cursor-nwse-resize z-10"
          />
        </>
      )}
    </div>
  );
};

const ElementPreview: React.FC<{ element: CanvasElement }> = ({ element }) => {
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
          {element.text || <span className="text-slate-400 italic">Texto</span>}
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
          🖼 (elige imagen)
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
            {`{{${element.path || 'campo'}}}`}
            {element.suffix && <span dangerouslySetInnerHTML={{ __html: element.suffix }} />}
          </div>
        );
      }
      return (
        <div style={base} className="font-mono text-slate-700 dark:text-slate-300">
          {element.prefix}
          {`{{${element.path || 'campo'}}}`}
          {element.suffix}
        </div>
      );
    case 'linesTable':
      return (
        <div className="w-full h-full bg-white dark:bg-slate-800 p-1">
          <table className="w-full text-[8pt] border-collapse">
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
  }
};

// ---------- inspector ----------

interface InspectorPanelProps {
  element: CanvasElement | null;
  onChange: (id: string, patch: Partial<CanvasElement>) => void;
  pluginGroup: FieldGroup | null;
  linePluginFields: FieldDef[];
  layout: CanvasLayout;
  onUpdatePage: (patch: Partial<CanvasLayout>) => void;
  onUpdateBand: (bandId: string, patch: Partial<Band>) => void;
}

const InspectorPanel: React.FC<InspectorPanelProps> = ({
  element,
  onChange,
  pluginGroup,
  linePluginFields,
  layout,
  onUpdatePage,
  onUpdateBand,
}) => (
  <aside className="w-80 shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto">
    <div className="px-3 py-2 text-xs uppercase tracking-wide font-bold text-slate-400">
      Inspector
    </div>
    {element ? (
      <ElementInspector
        element={element}
        onChange={onChange}
        pluginGroup={pluginGroup}
        linePluginFields={linePluginFields}
      />
    ) : (
      <PageInspector layout={layout} onUpdatePage={onUpdatePage} onUpdateBand={onUpdateBand} />
    )}
  </aside>
);

const PageInspector: React.FC<{
  layout: CanvasLayout;
  onUpdatePage: (patch: Partial<CanvasLayout>) => void;
  onUpdateBand: (bandId: string, patch: Partial<Band>) => void;
}> = ({ layout, onUpdatePage, onUpdateBand }) => (
  <div className="px-3 py-3 space-y-4 text-sm">
    <div className="text-[11px] uppercase tracking-wide font-bold text-slate-500">Página</div>
    <Section title="Formato">
      <Label>Tamaño</Label>
      <select
        value={layout.pageSize}
        onChange={(e) => onUpdatePage({ pageSize: e.target.value as PageSize })}
        className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
      >
        <optgroup label="Documento">
          <option value="A4">{PAGE_SIZE_LABELS.A4}</option>
          <option value="Letter">{PAGE_SIZE_LABELS.Letter}</option>
        </optgroup>
        <optgroup label="Tiquets / Recibos">
          <option value="Ticket80">{PAGE_SIZE_LABELS.Ticket80}</option>
          <option value="Ticket58">{PAGE_SIZE_LABELS.Ticket58}</option>
        </optgroup>
        <optgroup label="Etiquetas">
          <option value="Label100x62">{PAGE_SIZE_LABELS.Label100x62}</option>
          <option value="Label70x37">{PAGE_SIZE_LABELS.Label70x37}</option>
          <option value="Label50x25">{PAGE_SIZE_LABELS.Label50x25}</option>
        </optgroup>
        <optgroup label="Otros">
          <option value="Custom">{PAGE_SIZE_LABELS.Custom}</option>
        </optgroup>
      </select>
      {layout.pageSize === 'Custom' && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Ancho (mm)"
            value={layout.customWidthMm ?? 100}
            onChange={(v) => onUpdatePage({ customWidthMm: Math.max(10, v) })}
          />
          <NumberField
            label="Alto (mm)"
            value={layout.customHeightMm ?? 100}
            onChange={(v) => onUpdatePage({ customHeightMm: Math.max(10, v) })}
          />
        </div>
      )}
      <Label>Márgenes (mm)</Label>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Arriba"
          value={layout.margins.top}
          onChange={(v) => onUpdatePage({ margins: { ...layout.margins, top: v } })}
        />
        <NumberField
          label="Derecha"
          value={layout.margins.right}
          onChange={(v) => onUpdatePage({ margins: { ...layout.margins, right: v } })}
        />
        <NumberField
          label="Abajo"
          value={layout.margins.bottom}
          onChange={(v) => onUpdatePage({ margins: { ...layout.margins, bottom: v } })}
        />
        <NumberField
          label="Izquierda"
          value={layout.margins.left}
          onChange={(v) => onUpdatePage({ margins: { ...layout.margins, left: v } })}
        />
      </div>
    </Section>
    <Section title="Bandas (alto en mm)">
      {layout.bands.map((b) => (
        <div key={b.id} className="flex items-center gap-2">
          <div className="flex-1 text-xs text-slate-600 dark:text-slate-300">
            {BAND_LABELS[b.kind]}
          </div>
          <input
            type="number"
            min={0}
            value={b.height}
            onChange={(e) =>
              onUpdateBand(b.id, { height: Math.max(0, Number(e.target.value) || 0) })
            }
            className="w-20 px-2 py-1 text-xs text-right rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          />
        </div>
      ))}
      <div className="pt-1 text-[11px] text-slate-400">
        Total bandas: {layout.bands.reduce((a, b) => a + b.height, 0)}mm. Útil de página:{' '}
        {resolvePageDimensions(layout).height - layout.margins.top - layout.margins.bottom}mm.
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
    <QueriesInspector
      queries={layout.queries}
      testParams={layout.testParams ?? {}}
      onChange={(q) => onUpdatePage({ queries: q })}
      onTestParamsChange={(p) => onUpdatePage({ testParams: p })}
    />
    <div className="text-[11px] text-slate-400 italic">
      Selecciona un elemento para editar sus propiedades.
    </div>
  </div>
);

// ---------- QueriesInspector: editor de consultas SQL (solo ADMIN/SUPERUSER) ----------

const QueriesInspector: React.FC<{
  queries: CanvasLayout['queries'];
  testParams: Record<string, unknown>;
  onChange: (q: CanvasLayout['queries']) => void;
  onTestParamsChange: (p: Record<string, unknown>) => void;
}> = ({ queries, testParams, onChange, onTestParamsChange }) => {
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
    <Section title="Consultas SQL (admin)">
      {!isAdmin && (
        <div className="text-[11px] text-amber-600 dark:text-amber-400">
          Solo lectura: necesitas rol ADMIN para editar.
        </div>
      )}
      <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
        Se ejecutan al renderizar. Resultado accesible como{' '}
        <code className="px-1 rounded bg-slate-100 dark:bg-slate-800">queries.NOMBRE</code>. Solo{' '}
        <code>SELECT</code> / <code>WITH</code>. Placeholders: <code>:docId</code>,{' '}
        <code>:partnerId</code>, <code>:companyId</code>, <code>:tenantId</code>.
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
          + Añadir consulta
        </button>
      )}
      {list.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
          <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-2">
            Parámetros de prueba
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500 mb-2">
            Valores que se pasan a las queries durante el preview (placeholders <code>:xxx</code>).
          </div>
          <TestParamsEditor value={testParams} onChange={onTestParamsChange} readOnly={!isAdmin} />
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
  const [result, setResult] = useState<
    | { ok: true; rows: unknown[]; rowCount: number; truncated: boolean }
    | { ok: false; error: string }
    | null
  >(null);
  const [testing, setTesting] = useState(false);
  const { token } = useAuth();

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch('/api/document-templates/test-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ name: query.name, sql: query.sql, params: testParams }),
      });
      const body = await res.json();
      if (!res.ok || body.ok === false) {
        setResult({ ok: false, error: body.error || `HTTP ${res.status}` });
      } else {
        setResult({
          ok: true,
          rows: body.rows ?? [],
          rowCount: body.rowCount ?? 0,
          truncated: body.truncated ?? false,
        });
      }
    } catch (e: any) {
      setResult({ ok: false, error: e?.message || 'Error de red' });
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
          placeholder="nombreConsulta"
          className="flex-1 px-2 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
        />
        {!readOnly && (
          <button
            type="button"
            onClick={onRemove}
            className="text-[11px] px-1.5 py-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
            title="Eliminar consulta"
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
        title={readOnly ? 'Solo lectura' : 'Click para abrir el editor SQL'}
      >
        {preview || <span className="text-slate-400 italic">SELECT * FROM …</span>}
        {lineCount > 3 && (
          <div className="text-[10px] text-slate-400">…{lineCount - 3} líneas más</div>
        )}
      </div>
      {!readOnly && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            className="text-[11px] px-2 py-1 rounded bg-slate-700 hover:bg-slate-800 text-white"
          >
            ✎ Editor SQL
          </button>
          <button
            type="button"
            onClick={runTest}
            disabled={testing}
            className="text-[11px] px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          >
            {testing ? 'Probando…' : '▶ Probar'}
          </button>
          {result && result.ok && (
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
              {result.rowCount} fila{result.rowCount === 1 ? '' : 's'}
              {result.truncated ? ' (truncado a 1000)' : ''}
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
        title={`Editor SQL — ${query.name}`}
        queryName={query.name}
        initialSql={query.sql}
        token={token}
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

const TestParamsEditor: React.FC<{
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  readOnly: boolean;
}> = ({ value, onChange, readOnly }) => {
  const entries = Object.entries(value);
  const add = () => {
    const key = `param${entries.length + 1}`;
    onChange({ ...value, [key]: '' });
  };
  const update = (k: string, v: unknown) => {
    onChange({ ...value, [k]: v });
  };
  const remove = (k: string) => {
    const next = { ...value };
    delete next[k];
    onChange(next);
  };
  return (
    <div className="space-y-1">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center gap-1">
          <input
            type="text"
            value={k}
            onChange={(e) => {
              const next = { ...value };
              delete next[k];
              next[e.target.value] = v;
              onChange(next);
            }}
            disabled={readOnly}
            placeholder="clave"
            className="w-24 px-2 py-1 text-[10px] font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          />
          <span className="text-slate-400">:</span>
          <input
            type="text"
            value={String(v ?? '')}
            onChange={(e) => update(k, e.target.value)}
            disabled={readOnly}
            placeholder="valor"
            className="flex-1 px-2 py-1 text-[10px] font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          />
          {!readOnly && (
            <button
              type="button"
              onClick={() => remove(k)}
              className="text-[10px] px-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={add}
          className="text-[10px] px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600"
        >
          + Parámetro
        </button>
      )}
    </div>
  );
};

const PageNumbersInspector: React.FC<{
  value: CanvasLayout['pageNumbers'];
  onChange: (v: CanvasLayout['pageNumbers']) => void;
}> = ({ value, onChange }) => {
  const v = value ?? { enabled: false, alignment: 'center' as const };
  const patch = (p: Partial<NonNullable<CanvasLayout['pageNumbers']>>) => onChange({ ...v, ...p });
  return (
    <Section title="Números de página">
      <Toggle
        label="Mostrar numeración (Página X / Total)"
        checked={v.enabled}
        onChange={(enabled) => patch({ enabled })}
      />
      {v.enabled && (
        <>
          <Label>Alineación</Label>
          <select
            value={v.alignment ?? 'center'}
            onChange={(e) => patch({ alignment: e.target.value as any })}
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
          >
            <option value="left">Izquierda</option>
            <option value="center">Centro</option>
            <option value="right">Derecha</option>
          </select>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            El pie se pinta en los últimos 12mm de cada página. Se reserva espacio automáticamente.
          </div>
        </>
      )}
    </Section>
  );
};

const WatermarkInspector: React.FC<{
  watermark: CanvasLayout['watermark'];
  onChange: (w: CanvasLayout['watermark']) => void;
}> = ({ watermark, onChange }) => {
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
    <Section title="Marca de agua">
      <Toggle
        label="Activar marca de agua"
        checked={w.enabled}
        onChange={(v) => patch({ enabled: v })}
      />
      {w.enabled && (
        <>
          <Label>Texto</Label>
          <input
            type="text"
            value={w.text}
            onChange={(e) => patch({ text: e.target.value })}
            placeholder="BORRADOR · COPIA · {{doc.status}}"
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Color</div>
              <input
                type="color"
                value={w.color ?? '#94a3b8'}
                onChange={(e) => patch({ color: e.target.value })}
                className="h-8 w-full rounded border border-slate-200 dark:border-slate-700"
              />
            </label>
            <label className="block">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Tamaño (pt)</div>
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
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Rotación (°)</div>
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
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Opacidad (0-1)</div>
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
            label="Negrita"
            checked={w.fontWeight === 'bold'}
            onChange={(v) => patch({ fontWeight: v ? 'bold' : 'normal' })}
          />
        </>
      )}
    </Section>
  );
};

const ElementInspector: React.FC<{
  element: CanvasElement;
  onChange: (id: string, patch: Partial<CanvasElement>) => void;
  pluginGroup: FieldGroup | null;
  linePluginFields: FieldDef[];
}> = ({ element, onChange, pluginGroup, linePluginFields }) => {
  const patch = (p: Partial<CanvasElement>) => onChange(element.id, p);
  const fieldGroups = pluginGroup
    ? [...getFieldGroupsForFieldElement('docHeader'), pluginGroup]
    : getFieldGroupsForFieldElement('docHeader');
  return (
    <div className="px-3 py-3 space-y-4 text-sm">
      <div className="text-[11px] uppercase tracking-wide font-bold text-slate-500">
        {element.kind}
      </div>

      {/* Geometría común */}
      <Section title="Geometría">
        <NumberGrid>
          <NumberField label="X (mm)" value={element.x} onChange={(v) => patch({ x: v } as any)} />
          <NumberField label="Y (mm)" value={element.y} onChange={(v) => patch({ y: v } as any)} />
          <NumberField
            label="Ancho (mm)"
            value={element.w}
            onChange={(v) => patch({ w: Math.max(1, v) } as any)}
          />
          <NumberField
            label="Alto (mm)"
            value={element.h}
            onChange={(v) => patch({ h: Math.max(1, v) } as any)}
          />
        </NumberGrid>
      </Section>

      {/* Props específicas por tipo */}
      {element.kind === 'text' && (
        <Section title="Contenido">
          {element.rich && !element.raw ? (
            <RichTextEditor
              value={element.text}
              onChange={(v) => patch({ text: v } as any)}
              defaultColor={element.style?.color}
            />
          ) : (
            <ExpandableTextarea
              value={element.text}
              onChange={(v) => patch({ text: v } as any)}
              rows={element.raw ? 5 : 3}
              mono={element.raw === true}
              placeholder={
                element.raw
                  ? 'Expresión Handlebars. Ej: {{#if doc.paid}}Pagada{{else}}Pendiente{{/if}}'
                  : 'Texto a mostrar'
              }
              modalTitle="Editor de expresión"
            />
          )}
          <Toggle
            label="Texto enriquecido (negritas, colores...)"
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
            label="Expresión Handlebars (avanzado)"
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
        <Section title="Imagen">
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
            {element.src ? 'Cambiar imagen' : 'Seleccionar archivo'}
          </label>
          {element.src && (
            <img
              src={element.src}
              alt="preview"
              className="mt-2 max-h-20 mx-auto rounded border border-slate-200 dark:border-slate-700"
            />
          )}
          <Label>O pega una URL</Label>
          <input
            type="text"
            value={element.src.startsWith('data:') ? '' : element.src}
            onChange={(e) => patch({ src: e.target.value } as any)}
            placeholder="https://..."
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
          />
          <Label>Ajuste</Label>
          <select
            value={element.fit ?? 'contain'}
            onChange={(e) => patch({ fit: e.target.value as any } as any)}
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
          >
            <option value="contain">Contener (sin recortar)</option>
            <option value="cover">Cubrir (rellenar)</option>
            <option value="fill">Estirar</option>
          </select>
        </Section>
      )}

      {element.kind === 'shape' && (
        <Section title="Forma">
          <Label>Tipo</Label>
          <select
            value={element.shape}
            onChange={(e) => patch({ shape: e.target.value as any } as any)}
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
          >
            <option value="line">Línea</option>
            <option value="rect">Rectángulo</option>
          </select>
          <Label>Color de borde</Label>
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
        <Section title="Campo">
          <Label>Campo vinculado</Label>
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
          <Label>Formato</Label>
          <select
            value={element.format ?? ''}
            onChange={(e) => patch({ format: (e.target.value || undefined) as any } as any)}
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
          >
            <option value="">Sin formato</option>
            <option value="currency">Moneda</option>
            <option value="number">Número</option>
            <option value="date">Fecha</option>
            <option value="percent">Porcentaje</option>
            <option value="address">Dirección (multilínea)</option>
          </select>
          <Toggle
            label="Prefijo/sufijo enriquecidos (negritas, colores...)"
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
          <Label>Prefijo</Label>
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
          <Label>Sufijo</Label>
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
        <Section title="Totales a mostrar">
          <Toggle
            label="Subtotal"
            checked={element.showSubtotal !== false}
            onChange={(v) => patch({ showSubtotal: v } as any)}
          />
          <Toggle
            label="Desglose IVA"
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
          <Label>Valor (path o literal)</Label>
          <input
            type="text"
            value={element.value}
            onChange={(e) => patch({ value: e.target.value } as any)}
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
          />
        </Section>
      )}

      {element.kind === 'barcode' && (
        <Section title="Código de barras">
          <Label>Valor (path o literal)</Label>
          <input
            type="text"
            value={element.value}
            onChange={(e) => patch({ value: e.target.value } as any)}
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
          />
          <Label>Simbología</Label>
          <select
            value={element.symbology}
            onChange={(e) => patch({ symbology: e.target.value as any } as any)}
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
          >
            <optgroup label="Recomendado">
              <option value="auto">Auto (detecta EAN-13/UPC-A/EAN-8/ITF-14/Code128)</option>
            </optgroup>
            <optgroup label="1D — Universales">
              <option value="code128">Code 128 (alfanumérico)</option>
              <option value="code39">Code 39 (industrial)</option>
              <option value="code93">Code 93</option>
              <option value="codabar">Codabar</option>
              <option value="interleaved2of5">Interleaved 2 of 5 (ITF)</option>
            </optgroup>
            <optgroup label="1D — Retail">
              <option value="ean13">EAN-13 (13 dígitos)</option>
              <option value="ean8">EAN-8 (8 dígitos)</option>
              <option value="upca">UPC-A (12 dígitos, USA)</option>
              <option value="upce">UPC-E (compacto)</option>
              <option value="isbn">ISBN (libros)</option>
            </optgroup>
            <optgroup label="1D — Logística">
              <option value="itf14">ITF-14 (cajas)</option>
              <option value="gs1-128">GS1-128 (con FNC1)</option>
            </optgroup>
            <optgroup label="2D — Matriz">
              <option value="datamatrix">Data Matrix</option>
              <option value="pdf417">PDF417</option>
              <option value="qrcode">QR Code</option>
              <option value="azteccode">Aztec</option>
            </optgroup>
          </select>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
            Si el valor no encaja con la simbología elegida (ej. EAN-13 con 12 dígitos), el render
            hace fallback automático a Code 128 para que la etiqueta nunca salga en blanco.
          </div>
          <Toggle
            label="Mostrar texto legible"
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
        />
      )}

      {element.kind === 'signature' && (
        <Section title="Firma">
          <Label>Etiqueta</Label>
          <input
            type="text"
            value={element.label ?? ''}
            onChange={(e) => patch({ label: e.target.value } as any)}
            placeholder="Firma y sello"
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
          />
        </Section>
      )}

      {element.kind === 'pageBreak' && (
        <Section title="Salto de página">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            Fuerza el inicio de una nueva página a partir de este punto en el PDF. En el diseñador
            se muestra como un marcador visual.
          </div>
        </Section>
      )}

      {element.kind === 'conditional' && (
        <Section title="Condición">
          <Label>Path a evaluar</Label>
          <input
            type="text"
            value={element.path}
            onChange={(e) => patch({ path: e.target.value } as any)}
            placeholder="doc.paid"
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
          />
          <Label>Operador</Label>
          <select
            value={element.operator}
            onChange={(e) => patch({ operator: e.target.value as any } as any)}
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
          >
            <option value="truthy">Tiene valor (truthy)</option>
            <option value="falsy">Está vacío (falsy)</option>
            <option value="eq">= igual a</option>
            <option value="neq">≠ distinto de</option>
            <option value="gt">&gt; mayor que</option>
            <option value="lt">&lt; menor que</option>
          </select>
          {element.operator !== 'truthy' && element.operator !== 'falsy' && (
            <>
              <Label>Valor a comparar</Label>
              <input
                type="text"
                value={element.value ?? ''}
                onChange={(e) => patch({ value: e.target.value } as any)}
                placeholder='100  o  "pagada"  o  doc.subtotal'
                className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
              />
              <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                Números y <code>path.como.este</code> se evalúan; el resto se trata como cadena
                literal.
              </div>
            </>
          )}
          <Label>Si se cumple</Label>
          <ExpandableTextarea
            value={element.thenText}
            onChange={(v) => patch({ thenText: v } as any)}
            rows={3}
            mono
            placeholder="Pagada · {{formatCurrency doc.total}}"
            modalTitle="Editor: si se cumple"
          />
          <Label>Si no se cumple (opcional)</Label>
          <ExpandableTextarea
            value={element.elseText ?? ''}
            onChange={(v) => patch({ elseText: v || undefined } as any)}
            rows={3}
            mono
            placeholder="Pendiente"
            modalTitle="Editor: si no se cumple"
          />
          <ExprCommands
            label="Insertar en «si se cumple»"
            onInsert={(snippet) =>
              patch({ thenText: appendSnippet(element.thenText, snippet) } as any)
            }
          />
        </Section>
      )}

      {/* Estilo común */}
      {'style' in element && (
        <Section title="Estilo">
          {element.kind !== 'shape' && element.kind !== 'image' && (
            <>
              <Label>Fuente</Label>
              <select
                value={element.style?.fontFamily ?? ''}
                onChange={(e) =>
                  patch({
                    style: {
                      ...(element.style ?? {}),
                      fontFamily: e.target.value || undefined,
                    },
                  } as any)
                }
                className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="">Por defecto del sistema</option>
                <option value="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
                  Sans-serif
                </option>
                <option value="Georgia, 'Times New Roman', serif">Serif (Georgia)</option>
                <option value="'Times New Roman', Times, serif">Times New Roman</option>
                <option value="Arial, Helvetica, sans-serif">Arial / Helvetica</option>
                <option value="'Courier New', Courier, monospace">Courier (mono)</option>
                <option value="'Trebuchet MS', sans-serif">Trebuchet</option>
                <option value="Verdana, sans-serif">Verdana</option>
              </select>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Tamaño (pt)</div>
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
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Color</div>
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
                  title="Negrita"
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
                  title="Cursiva"
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
                  title="Izquierda"
                >
                  ⬅
                </StyleToggleButton>
                <StyleToggleButton
                  active={element.style?.textAlign === 'center'}
                  onClick={() =>
                    patch({ style: { ...(element.style ?? {}), textAlign: 'center' } } as any)
                  }
                  title="Centro"
                >
                  ↔
                </StyleToggleButton>
                <StyleToggleButton
                  active={element.style?.textAlign === 'right'}
                  onClick={() =>
                    patch({ style: { ...(element.style ?? {}), textAlign: 'right' } } as any)
                  }
                  title="Derecha"
                >
                  ➡
                </StyleToggleButton>
              </div>
            </>
          )}

          <Label>Color de fondo</Label>
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
              Transparente
            </button>
          </div>

          <Label>Borde</Label>
          <div className="grid grid-cols-[1fr_70px_70px] gap-2 items-end">
            <label className="block">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Estilo</div>
              <select
                value={element.style?.borderStyle ?? 'none'}
                onChange={(e) => {
                  const v = e.target.value as 'none' | 'solid' | 'dashed' | 'dotted';
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
                className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="none">Sin borde</option>
                <option value="solid">Línea</option>
                <option value="dashed">Guiones</option>
                <option value="dotted">Puntos</option>
              </select>
            </label>
            <label className="block">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Grosor (px)</div>
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
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Color</div>
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
}> = ({ element, onPatch, extraLineFields = [] }) => {
  const baseLineGroup = getLineFieldGroup();
  const lineGroup = baseLineGroup
    ? { ...baseLineGroup, fields: [...baseLineGroup.fields, ...extraLineFields] }
    : null;
  const updateColumn = (idx: number, changes: Partial<LinesTableColumn>) => {
    onPatch({
      columns: element.columns.map((c, i) => (i === idx ? { ...c, ...changes } : c)),
    });
  };
  const addColumn = () => {
    onPatch({
      columns: [
        ...element.columns,
        {
          id: `col_${Date.now().toString(36)}`,
          label: 'Nueva',
          path: 'itemName',
          widthPct: 10,
          align: 'left',
        },
      ],
    });
  };
  const removeColumn = (idx: number) => {
    onPatch({ columns: element.columns.filter((_, i) => i !== idx) });
  };

  return (
    <Section title="Tabla de líneas">
      <Toggle
        label="Mostrar cabecera"
        checked={element.showHeader !== false}
        onChange={(v) => onPatch({ showHeader: v })}
      />
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Columnas ({element.columns.length})</Label>
          <button
            type="button"
            onClick={addColumn}
            className="text-[11px] px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600"
          >
            + Añadir
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
                placeholder="Cabecera"
                className="flex-1 px-1.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <button
                type="button"
                onClick={() => removeColumn(idx)}
                className="text-[11px] px-1.5 py-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                title="Borrar columna"
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
                title="% ancho"
                className="px-1.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
            <div className="grid grid-cols-2 gap-1">
              <select
                value={col.align ?? 'left'}
                onChange={(e) => updateColumn(idx, { align: e.target.value as any })}
                className="px-1.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                <option value="left">Izq</option>
                <option value="center">Centro</option>
                <option value="right">Der</option>
              </select>
              <select
                value={col.format ?? ''}
                onChange={(e) =>
                  updateColumn(idx, { format: (e.target.value || undefined) as any })
                }
                className="px-1.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                <option value="">—</option>
                <option value="currency">€</option>
                <option value="number">#</option>
                <option value="date">📅</option>
                <option value="percent">%</option>
                <option value="address">🏠</option>
              </select>
            </div>
            {lineGroup && (
              <details className="text-[11px]">
                <summary className="cursor-pointer text-slate-500">Elegir campo de línea…</summary>
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
}> = ({ value, onChange, defaultColor }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const lastEmitted = useRef<string>(value);
  const [color, setColor] = useState(defaultColor || '#1e40af');
  const [bgColor, setBgColor] = useState('#fef08a');

  // Sincroniza el contenido cuando `value` cambia desde fuera (p.ej. cambias
  // de elemento seleccionado). Evitamos re-set si lo último emitido por el
  // editor coincide para no romper la posición del cursor.
  useEffect(() => {
    if (!ref.current) return;
    if (value !== lastEmitted.current) {
      ref.current.innerHTML = value || '';
      lastEmitted.current = value;
    }
  }, [value]);

  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const emit = () => {
    if (!ref.current) return;
    const html = ref.current.innerHTML;
    lastEmitted.current = html;
    onChange(html);
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
          title="Negrita (Ctrl+B)"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => exec('italic')}
          className={`${btnCls} italic`}
          title="Cursiva (Ctrl+I)"
        >
          I
        </button>
        <button
          type="button"
          onClick={() => exec('underline')}
          className={`${btnCls} underline`}
          title="Subrayado (Ctrl+U)"
        >
          U
        </button>
        <button
          type="button"
          onClick={() => exec('strikeThrough')}
          className={`${btnCls} line-through`}
          title="Tachado"
        >
          S
        </button>
        <span className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
        <label className="flex items-center gap-1" title="Color del texto seleccionado">
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
        <label className="flex items-center gap-1" title="Color de fondo del texto seleccionado">
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
          title="Alinear izquierda"
        >
          ⯇
        </button>
        <button
          type="button"
          onClick={() => setBlockAlign('center')}
          className={btnCls}
          title="Centrar"
        >
          ≡
        </button>
        <button
          type="button"
          onClick={() => setBlockAlign('right')}
          className={btnCls}
          title="Alinear derecha"
        >
          ⯈
        </button>
        <span className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
        <button type="button" onClick={clearFormat} className={btnCls} title="Quitar formato">
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
        style={{ lineHeight: 1.4 }}
      />
      <div className="text-[10px] text-slate-400 leading-snug">
        Selecciona texto y aplica formato. Ctrl+B/I/U también funcionan. El formato se exporta como
        HTML al PDF.
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
  const [query, setQuery] = useState('');
  const [openGroup, setOpenGroup] = useState<string | null>(groups[0]?.group ?? null);

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
        placeholder="Buscar campo…"
        className="w-full px-2 py-1.5 text-xs bg-transparent border-b border-slate-200 dark:border-slate-700 focus:outline-none"
      />
      <div className="max-h-56 overflow-y-auto">
        {filteredGroups.length === 0 && (
          <div className="px-3 py-3 text-xs text-slate-400 italic">Sin resultados</div>
        )}
        {filteredGroups.map((g) => {
          const expanded = normalizedQuery ? true : openGroup === g.group;
          return (
            <div
              key={g.group}
              className="border-b border-slate-200 dark:border-slate-700 last:border-0"
            >
              <button
                type="button"
                onClick={() => setOpenGroup(expanded ? null : g.group)}
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

const EXPR_COMMANDS: ExprCommand[] = [
  {
    group: 'Campos',
    label: 'Campo simple',
    snippet: '{{doc.docCode}}',
    hint: 'Imprime el valor tal cual',
  },
  {
    group: 'Campos',
    label: 'Campo (HTML crudo)',
    snippet: '{{{company.logoUrl}}}',
    hint: 'No escapa el HTML',
  },
  { group: 'Formato', label: 'Moneda', snippet: '{{formatCurrency doc.total}}' },
  { group: 'Formato', label: 'Número', snippet: '{{formatNumber valor 2}}', hint: '2 = decimales' },
  { group: 'Formato', label: 'Fecha', snippet: '{{formatDate doc.issueDate}}' },
  {
    group: 'Formato',
    label: 'Dirección (multilínea)',
    snippet: '{{{formatAddress partner.billingAddress}}}',
  },
  { group: 'Formato', label: 'Padding a la izquierda', snippet: '{{padLeft valor 6 "0"}}' },
  { group: 'Matemáticas', label: 'Multiplicar', snippet: '{{multiply precio cantidad}}' },
  {
    group: 'Condicional',
    label: 'Si / si no',
    snippet: '{{#if doc.paid}}Pagada{{else}}Pendiente{{/if}}',
  },
  { group: 'Condicional', label: 'Si NO (unless)', snippet: '{{#unless doc.notes}}—{{/unless}}' },
  { group: 'Condicional', label: 'Igual a', snippet: '{{#if (eq doc.status "paid")}}OK{{/if}}' },
  {
    group: 'Condicional',
    label: 'Distinto de',
    snippet: '{{#if (neq doc.status "paid")}}!{{/if}}',
  },
  { group: 'Condicional', label: 'Mayor que', snippet: '{{#if (gt doc.total 100)}}grande{{/if}}' },
  { group: 'Condicional', label: 'Menor que', snippet: '{{#if (lt doc.total 100)}}pequeño{{/if}}' },
  {
    group: 'Iteración',
    label: 'Líneas del documento',
    snippet: '{{#each lines}}{{itemName}} x{{quantity}}\n{{/each}}',
  },
  {
    group: 'Iteración',
    label: 'Desglose de IVA',
    snippet: '{{#each doc.taxBreakdown}}IVA {{rate}}%: {{formatCurrency amount}}\n{{/each}}',
  },
  {
    group: 'Códigos',
    label: 'QR (data URI)',
    snippet: '<img src="{{{qrCode doc.docCode}}}" style="width:25mm;height:25mm" />',
  },
  {
    group: 'Códigos',
    label: 'Código de barras',
    snippet:
      '<img src="{{{barcode doc.docCode symbology="code128" includeText=true}}}" style="width:60mm;height:15mm" />',
  },
];

const ExprCommands: React.FC<{ onInsert: (snippet: string) => void; label?: string }> = ({
  onInsert,
  label = 'Comandos disponibles',
}) => {
  const groups = Array.from(new Set(EXPR_COMMANDS.map((c) => c.group)));
  return (
    <details className="text-[11px] rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
      <summary className="cursor-pointer px-2 py-1.5 select-none font-semibold text-slate-600 dark:text-slate-300">
        ⌘ {label}
      </summary>
      <div className="px-2 pb-2 pt-1 space-y-2">
        {groups.map((g) => (
          <div key={g}>
            <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-0.5">
              {g}
            </div>
            <div className="flex flex-wrap gap-1">
              {EXPR_COMMANDS.filter((c) => c.group === g).map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => onInsert(c.snippet)}
                  title={`${c.hint ? c.hint + ' — ' : ''}${c.snippet}`}
                  className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="text-[10px] text-slate-400 dark:text-slate-500 pt-1">
          Al pulsar un comando se añade su plantilla al final del texto. Edítala después para usar
          tus paths.
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
}> = ({ value, onChange, rows = 3, mono = false, placeholder, modalTitle = 'Editor' }) => {
  const [expanded, setExpanded] = useState(false);
  const baseCls = `w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm ${mono ? 'font-mono' : ''}`;
  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={baseCls}
      />
      <button
        type="button"
        onClick={() => setExpanded(true)}
        title="Abrir editor grande"
        className="absolute top-1 right-1 px-1.5 py-0.5 text-[11px] rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
      >
        ⛶ editor
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
                  {modalTitle}
                </div>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title="Cerrar"
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
                  {value.length} car · {value.split('\n').length} líneas
                </span>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                >
                  Listo
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};
