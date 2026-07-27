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
import { Modal, Button, Input, Textarea, Badge, SearchableSelect, useToast } from '@openfactu/ui';
import { Sparkles, Save, AlertTriangle, Loader2, LayoutTemplate } from 'lucide-react';
import { useDocTypeOptions, type DocType } from './constants';
import { templatesApi } from '../api';

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
      toast.error(e instanceof Error ? e.message : 'Error en el preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const generate = async (refine: boolean) => {
    if (!description.trim()) {
      toast.error('Describe la plantilla que quieres');
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
        toast.warning(`Generada con ${data.warnings.length} query(s) con avisos`);
      } else {
        toast.success(`Plantilla generada en ${Math.round((data.ms || 0) / 1000)}s`);
      }
      void renderPreview(data.html, data.queries);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al generar');
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!result) return;
    if (!name.trim()) {
      toast.error('Ponle un nombre a la plantilla');
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
      toast.success(`Plantilla "${name.trim()}" guardada`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Generar plantilla con IA" maxWidth="6xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Columna izquierda: formulario ── */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-xs font-bold text-fg-muted uppercase tracking-wider">
                Tipo de documento
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
                Nombre
              </span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="p.ej. Factura minimalista azul"
              />
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-bold text-fg-muted uppercase tracking-wider">
              Descripción
            </span>
            <Textarea
              className="min-h-[80px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                docType === 'FREE' || docType === 'LABEL'
                  ? 'p.ej. Etiqueta 60x40mm con nombre del artículo, código de barras EAN y precio, a partir del parámetro :itemId'
                  : 'p.ej. Factura elegante con cabecera azul marino, logo a la izquierda, tabla de líneas con IVA desglosado y totales grandes'
              }
              disabled={generating}
            />
          </div>

          {!result && (
            <Button onClick={() => generate(false)} disabled={generating} className="w-full">
              <span className="inline-flex items-center gap-2">
                {generating ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                {generating ? 'Generando… (puede tardar un minuto)' : 'Generar'}
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
                  <span>
                    Generada con las opciones del modo Visual: al guardarla podrás seguir editándola
                    ahí, sin perder el diseño.
                  </span>
                </div>
              )}

              {result.queries.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-bold text-fg-muted uppercase tracking-wider">
                    Queries generadas
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
                            {warning ? 'inválida' : 'válida'}
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
                  Pedir ajustes
                </span>
                <Textarea
                  className="min-h-[80px] resize-y"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="p.ej. Haz la cabecera más compacta y añade el IBAN al pie"
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
                    {generating ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Sparkles size={16} />
                    )}
                    {generating ? 'Ajustando…' : 'Ajustar'}
                  </span>
                </Button>
                <Button onClick={save} disabled={saving || generating} className="flex-1">
                  <span className="inline-flex items-center gap-2">
                    <Save size={16} />
                    {saving ? 'Guardando…' : 'Guardar plantilla'}
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
              <Loader2 size={16} className="animate-spin" /> Renderizando PDF…
            </div>
          )}
          {!previewLoading && previewUrl && (
            <iframe title="Preview de la plantilla" src={previewUrl} className="w-full h-[70vh]" />
          )}
          {!previewLoading && !previewUrl && (
            <div className="text-sm text-slate-400 italic px-6 text-center">
              El preview del PDF aparecerá aquí tras generar.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
