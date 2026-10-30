/**
 * Modal "Generar plantilla con IA" (Fase 1 del asistente).
 *
 * El admin describe la plantilla en lenguaje natural y el backend
 * (`POST /api/document-templates/generate`) responde por uno de dos caminos,
 * según el tipo de documento — el mismo criterio que usa el diseñador para
 * decidir si ofrece modo Visual:
 *
 *  - **Tipos estándar** (factura, pedido, albarán…): devuelve `visualOptions` y
 *    el HTML ya construido con `buildVisualTemplate`, igual que el modo Visual
 *    del diseñador y que las tools del chat de Keiro. Se guarda tal cual: el
 *    meta va incrustado en el HTML, así que la plantilla se abre en modo Visual
 *    y es editable sin perder el diseño. Los ajustes iteran sobre las OPCIONES,
 *    no sobre el HTML.
 *  - **FREE/LABEL**: no hay payload de documento ni modo Visual, así que sigue
 *    siendo HTML Handlebars libre + queries SQL validadas por el sandbox, y se
 *    guarda con `legacyHtml: true` + las queries en `canvasLayout`.
 *
 * En ambos casos se previsualiza el PDF real (reutilizando `POST /preview`) y
 * se pueden pedir ajustes en iteraciones sucesivas antes de guardar.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Button,
  Input,
  Textarea,
  Badge,
  SearchableSelect,
  useToast,
  Spinner,
} from '@openfactu/ui';
import { Sparkles, Save, AlertTriangle, LayoutTemplate } from 'lucide-react';
import { useDocTypeOptions, type DocType } from './constants';
import { templatesApi } from '../api';
import { useI18n } from '@/i18n/I18nContext';

interface GeneratedResult {
  html: string;
  /** Solo en tipos estándar: opciones con las que se construyó el HTML. Su
   * presencia es lo que distingue los dos caminos (ver cabecera). */
  visualOptions?: Record<string, unknown>;
  queries: Array<{ name: string; sql: string }>;
  notes: string;
  warnings: Array<{ name: string; error: string }>;
  ms: number;
}

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export const AiTemplateGeneratorModal: React.FC<Props> = ({ onClose, onSaved }) => {
  const DOC_TYPE_OPTIONS = useDocTypeOptions();
  const toast = useToast();
  const { t } = useI18n();

  const [docType, setDocType] = useState<DocType>('SINV');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [feedback, setFeedback] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  // Liberar el blob del preview al desmontar.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const renderPreview = async (html: string, queries: GeneratedResult['queries']) => {
    setPreviewLoading(true);
    try {
      const { blob } = await templatesApi.previewPdf({ html, docType, queries });
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('templates.ai.previewError'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const generate = async (refine: boolean) => {
    if (!description.trim()) {
      toast.error(t('templates.ai.describeRequired'));
      return;
    }
    setGenerating(true);
    try {
      const body: Record<string, unknown> = { docType, description };
      if (refine && result) {
        body.feedback = feedback;
        if (result.visualOptions) {
          // Tipo estándar: se ajustan las OPCIONES, no el HTML — mandarle el
          // HTML al modelo le invitaría a reescribirlo a mano y perderíamos
          // la propiedad de "editable en modo Visual".
          body.currentVisualOptions = result.visualOptions;
        } else {
          body.currentHtml = result.html;
          body.currentQueries = result.queries;
        }
      }
      const data = (await templatesApi.generate(body)) as GeneratedResult;
      setResult(data);
      setFeedback('');
      if (data.warnings?.length) {
        toast.warning(t('templates.ai.generatedWithWarnings', { count: data.warnings.length }));
      } else {
        toast.success(
          t('templates.ai.generatedIn', { seconds: Math.round((data.ms || 0) / 1000) }),
        );
      }
      void renderPreview(data.html, data.queries);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('templates.ai.generateError'));
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!result) return;
    if (!name.trim()) {
      toast.error(t('templates.ai.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      const data = await templatesApi.create({ docType, name: name.trim(), html: result.html });
      // Tipo estándar: nada más que hacer. El HTML lleva el meta de
      // `buildVisualTemplate` incrustado y `legacyHtml` se queda en su valor
      // por defecto (true) — que es justo lo que abre el diseñador en modo
      // Visual. Ponerlo a false lo marcaría como plantilla del diseñador
      // canvas y forzaría el modo avanzado.
      //
      // FREE/LABEL: las queries viven en canvasLayout.queries (mismo sitio que
      // usa el diseñador y render-free).
      if (!result.visualOptions && result.queries.length > 0) {
        await templatesApi.update(data.id, {
          canvasLayout: { queries: result.queries },
          legacyHtml: true,
        });
      }
      toast.success(t('templates.ai.saved', { name: name.trim() }));
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('templates.ai.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={t('templates.ai.title')} maxWidth="6xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Columna izquierda: formulario ── */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-xs font-bold text-fg-muted uppercase tracking-wider">
                {t('templates.ai.docType')}
              </span>
              <SearchableSelect
                options={DOC_TYPE_OPTIONS}
                value={docType}
                onChange={(v) => setDocType(v as DocType)}
                disabled={Boolean(result)}
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-bold text-fg-muted uppercase tracking-wider">
                {t('templates.ai.name')}
              </span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('templates.ai.namePlaceholder')}
              />
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-bold text-fg-muted uppercase tracking-wider">
              {t('templates.ai.description')}
            </span>
            <Textarea
              className="min-h-[80px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                docType === 'FREE' || docType === 'LABEL'
                  ? t('templates.ai.descriptionPlaceholderLabel')
                  : t('templates.ai.descriptionPlaceholderDoc')
              }
              disabled={generating}
            />
          </div>

          {!result && (
            <Button onClick={() => generate(false)} disabled={generating} className="w-full">
              <span className="inline-flex items-center gap-2">
                {generating ? <Spinner size="sm" tone="inherit" /> : <Sparkles size={16} />}
                {generating ? t('templates.ai.generating') : t('templates.ai.generate')}
              </span>
            </Button>
          )}

          {result && (
            <>
              {result.notes && (
                <div className="text-xs p-2 rounded-md bg-bg-muted text-fg-body">
                  {result.notes}
                </div>
              )}

              {result.visualOptions && (
                <div className="text-xs p-2 rounded-md border border-border-default text-fg-muted flex items-start gap-2">
                  <LayoutTemplate size={14} className="shrink-0 mt-0.5 text-accent" />
                  <span>{t('templates.ai.visualNote')}</span>
                </div>
              )}

              {result.queries.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-bold text-fg-muted uppercase tracking-wider">
                    {t('templates.ai.generatedQueries')}
                  </span>
                  {result.queries.map((q) => {
                    const warning = result.warnings.find((w) => w.name === q.name);
                    return (
                      <div
                        key={q.name}
                        className="border border-border-default rounded-md p-2 space-y-1"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold">{q.name}</span>
                          <Badge variant={warning ? 'error' : 'success'}>
                            {warning ? t('templates.ai.invalid') : t('templates.ai.valid')}
                          </Badge>
                        </div>
                        <pre className="text-[11px] text-slate-500 whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                          {q.sql}
                        </pre>
                        {warning && (
                          <div className="text-[11px] text-rose-600 flex items-start gap-1">
                            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                            {warning.error}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="space-y-1">
                <span className="text-xs font-bold text-fg-muted uppercase tracking-wider">
                  {t('templates.ai.refine')}
                </span>
                <Textarea
                  className="min-h-[80px] resize-y"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder={t('templates.ai.refinePlaceholder')}
                  disabled={generating}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => generate(true)}
                  disabled={generating || !feedback.trim()}
                  className="flex-1"
                >
                  <span className="inline-flex items-center gap-2">
                    {generating ? <Spinner size="sm" tone="inherit" /> : <Sparkles size={16} />}
                    {generating ? t('templates.ai.adjusting') : t('templates.ai.adjust')}
                  </span>
                </Button>
                <Button onClick={save} disabled={saving || generating} className="flex-1">
                  <span className="inline-flex items-center gap-2">
                    <Save size={16} />
                    {saving ? t('templates.ai.saving') : t('templates.ai.save')}
                  </span>
                </Button>
              </div>
            </>
          )}
        </div>

        {/* ── Columna derecha: preview PDF ── */}
        <div className="border border-border-default rounded-md overflow-hidden min-h-[60vh] flex items-center justify-center bg-bg-muted">
          {previewLoading && (
            <div className="text-sm text-slate-400 flex items-center gap-2">
              <Spinner size="sm" tone="inherit" /> {t('templates.ai.rendering')}
            </div>
          )}
          {!previewLoading && previewUrl && (
            <iframe
              title={t('templates.ai.previewTitle')}
              src={previewUrl}
              className="w-full h-[70vh]"
            />
          )}
          {!previewLoading && !previewUrl && (
            <div className="text-sm text-slate-400 italic px-6 text-center">
              {t('templates.ai.previewEmpty')}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
