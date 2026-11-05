import { useEffect, useRef, useState } from 'react';
import { useToast } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { templatesApi } from '../api';
import {
  buildSimpleLabelLayout,
  defaultSimpleArticleSettings,
} from '../components/canvas/buildSimpleLabel';
import { compileCanvas } from '../components/canvas/compileCanvas';
import { createEmptyLayout, type CanvasLayout } from '../components/canvas/types';
import type { TemplateRow } from '../components/constants';
import { loadStarterLayout } from './starterLayout';

export type SaveState = 'saved' | 'dirty' | 'saving';

/** La plantilla que se edita: cargarla, guardarla y el autoguardado. */
export function useTemplateDocument(id: string | undefined) {
  const { t } = useI18n();
  const toast = useToast();
  const { user } = useAuth();

  const [template, setTemplate] = useState<TemplateRow | null>(null);
  const [layout, setLayout] = useState<CanvasLayout>(createEmptyLayout());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // 'saved' = todo guardado; 'dirty' = hay cambios sin guardar; 'saving' = guardando ahora.
  // `lastSavedRef` guarda la última versión persistida para no guardar si no cambió nada.
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const lastSavedRef = useRef<string>('');
  // Una plantilla que aún no se hizo aquí (la estándar, una del modo visual) funciona con
  // su propio HTML: el lienzo la sustituye al guardar, así que eso lo decide el usuario.
  // Tras ese primer guardado ya sí hay autoguardado.
  const [autosaveOn, setAutosaveOn] = useState(false);
  /**
   * Modo del editor para plantillas LABEL: 'simple' = formulario; 'advanced' = lienzo.
   * Si el layout trae `simpleLabel` arrancamos en 'simple'; si no, en 'advanced'.
   */
  const [labelEditMode, setLabelEditMode] = useState<'simple' | 'advanced'>('simple');

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
        let opened: CanvasLayout;
        if (data.canvasLayout && data.canvasLayout.version === 1) {
          opened = data.canvasLayout;
          // Si el layout fue construido por el modo simple, abrimos en simple.
          setLabelEditMode((data.canvasLayout as any).simpleLabel ? 'simple' : 'advanced');
        } else if (data.docType === 'LABEL') {
          // Etiqueta nueva → modo simple con defaults de artículo, la ruta más rápida
          // para tener una etiqueta funcional sin tocar el lienzo.
          opened = buildSimpleLabelLayout(defaultSimpleArticleSettings());
          setLabelEditMode('simple');
        } else if (data.docType === 'FREE') {
          // Documento Libre nuevo → lienzo en blanco; se diseña desde cero.
          opened = createEmptyLayout();
          setLabelEditMode('advanced');
        } else {
          // Un documento entra como se estaba viendo, no en blanco.
          opened = await loadStarterLayout(data.docType, data.html);
          if (cancelled) return;
        }
        setLayout(opened);
        // Marcamos esta versión como "guardada" para que abrir no guarde nada.
        lastSavedRef.current = JSON.stringify(opened);
        // Si no se diseñó aquí, lo que hay es otro HTML: solo se sustituye al pulsar Guardar.
        setAutosaveOn(data.canvasLayout?.version === 1);
        setSaveState('saved');
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

  const save = async (opts: { silent?: boolean } = {}) => {
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
      // El servidor la renombra si era la estándar: que el siguiente guardado no lo deshaga.
      const saved = await templatesApi.get(template.id);
      setTemplate((prev) => (prev ? { ...prev, name: saved.name } : prev));
      setAutosaveOn(true);
      lastSavedRef.current = snapshot;
      // Si entretanto el usuario siguió editando, queda 'dirty'; si no, 'saved'.
      setSaveState(JSON.stringify(layout) === snapshot ? 'saved' : 'dirty');
      if (!opts.silent) toast.success(t('templates.designer.toast.saved'));
    } catch {
      setSaveState('dirty');
      // El autoguardado no molesta con toasts; el manual sí avisa del fallo.
      if (!opts.silent) toast.error(t('templates.designer.toast.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const rename = async (name: string) => {
    if (!template || !name.trim() || name === template.name) return;
    await templatesApi.update(template.id, { name: name.trim() });
    setTemplate({ ...template, name: name.trim() });
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
    if (!autosaveOn) return;
    const handle = setTimeout(() => {
      if (!saving) save({ silent: true });
    }, 1500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, loading, template, autosaveOn]);

  return {
    template,
    layout,
    setLayout,
    loading,
    saving,
    saveState,
    /** Aún no se ha guardado nunca en el lienzo: lo que hay no ha tocado la plantilla. */
    isDraft: !autosaveOn,
    labelEditMode,
    setLabelEditMode,
    save,
    rename,
  };
}
