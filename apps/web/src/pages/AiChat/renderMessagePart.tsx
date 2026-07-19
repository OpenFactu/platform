import React from 'react';
import { Button, Badge } from '@openfactu/ui';
import { Wrench, Loader2, ShieldQuestion, Check, X, AlertTriangle } from 'lucide-react';
import { Markdown } from '../../components/ai/Markdown';
import { ToolResultView } from '../../components/ai/ToolResultView';
import { ComponentRenderer } from './ComponentRenderer';
import { FileDownloadCard } from './FileDownloadCard';
import { PdfPreviewCard } from './PdfPreviewCard';
import { AttachedDocumentChip } from './AttachedDocumentChip';
import { splitAttachedDocuments } from './splitAttachedDocuments';
import { ACTION_LABELS, TOOL_LABELS } from './constants';
import { ReasoningText } from './ReasoningText';
import { AttachmentThumb } from './AttachmentThumb';
import type { AddToolApprovalResponse, ChatMessage, ChatMessagePart } from './types';

export const isActionPart = (part: ChatMessagePart): boolean =>
  part.type.startsWith('tool-') && Boolean(ACTION_LABELS[part.type.slice('tool-'.length)]);

/** Tools que NO son acciones (no piden confirmación) pero SÍ son el resultado
 * real que hay que mostrar — como una acción, no deben esconderse dentro del
 * toggle "Ver proceso" junto con las tools de exploración. */
const DISPLAY_TOOL_NAMES = new Set([
  'render_component',
  'create_excel',
  'create_word',
  'create_pdf',
  'preview_document_template',
]);
export const isComponentPart = (part: ChatMessagePart): boolean =>
  part.type.startsWith('tool-') && DISPLAY_TOOL_NAMES.has(part.type.slice('tool-'.length));

/** "Proceso" = razonamiento + tools de LECTURA (qué consultó, qué vio). Todo lo
 * demás (texto final, adjuntos, tarjetas de acción, componentes, archivos) es
 * el resultado real y siempre va visible fuera del toggle de ProcessSection. */
export const isProcessPart = (part: ChatMessagePart): boolean =>
  part.type === 'reasoning' ||
  (part.type.startsWith('tool-') && !isActionPart(part) && !isComponentPart(part));

/** Renderiza una parte de mensaje (texto, razonamiento, adjunto o tool-call/acción). */
export function renderMessagePart(
  part: ChatMessagePart,
  i: number,
  role: ChatMessage['role'],
  addToolApprovalResponse: AddToolApprovalResponse,
): React.ReactNode {
  if (part.type === 'text') {
    // El usuario escribe texto plano; el asistente responde en Markdown.
    if (role === 'user') {
      // El texto extraído de documentos adjuntos (Excel/PDF/Word/CSV) viaja
      // concatenado en el propio mensaje para que el modelo lo lea — pero se
      // muestra como chips plegables, no como un muro de texto plano.
      const { userText, documents } = splitAttachedDocuments(part.text);
      if (documents.length === 0) {
        return (
          <div key={i} className="whitespace-pre-wrap break-words">
            {part.text}
          </div>
        );
      }
      return (
        <div key={i} className="space-y-2">
          {userText && <div className="whitespace-pre-wrap break-words">{userText}</div>}
          <div className="space-y-1.5">
            {documents.map((d, di) => (
              <AttachedDocumentChip
                key={di}
                filename={d.filename}
                text={d.text}
                truncated={d.truncated}
              />
            ))}
          </div>
        </div>
      );
    }
    return (
      <div key={i} className="break-words">
        <Markdown>{part.text}</Markdown>
      </div>
    );
  }

  if (part.type === 'reasoning') {
    return <ReasoningText key={i} text={part.text} streaming={part.state === 'streaming'} />;
  }

  if (part.type === 'file') {
    return (
      <div key={i} className="pt-1">
        <AttachmentThumb file={part} />
      </div>
    );
  }

  if (part.type.startsWith('tool-')) {
    const toolName = part.type.slice('tool-'.length);
    const p = part as {
      state?: string;
      input?: unknown;
      output?: unknown;
      approval?: { id: string; approved?: boolean };
    };

    // ── Confirmación pendiente de una acción ──
    if (p.state === 'approval-requested' && p.approval?.id) {
      const approvalId = p.approval.id;
      return (
        <div
          key={i}
          className="border-2 border-amber-300 dark:border-amber-600 rounded-md p-3 space-y-2 bg-amber-50/60 dark:bg-amber-900/20"
        >
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-xs font-bold">
            <ShieldQuestion size={14} />
            Confirmación requerida: {ACTION_LABELS[toolName] || toolName}
          </div>
          <pre className="text-[11px] text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-all max-h-48 overflow-y-auto custom-scrollbar bg-white/60 dark:bg-slate-900/40 rounded p-2">
            {JSON.stringify(p.input, null, 2)}
          </pre>
          <div className="flex gap-2">
            <Button
              onClick={() => void addToolApprovalResponse({ id: approvalId, approved: true })}
            >
              <span className="inline-flex items-center gap-2">
                <Check size={14} /> Confirmar
              </span>
            </Button>
            <Button
              variant="secondary"
              onClick={() => void addToolApprovalResponse({ id: approvalId, approved: false })}
            >
              <span className="inline-flex items-center gap-2">
                <X size={14} /> Rechazar
              </span>
            </Button>
          </div>
          <p className="text-[10px] text-amber-700/70 dark:text-amber-300/60">
            Nada se ejecuta hasta que confirmes.
          </p>
        </div>
      );
    }

    // ── Respuesta dada, a la espera de ejecutar/continuar ──
    if (p.state === 'approval-responded') {
      return (
        <div key={i} className="inline-flex items-center gap-2 text-[11px]">
          <Badge variant={p.approval?.approved ? 'success' : 'neutral'}>
            {p.approval?.approved ? 'Confirmada' : 'Rechazada'} ·{' '}
            {ACTION_LABELS[toolName] || toolName}
          </Badge>
        </div>
      );
    }

    if (p.state === 'output-denied') {
      return (
        <div key={i} className="inline-flex items-center gap-2 text-[11px]">
          <Badge variant="neutral">Acción rechazada · {ACTION_LABELS[toolName] || toolName}</Badge>
        </div>
      );
    }

    // ── Componente generado en el propio turno — se renderiza directo, sin
    //    confirmación (ver renderMessagePart isComponentPart). ──
    if (toolName === 'render_component') {
      const componentOutput = p.output as
        | { ok?: boolean; compiledCode?: string; error?: string }
        | undefined;
      if (p.state === 'output-available' && componentOutput?.ok && componentOutput.compiledCode) {
        return <ComponentRenderer key={i} compiledCode={componentOutput.compiledCode} />;
      }
      if ((p.state === 'output-available' && !componentOutput?.ok) || p.state === 'output-error') {
        return (
          <div
            key={i}
            className="flex items-center gap-2 text-xs p-2 rounded-md border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300"
          >
            <AlertTriangle size={13} className="shrink-0" />
            {componentOutput?.error || 'No se pudo generar el componente.'}
          </div>
        );
      }
      return (
        <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 size={13} className="animate-spin" /> Generando vista…
        </div>
      );
    }

    // ── Archivo generado en el propio turno (Excel/Word/PDF) — se ofrece
    //    para descargar directo, sin confirmación (mismo criterio que
    //    render_component: no toca datos del ERP, solo genera un archivo). ──
    if (toolName === 'create_excel' || toolName === 'create_word' || toolName === 'create_pdf') {
      const fileOutput = p.output as
        | { ok?: boolean; filename?: string; mimeType?: string; base64?: string; error?: string }
        | undefined;
      if (
        p.state === 'output-available' &&
        fileOutput?.ok &&
        fileOutput.filename &&
        fileOutput.mimeType &&
        fileOutput.base64
      ) {
        return (
          <FileDownloadCard
            key={i}
            filename={fileOutput.filename}
            mimeType={fileOutput.mimeType}
            base64={fileOutput.base64}
          />
        );
      }
      if ((p.state === 'output-available' && !fileOutput?.ok) || p.state === 'output-error') {
        return (
          <div
            key={i}
            className="flex items-center gap-2 text-xs p-2 rounded-md border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300"
          >
            <AlertTriangle size={13} className="shrink-0" />
            {fileOutput?.error || 'No se pudo generar el archivo.'}
          </div>
        );
      }
      return (
        <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 size={13} className="animate-spin" /> {TOOL_LABELS[toolName]}…
        </div>
      );
    }

    // ── Vista previa PDF de una plantilla de documento — antes de guardarla
    //    de verdad con create_document_template (esa sí pide confirmación). ──
    if (toolName === 'preview_document_template') {
      const previewOutput = p.output as
        | { ok?: boolean; pdfBase64?: string; error?: string }
        | undefined;
      if (p.state === 'output-available' && previewOutput?.ok && previewOutput.pdfBase64) {
        return (
          <PdfPreviewCard
            key={i}
            base64={previewOutput.pdfBase64}
            title="Vista previa de plantilla"
          />
        );
      }
      if ((p.state === 'output-available' && !previewOutput?.ok) || p.state === 'output-error') {
        return (
          <div
            key={i}
            className="flex items-center gap-2 text-xs p-2 rounded-md border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300"
          >
            <AlertTriangle size={13} className="shrink-0" />
            {previewOutput?.error || 'No se pudo generar la vista previa.'}
          </div>
        );
      }
      return (
        <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 size={13} className="animate-spin" /> Generando vista previa…
        </div>
      );
    }

    const done = p.state === 'output-available' || p.state === 'output-error';
    const transportFailed = p.state === 'output-error';
    const isAction = Boolean(ACTION_LABELS[toolName]);
    const output = p.output as { ok?: boolean; error?: string; docCode?: string } | undefined;
    const okAction = p.state === 'output-available' && isAction && output?.ok === true;
    // Una acción confirmada por el usuario puede EJECUTARSE y aun así fallar
    // (p.ej. la query del widget no valida, el cliente no existe...) — eso
    // llega como output-available con `ok: false`, no como output-error. Sin
    // distinguirlo, se veía como un chip gris cualquiera y el usuario no
    // sabía por qué "no se añadió" lo que pidió.
    const actionFailed =
      isAction && (transportFailed || (p.state === 'output-available' && output?.ok !== true));

    if (actionFailed) {
      return (
        <div
          key={i}
          className="border-2 border-rose-300 dark:border-rose-700 rounded-md p-3 space-y-1 bg-rose-50/60 dark:bg-rose-900/20"
        >
          <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 text-xs font-bold">
            <AlertTriangle size={14} />
            {ACTION_LABELS[toolName] || toolName} — no se completó
          </div>
          <p className="text-[11px] text-rose-700/90 dark:text-rose-300/80">
            {output?.error || 'El servidor no dio más detalles del error.'}
          </p>
        </div>
      );
    }

    return (
      <div key={i} className="space-y-1">
        <div
          className={`inline-flex items-center gap-2 text-[11px] px-2 py-1 rounded-md border ${
            transportFailed
              ? 'border-rose-200 text-rose-600 bg-rose-50 dark:bg-rose-900/20'
              : okAction
                ? 'border-emerald-200 text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-300'
                : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60'
          }`}
        >
          {done ? (
            okAction ? (
              <Check size={11} />
            ) : (
              <Wrench size={11} />
            )
          ) : (
            <Loader2 size={11} className="animate-spin" />
          )}
          {TOOL_LABELS[toolName] || toolName}
          {transportFailed && ' — error'}
          {okAction && output?.docCode && ` — ${output.docCode}`}
        </div>
        {/* Resultado real como componente (tabla/mini-gráfico), no solo el chip. */}
        {p.state === 'output-available' && !isAction && <ToolResultView output={p.output} />}
      </div>
    );
  }
  return null;
}
