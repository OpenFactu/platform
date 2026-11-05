import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  ContextMenu,
  Loader,
  Modal,
  SegmentedControl,
  usePopup,
  useToast,
} from '@openfactu/ui';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { saveBlob } from '@/utils/downloadPdf';
import { templatesApi } from '../api';
import {
  buildSimpleLabelLayout,
  defaultSimpleArticleSettings,
} from '../components/canvas/buildSimpleLabel';
import { compileCanvas } from '../components/canvas/compileCanvas';
import { CssEditorModal } from '../components/canvas/CssEditorModal';
import { ImportFromTemplateDialog } from '../components/canvas/ImportFromTemplateDialog';
import {
  createDocumentLabelLayout,
  createEmptyLayout,
  createLabelLayout,
  resolvePageDimensions,
  type CanvasLayout,
} from '../components/canvas/types';
import { usePluginFields } from '../components/canvas/usePluginFields';
import { useQueryFields } from '../components/canvas/useQueryFields';
import { SimpleLabelEditor } from '../components/SimpleLabelEditor';
import { useUserDocFieldGroups } from '../components/useUserDocFieldGroups';
import { AddPanel } from '../designer/AddPanel';
import { blocksFor } from '../designer/blocks';
import { CanvasArea } from '../designer/CanvasArea';
import { buildContextItems } from '../designer/contextMenu';
import { buildFieldDescriptors } from '../designer/fieldDescriptors';
import { InspectorPanel } from '../designer/inspector/InspectorPanel';
import { findElement } from '../designer/layoutOps';
import { paperExtraCss } from '../designer/paperRender';
import { PreviewContext } from '../designer/PreviewContext';
import { QueriesPanel } from '../designer/QueriesPanel';
import { Toolbar } from '../designer/Toolbar';
import type { CtxTarget } from '../designer/types';
import { useCanvasZoom } from '../designer/useCanvasZoom';
import { useDesignerDrag } from '../designer/useDesignerDrag';
import { useDesignerHistory } from '../designer/useDesignerHistory';
import { useDesignerKeyboard } from '../designer/useDesignerKeyboard';
import { useElementRenders } from '../designer/useElementRenders';
import { useLayoutEditor } from '../designer/useLayoutEditor';
import { useTemplateDocument } from '../designer/useTemplateDocument';

const pickFile = (accept: string, onPick: (file: File) => void) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = () => {
    if (input.files?.[0]) onPick(input.files[0]);
  };
  input.click();
};

export const DocumentTemplateDesigner: React.FC = () => {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const popup = usePopup();
  const { token, user } = useAuth();

  const doc = useTemplateDocument(id);
  const { template, layout, setLayout, loading } = doc;
  const docType = template?.docType;
  const isLabel = docType === 'LABEL';
  const isFreeOrLabel = docType === 'FREE' || isLabel;

  const editor = useLayoutEditor(layout, setLayout, docType);
  const history = useDesignerHistory({
    layout,
    setLayout,
    ready: !loading && !!template,
    onRestore: () => editor.setSelection([]),
  });
  const { zoom, containerRef, zoomIn, zoomOut, zoomFit } = useCanvasZoom(
    resolvePageDimensions(layout).width,
  );
  const drag = useDesignerDrag({
    layout,
    setLayout,
    selection: editor.selection,
    select: editor.setSelection,
    docType,
    zoom,
  });
  useDesignerKeyboard({
    editor,
    undo: history.undo,
    redo: history.redo,
    save: () => void doc.save(),
    enabled: !loading,
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // ---- Pantalla completa ----
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
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

  // ---- Lo que se pinta en el papel ----
  const [dataChoice, setDataChoice] = useState<boolean | null>(null);
  // Una plantilla libre solo tiene los datos de sus consultas: sin ellas, los nombres.
  const showData = dataChoice ?? (!isFreeOrLabel || !!layout.queries?.length);
  const { renders, failed } = useElementRenders(layout, docType, showData);
  const previewValue = useMemo(
    () => ({ renders, failed, customCss: paperExtraCss(layout) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [renders, failed, layout.customCss, layout.fontFamily, layout.lineHeight],
  );

  // ---- Campos disponibles ----
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token ?? ''}`,
    'x-tenant-id': user?.tenantId ?? '',
    'Content-Type': 'application/json',
  };
  const { pluginGroup, linePluginFields } = usePluginFields(docType, headers);
  const userDocGroups = useUserDocFieldGroups(docType);
  // Las consultas SQL (solo admins) aportan sus columnas; en FREE/LABEL, que no tienen
  // catálogo de documento, son lo único que hay junto con los params.
  const canUseQueries = user?.role === 'ADMIN' || user?.role === 'SUPERUSER';
  const {
    fieldGroups: queryFieldGroups,
    queryColumns,
    queryErrors,
  } = useQueryFields(layout.queries, layout.testParams, headers, canUseQueries, docType);
  const fields = buildFieldDescriptors({
    isFreeOrLabel,
    queryColumns,
    paramKeys: Object.keys(layout.testParams ?? {}),
    pluginGroup,
    linePluginFields,
    userDocGroups,
  });
  const blocks = useMemo(() => blocksFor(docType), [docType]);

  // ---- Vista previa ----
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

  // ---- Importar y exportar el diseño ----
  const [importOpen, setImportOpen] = useState(false);
  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
    const name = template?.name || t('templates.designer.exportFileName');
    saveBlob(blob, `${name.replace(/\s+/g, '_')}.canvas.json`);
  };
  const handleImportJsonFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.bands)) {
        throw new Error(t('templates.designer.toast.invalidFormat'));
      }
      setLayout(parsed as CanvasLayout);
      editor.setSelection([]);
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
      const data = (await templatesApi.get(sourceId)) as unknown as {
        name: string;
        canvasLayout?: CanvasLayout | null;
      };
      if (!data.canvasLayout || data.canvasLayout.version !== 1) {
        toast.error(t('templates.designer.toast.noCanvasLayout'));
        return;
      }
      setLayout(data.canvasLayout);
      editor.setSelection([]);
      setImportOpen(false);
      toast.success(t('templates.designer.toast.importedFrom', { name: data.name }));
    } catch {
      toast.error(t('templates.designer.toast.importTemplateError'));
    }
  };

  const replaceLayout = async (message: string, next: () => CanvasLayout) => {
    const ok = await popup.confirm({
      title: t('templates.designer.toolbar.replaceTitle'),
      message,
      tone: 'danger',
      confirmLabel: t('templates.designer.toolbar.replaceConfirm'),
    });
    if (!ok) return;
    setLayout(next());
    editor.setSelection([]);
  };

  // ---- Menú contextual y CSS ----
  const [ctxMenu, setCtxMenu] = useState<CtxTarget | null>(null);
  const [cssElementId, setCssElementId] = useState<string | null>(null);
  const [globalCssOpen, setGlobalCssOpen] = useState(false);
  const cssElement = cssElementId ? findElement(layout, cssElementId) : null;
  const queryNames = (layout.queries ?? []).map((q) => q.name);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader label={t('templates.designer.loadingTemplate')} />
      </div>
    );
  }

  return (
    <div ref={rootRef} className="absolute inset-0 flex flex-col bg-bg-app">
      <Toolbar
        title={template?.name ?? t('templates.designer.untitled')}
        onRename={doc.rename}
        onBack={() => navigate('/document-templates')}
        onSave={() => void doc.save()}
        saving={doc.saving}
        saveState={doc.saveState}
        isDraft={doc.isDraft}
        onToggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
        onExport={handleExportJson}
        onImport={() => pickFile('application/json,.json', handleImportJsonFile)}
        onImportFromTemplate={() => setImportOpen(true)}
        onEditCss={() => setGlobalCssOpen(true)}
        onClear={() =>
          replaceLayout(t('templates.designer.toolbar.clearConfirm'), createEmptyLayout)
        }
        onPreview={handlePreview}
        previewLoading={previewLoading}
        onUndo={history.undo}
        onRedo={history.redo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        zoom={zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomFit={zoomFit}
        showData={showData}
        onShowDataChange={setDataChoice}
      />

      {doc.isDraft && !isLabel && (
        <Alert tone="info" role="note" className="rounded-none border-x-0 border-t-0">
          {t('templates.designer.draftNotice')}
        </Alert>
      )}

      {isLabel && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border-subtle bg-bg-card text-xs flex-wrap">
          <span className="font-semibold text-fg-body">{t('templates.designer.label.mode')}</span>
          <SegmentedControl
            size="sm"
            aria-label={t('templates.designer.label.mode')}
            options={[
              { value: 'simple', label: t('templates.designer.label.simple') },
              { value: 'advanced', label: t('templates.designer.label.advanced') },
            ]}
            value={doc.labelEditMode}
            onChange={(mode) => {
              if (mode === 'simple' && !(layout as any).simpleLabel) {
                // Sin simpleLabel no hay forma de mapear el layout al formulario →
                // reconstruimos a defaults de artículo (el avanzado permite deshacer).
                setLayout(buildSimpleLabelLayout(defaultSimpleArticleSettings()));
                editor.setSelection([]);
              }
              doc.setLabelEditMode(mode);
            }}
          />
          {doc.labelEditMode === 'advanced' && (
            <>
              <span className="font-semibold text-fg-body ml-2">
                {t('templates.designer.label.presets')}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  replaceLayout(
                    t('templates.designer.label.replaceArticleConfirm'),
                    createLabelLayout,
                  )
                }
              >
                {t('templates.designer.label.articleLabel')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  replaceLayout(
                    t('templates.designer.label.replaceDocumentConfirm'),
                    createDocumentLabelLayout,
                  )
                }
              >
                {t('templates.designer.label.documentLabel')}
              </Button>
            </>
          )}
        </div>
      )}

      <Modal
        isOpen={!!previewUrl}
        onClose={() => setPreviewUrl(null)}
        title={t('templates.designer.previewModal.title')}
        size="5xl"
        fullHeight
        noBodyPadding
        hideCancel
      >
        {previewUrl && (
          <iframe
            src={`${previewUrl}#navpanes=0`}
            className="w-full h-full min-h-[70vh] border-0"
            title={t('templates.designer.previewModal.iframeTitle')}
          />
        )}
      </Modal>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={buildContextItems(ctxMenu, layout, editor, {
            element: setCssElementId,
            page: () => setGlobalCssOpen(true),
          })}
          onClose={() => setCtxMenu(null)}
        />
      )}
      <CssEditorModal
        open={globalCssOpen}
        value={layout.customCss ?? ''}
        onChange={(v) => editor.updatePage({ customCss: v.trim() ? v : undefined })}
        onClose={() => setGlobalCssOpen(false)}
        title={t('templates.designer.css.globalTitle')}
        helpText={t('templates.designer.css.globalHelp')}
      />
      <CssEditorModal
        open={!!cssElement}
        value={cssElement?.customCss ?? ''}
        onChange={(v) =>
          cssElementId &&
          editor.updateElement(cssElementId, { customCss: v.trim() ? v : undefined })
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

      <PreviewContext.Provider value={previewValue}>
        {isLabel && doc.labelEditMode === 'simple' ? (
          <div className="flex flex-1 min-h-0 bg-bg-muted">
            <div className="flex-1 min-h-0">
              <SimpleLabelEditor
                settings={(layout as any).simpleLabel ?? defaultSimpleArticleSettings()}
                onChange={(next) => {
                  setLayout(next);
                  editor.setSelection([]);
                }}
              />
            </div>
            <CanvasArea
              layout={layout}
              zoom={1}
              selection={[]}
              onSelectElement={() => {}}
              onDeleteElement={() => {}}
              onResizeBand={() => {}}
              onResizeElement={() => {}}
            />
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            onDragStart={drag.onDragStart}
            onDragMove={drag.onDragMove}
            onDragEnd={drag.onDragEnd}
            onDragCancel={drag.onDragCancel}
          >
            <div className="flex flex-1 min-h-0">
              <AddPanel
                blocks={blocks}
                fields={fields}
                isFreeOrLabel={isFreeOrLabel}
                queries={
                  canUseQueries ? (
                    <QueriesPanel
                      queries={layout.queries ?? []}
                      columns={queryColumns}
                      errors={queryErrors}
                      docType={docType}
                      onChange={(next) =>
                        editor.updatePage({ queries: next.length ? next : undefined })
                      }
                      onAddTable={(name) => editor.addQueryTable(name, queryColumns[name] ?? [])}
                    />
                  ) : undefined
                }
                onAddBlock={editor.addBlock}
                onAddField={editor.addField}
                onAddElement={editor.addElement}
              />
              <CanvasArea
                layout={layout}
                zoom={zoom}
                containerRef={containerRef}
                selection={editor.selection}
                onSelectElement={editor.selectElement}
                onDeleteElement={editor.deleteElement}
                onResizeBand={(bandId, height) => editor.updateBand(bandId, { height })}
                onResizeElement={editor.resizeElement}
                onContext={setCtxMenu}
                guides={drag.guides}
                groupDrag={drag.groupDrag}
              />
              <InspectorPanel
                element={editor.selectedElement}
                selection={editor.selection}
                onChange={editor.updateElement}
                pluginGroup={pluginGroup}
                linePluginFields={linePluginFields}
                layout={layout}
                docType={docType}
                queryFieldGroups={queryFieldGroups}
                queryColumns={queryColumns}
                queryNames={queryNames}
                actions={{
                  duplicate: editor.duplicateElement,
                  remove: (elementId) => editor.deleteElement('', elementId),
                  toggleLock: editor.toggleLock,
                  alignToPage: editor.alignOne,
                }}
                onAlignSelection={editor.alignMany}
                onDistribute={editor.distribute}
                onRemoveSelection={editor.removeSelection}
                onUpdatePage={editor.updatePage}
                onUpdateBand={editor.updateBand}
                onAddBand={editor.addBand}
                onDeleteBand={editor.deleteBand}
                onMoveBand={editor.moveBand}
              />
            </div>
            <DragOverlay dropAnimation={null}>
              {drag.activeDrag ? (
                <div className="px-2 py-1 rounded shadow-lg text-xs font-medium pointer-events-none bg-primary text-primary-fg">
                  {drag.activeDrag.label}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </PreviewContext.Provider>
    </div>
  );
};
