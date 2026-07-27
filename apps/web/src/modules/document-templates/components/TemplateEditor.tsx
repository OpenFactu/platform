import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTabs } from '@/context/TabsContext';
import { Card, Button, Input, useToast, SearchableSelect, cn } from '@openfactu/ui';
import { ArrowLeft, Save, PanelRightOpen, PanelRightClose, LayoutTemplate } from 'lucide-react';
import {
  buildVisualTemplate,
  parseMeta,
  DEFAULT_VISUAL_OPTIONS,
  type VisualOptions,
} from '@openfactu/pdf/browser';
import { useDocTypeOptions, type DocType, type TemplateRow } from './constants';
import { ModeTabs, type EditorMode } from './ModeTabs';
import { VisualForm } from './VisualForm';
import { AdvancedEditor, type AdvancedEditorHandle } from './AdvancedEditor';
import { PreviewPane } from './PreviewPane';
import { usePreview } from './usePreview';
import { FieldExplorer } from './FieldExplorer';
import { compileCanvas } from './canvas/compileCanvas';
import { buildSimpleLabelLayout, defaultSimpleArticleSettings } from './canvas/buildSimpleLabel';
import { createEmptyLayout, type CanvasLayout } from './canvas/types';
import { templatesApi } from '../api';

/**
 * Layout-semilla para una plantilla nueva sin documento ligado:
 *  - LABEL (Etiqueta) → etiqueta de artículo (editor simple).
 *  - FREE (Documento Libre) → lienzo en blanco A4 que se diseña desde cero.
 */
function seedLayoutFor(docType: DocType): CanvasLayout {
  return docType === 'LABEL'
    ? buildSimpleLabelLayout(defaultSimpleArticleSettings())
    : createEmptyLayout();
}

interface Props {
  template: TemplateRow | null;
  onBack: () => void;
  onSave: (t: Partial<TemplateRow>) => Promise<void>;
  token: string;
  tenantId: string;
}

export const TemplateEditor: React.FC<Props> = ({ template, onBack, onSave, token, tenantId }) => {
  const toast = useToast();
  const DOC_TYPE_OPTIONS = useDocTypeOptions();
  const navigate = useNavigate();
  const { openTab } = useTabs();
  const initialMeta = template?.html ? parseMeta(template.html) : null;
  const isNewTemplate = !template;
  // Si la plantilla fue diseñada con el canvas designer (legacyHtml === false),
  // su `html` ya está compilado por ese diseñador y NO debe regenerarse desde
  // este editor (visual o advanced). Forzamos modo advanced y deshabilitamos
  // la regeneración para que el preview muestre el diseño real.
  const isCanvasTemplate = (template as any)?.legacyHtml === false;

  const [name, setName] = useState(template?.name || 'Nueva plantilla');
  const [docType, setDocType] = useState<DocType>(template?.docType || 'SINV');
  const [isDefault, setIsDefault] = useState(!!template?.isDefault);
  // FREE y LABEL no tienen modo visual: el editor de visualOptions asume un documento
  // con header/totales/líneas que no aplica a una etiqueta libre. Forzamos
  // advanced para que el HTML se construya desde el diseñador canvas (o a mano).
  const isFreeOrLabelTemplate = docType === 'FREE' || docType === 'LABEL';
  const [mode, setMode] = useState<EditorMode>(
    isCanvasTemplate || isFreeOrLabelTemplate
      ? 'advanced'
      : isNewTemplate || initialMeta
        ? 'visual'
        : 'advanced',
  );
  const [visualOpts, setVisualOpts] = useState<VisualOptions>(
    initialMeta || DEFAULT_VISUAL_OPTIONS,
  );
  // Layout del canvas — sólo lo usamos para FREE/LABEL en este editor: al elegir
  // uno de esos tipos precargamos su layout-semilla (etiqueta de artículo para
  // LABEL, lienzo en blanco A4 para FREE) y persistimos su canvasLayout para que
  // el diseñador lo abra preconfigurado.
  const [canvasLayoutForSave, setCanvasLayoutForSave] = useState<any>(
    (template as any)?.canvasLayout ?? null,
  );

  const [html, setHtml] = useState(
    template?.html ||
      (isFreeOrLabelTemplate
        ? compileCanvas(seedLayoutFor(docType), { docType })
        : buildVisualTemplate('SINV', DEFAULT_VISUAL_OPTIONS)),
  );
  const [saving, setSaving] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(true);

  const advancedEditorRef = useRef<AdvancedEditorHandle | null>(null);

  // En modo visual, regenerar el HTML cada vez que cambian los opts o el docType.
  // Excepción: las plantillas hechas con el canvas designer no se regeneran
  // nunca desde aquí — su html viene del compileCanvas.
  useEffect(() => {
    if (isCanvasTemplate) return;
    if (isFreeOrLabelTemplate) {
      // Cuando el usuario cambia el tipo a FREE o LABEL (sobre una plantilla
      // nueva o que tenía html visual previo), regeneramos al layout-semilla del
      // tipo y cargamos su canvasLayout para que se persista al guardar y el
      // diseñador lo abra preconfigurado.
      if (!template?.html) {
        const seed = seedLayoutFor(docType);
        setHtml(compileCanvas(seed, { docType }));
        setCanvasLayoutForSave(seed);
      }
      return;
    }
    if (mode === 'visual') {
      setHtml(buildVisualTemplate(docType as Exclude<DocType, 'FREE' | 'LABEL'>, visualOpts));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualOpts, docType, mode, isCanvasTemplate, isFreeOrLabelTemplate]);

  const { previewUrl, previewing, refresh } = usePreview(html, docType, token, tenantId, (msg) =>
    toast.error(msg),
  );

  const updateOpt = <K extends keyof VisualOptions>(key: K, value: VisualOptions[K]) => {
    setVisualOpts((prev) => ({ ...prev, [key]: value }));
  };

  const switchToAdvanced = () => setMode('advanced');
  const switchToVisual = () => {
    if (mode === 'visual') return;
    const ok = confirm(
      'Cambiar a modo Visual regenerará el HTML a partir del formulario y perderás los cambios manuales. ¿Continuar?',
    );
    if (!ok) return;
    setMode('visual');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Para FREE y LABEL persistimos también canvasLayout + legacyHtml=false para
      // que el diseñador abra la plantilla con su layout completo.
      const payload: any = { id: template?.id, name, docType, html, isDefault };
      if (isFreeOrLabelTemplate && canvasLayoutForSave) {
        payload.canvasLayout = canvasLayoutForSave;
        payload.legacyHtml = false;
      }
      await onSave(payload);
      toast.success('Plantilla guardada');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleInsertField = (variablePath: string) => {
    if (mode === 'advanced' && advancedEditorRef.current) {
      advancedEditorRef.current.insertText(variablePath);
    }
  };

  const openDesigner = async () => {
    // Si ya existe, navegación directa.
    if (template?.id) {
      openTab(`/document-templates/${template.id}/designer`);
      return;
    }
    // Si es una plantilla nueva, la creamos ahora mismo para tener un id y
    // entrar al diseñador sin requerir al usuario un paso extra.
    setSaving(true);
    try {
      const { id } = await templatesApi.create({
        docType,
        name,
        html,
        isDefault,
        ...(isFreeOrLabelTemplate && canvasLayoutForSave
          ? { canvasLayout: canvasLayoutForSave, legacyHtml: false }
          : {}),
      });
      openTab(`/document-templates/${id}/designer`);
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || 'No se pudo abrir el diseñador');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden p-6 gap-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle pb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 bg-bg-card hover:bg-bg-hover border border-border-default rounded-xl text-fg-subtle hover:text-fg-body"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-black text-fg-default tracking-tighter">
              {template ? 'Editar Plantilla' : 'Nueva Plantilla'}
            </h1>
            <p className="text-xs text-fg-muted font-medium">
              {mode === 'visual'
                ? 'Personaliza colores, logo y secciones desde el formulario. No necesitas saber HTML.'
                : 'Editor HTML avanzado con variables Handlebars. Vista previa en vivo.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setExplorerOpen((o) => !o)}
            className="flex items-center gap-2 h-10"
            title={explorerOpen ? 'Ocultar campos' : 'Mostrar campos'}
          >
            {explorerOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            Campos
          </Button>
          <Button
            onClick={handleSave}
            isLoading={saving}
            className="flex items-center gap-2 h-10 px-6"
          >
            <Save size={16} /> Guardar
          </Button>
        </div>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-shrink-0">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-fg-subtle uppercase tracking-widest">
            Nombre
          </label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-fg-subtle uppercase tracking-widest">
            Tipo de documento
          </label>
          <SearchableSelect
            value={docType}
            onChange={(v) => setDocType(v as DocType)}
            options={DOC_TYPE_OPTIONS}
          />
        </div>
        <div className="flex items-end gap-2 pb-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-xs font-bold text-fg-body select-none">
              Usar como default para este tipo
            </span>
          </label>
        </div>
      </div>

      {isCanvasTemplate && (
        <div className="flex-shrink-0 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 text-xs text-amber-800 dark:text-amber-200">
          Esta plantilla se diseñó con el <strong>diseñador canvas</strong>. El HTML mostrado abajo
          se genera desde ese diseño. Si editas aquí, perderás los cambios al volver a abrir el
          diseñador. Pulsa <em>«Abrir diseñador»</em>.
        </div>
      )}

      {/* Tabs de modo + acceso al diseñador canvas */}
      <div className="flex-shrink-0 flex items-center gap-3">
        <ModeTabs mode={mode} onVisual={switchToVisual} onAdvanced={switchToAdvanced} />
        <button
          type="button"
          disabled={saving}
          onClick={openDesigner}
          className="flex items-center gap-2 px-3 py-2 rounded-xs text-xs font-bold bg-accent text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-accent/20"
          title={
            template?.id
              ? 'Abrir diseñador drag-and-drop a pantalla completa'
              : 'Crear la plantilla y abrir el diseñador'
          }
        >
          <LayoutTemplate size={14} />{' '}
          {template?.id ? 'Abrir diseñador' : 'Crear y abrir diseñador'}
        </button>
      </div>

      {/* Split: editor | preview | explorer (3 paneles flex) */}
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* Editor pane */}
        <div className="flex-1 min-w-0 min-h-0">
          <Card
            className="h-full border-border-subtle"
            noPadding
            bodyClassName="h-full flex flex-col overflow-hidden"
          >
            {mode === 'visual' ? (
              <VisualForm opts={visualOpts} updateOpt={updateOpt} />
            ) : (
              <AdvancedEditor ref={advancedEditorRef} value={html} onChange={setHtml} />
            )}
          </Card>
        </div>

        {/* Preview pane */}
        <div className="flex-1 min-w-0 min-h-0">
          <PreviewPane previewUrl={previewUrl} previewing={previewing} onRefresh={refresh} />
        </div>

        {/* Field explorer pane (plegable) */}
        <div
          className={cn(
            'transition-all duration-300 min-h-0',
            explorerOpen ? 'lg:w-80 w-full' : 'w-0 overflow-hidden',
          )}
        >
          {explorerOpen && (
            <Card
              className="h-full border-border-subtle"
              noPadding
              bodyClassName="h-full flex flex-col overflow-hidden"
            >
              <FieldExplorer
                onInsert={handleInsertField}
                insertMode={mode === 'advanced' ? 'insert' : 'copy'}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
