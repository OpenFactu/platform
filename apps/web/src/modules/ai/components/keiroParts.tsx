import { Spinner } from '@openfactu/ui';
import React from 'react';
import { AITrace, registerMessagePart } from '@openfactu/ui/ai';
import { AlertTriangle, ShieldQuestion, Table2 } from 'lucide-react';
import { TOOL_LABELS } from '../domain/constants';
import type { PendingQuestionOutput } from '../domain/pendingQuestion';
import { AttachedDocumentChip } from './AttachedDocumentChip';
import { ComponentRenderer } from './ComponentRenderer';
import { FileDownloadCard } from './FileDownloadCard';
import { MessageFooter } from './MessageFooter';
import { PdfPreviewCard } from './PdfPreviewCard';
import { ToolResultView } from './ToolResultView';
import { t } from '@/i18n/i18n';

const SOURCE = 'keirost-ai';

const failure = (message: string) => (
  <div
    role="alert"
    className="flex items-center gap-2 text-xs p-2 rounded-md border border-danger/30 bg-danger-bg text-danger-fg"
  >
    <AlertTriangle size={13} className="shrink-0" />
    {message}
  </div>
);

const loading = (label: string) => (
  <div className="flex items-center gap-2 text-xs text-fg-subtle">
    <Spinner size="xs" tone="inherit" /> {label}
  </div>
);

interface Result<T> {
  done: boolean;
  failed: boolean;
  output?: T;
}

let registered = false;

/**
 * Partes de mensaje propias de Keirost para el chat de @openfactu/ui/ai. Las
 * produce `toAIMessages` como `{ type: 'custom', kind, data }`. Idempotente.
 */
export function registerKeiroParts(): void {
  if (registered) return;
  registered = true;

  registerMessagePart(
    'keiro-document',
    ({ data }) => {
      const d = data as { filename: string; text: string; truncated: boolean };
      return <AttachedDocumentChip filename={d.filename} text={d.text} truncated={d.truncated} />;
    },
    { source: SOURCE },
  );

  registerMessagePart(
    'keiro-component',
    ({ data }) => {
      const r = data as Result<{ compiledCode?: string; error?: string; ok?: boolean }>;
      if (r.done && r.output?.ok && r.output.compiledCode) {
        return <ComponentRenderer compiledCode={r.output.compiledCode} />;
      }
      if (r.failed) return failure(r.output?.error || t('ai.parts.componentError'));
      return loading(t('ai.parts.generatingView'));
    },
    { source: SOURCE },
  );

  registerMessagePart(
    'keiro-file',
    ({ data }) => {
      const r = data as Result<{
        ok?: boolean;
        filename?: string;
        mimeType?: string;
        base64?: string;
        error?: string;
      }> & { name: string };
      const o = r.output;
      if (r.done && o?.ok && o.filename && o.mimeType && o.base64) {
        return <FileDownloadCard filename={o.filename} mimeType={o.mimeType} base64={o.base64} />;
      }
      if (r.failed) return failure(o?.error || t('ai.parts.fileError'));
      return loading(
        `${TOOL_LABELS[r.name] ? t(TOOL_LABELS[r.name]) : t('ai.parts.generatingFile')}…`,
      );
    },
    { source: SOURCE },
  );

  registerMessagePart(
    'keiro-pdf',
    ({ data }) => {
      const r = data as Result<{ ok?: boolean; pdfBase64?: string; error?: string }>;
      if (r.done && r.output?.ok && r.output.pdfBase64) {
        return <PdfPreviewCard base64={r.output.pdfBase64} title={t('ai.parts.templatePreview')} />;
      }
      if (r.failed) return failure(r.output?.error || t('ai.parts.previewError'));
      return loading(t('ai.parts.generatingPreview'));
    },
    { source: SOURCE },
  );

  registerMessagePart(
    'keiro-question',
    ({ data }) => {
      const d = data as { loading?: boolean; pending?: boolean; question?: PendingQuestionOutput };
      if (d.loading) return loading(t('ai.parts.asking'));
      // La pendiente la fija PendingQuestionBar encima del compositor.
      if (d.pending || !d.question) return null;
      return (
        <div className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
          <ShieldQuestion size={12} className="text-accent/70 shrink-0" />
          {d.question.step && (
            <span className="font-mono text-accent/70">
              {t('ai.parts.step', {
                current: d.question.step.current,
                total: d.question.step.total,
              })}{' '}
              ·
            </span>
          )}
          {d.question.question}
        </div>
      );
    },
    { source: SOURCE },
  );

  registerMessagePart(
    'keiro-tool-result',
    ({ data }) => {
      const { outputs } = data as { outputs: unknown[] };
      return (
        <AITrace
          status="done"
          title={t('ai.parts.viewResults', { count: outputs.length })}
          icon={<Table2 size={14} />}
        >
          {/* Tablas anchas: scroll propio, sin partir las celdas letra a letra. */}
          <div className="max-h-80 max-w-full space-y-3 overflow-auto [&_table]:w-max [&_td]:whitespace-nowrap">
            {outputs.map((output, i) => (
              <ToolResultView key={i} output={output} />
            ))}
          </div>
        </AITrace>
      );
    },
    { source: SOURCE },
  );

  registerMessagePart(
    'keiro-footer',
    ({ data }) => {
      const d = data as {
        metadata?: unknown;
        estimate: { tokens: number; elapsedMs: number } | null;
      };
      return <MessageFooter metadata={d.metadata} estimate={d.estimate} />;
    },
    { source: SOURCE },
  );
}
