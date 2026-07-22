/**
 * Modal "Generar plantilla con IA" (Fase 1 del asistente).
 *
 * El admin describe la plantilla en lenguaje natural; el backend
 * (`POST /api/document-templates/generate`) devuelve HTML Handlebars + queries
 * SQL validadas por el sandbox. Aquí se previsualiza el PDF real (reutilizando
 * `POST /preview`), se pueden pedir ajustes en iteraciones sucesivas y, cuando
 * convence, se guarda como plantilla normal (editable después en el diseñador).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Modal, Button, Input, Badge, SearchableSelect, useToast } from '@openfactu/ui';
import { Sparkles, Save, AlertTriangle, Loader2 } from 'lucide-react';
import { DOC_TYPE_OPTIONS, type DocType } from './constants';
import { useAuth } from '../../context/AuthContext';

interface GeneratedResult {
  html: string;
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
  const { token, user } = useAuth();
  const toast = useToast();
  const headers = {
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
    'Content-Type': 'application/json',
  };

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
      const res = await fetch('/api/document-templates/preview', {
        method: 'POST',
        headers,
        body: JSON.stringify({ html, docType, queries }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al renderizar el preview');
      }
      const blob = await res.blob();
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
        body.currentHtml = result.html;
        body.currentQueries = result.queries;
        body.feedback = feedback;
      }
      const res = await fetch('/api/document-templates/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al generar');
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
      const res = await fetch('/api/document-templates', {
        method: 'POST',
        headers,
        body: JSON.stringify({ docType, name: name.trim(), html: result.html }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');
      // Las queries viven en canvasLayout.queries (mismo sitio que usa el
      // diseñador y render-free); legacyHtml=true → se edita en modo avanzado.
      if (result.queries.length > 0) {
        const putRes = await fetch(`/api/document-templates/${data.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ canvasLayout: { queries: result.queries }, legacyHtml: true }),
        });
        if (!putRes.ok) {
          const err = await putRes.json().catch(() => ({}));
          throw new Error(err.error || 'Plantilla creada pero no se pudieron guardar las queries');
        }
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

  const textareaCls =
    'w-full rounded-md border border-slate-200 dark:border-slate-700 bg-transparent p-2 text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-accent/40 min-h-[80px] resize-y';

  return (
    <Modal isOpen onClose={onClose} title="Generar plantilla con IA" maxWidth="6xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Columna izquierda: formulario ── */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
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
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
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
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Descripción
            </span>
            <textarea
              className={textareaCls}
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
                <div className="text-xs p-2 rounded-md bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300">
                  {result.notes}
                </div>
              )}

              {result.queries.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Queries generadas
                  </span>
                  {result.queries.map((q) => {
                    const warning = result.warnings.find((w) => w.name === q.name);
                    return (
                      <div
                        key={q.name}
                        className="border border-slate-200 dark:border-slate-700 rounded-md p-2 space-y-1"
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
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Pedir ajustes
                </span>
                <textarea
                  className={textareaCls}
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
        <div className="border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden min-h-[60vh] flex items-center justify-center bg-slate-50 dark:bg-slate-900/40">
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
