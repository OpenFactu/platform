import type { AIMessageData, AIMessagePart, AIToolStatus } from '@openfactu/ui/ai';
import { ACTION_LABELS, ASSISTANT_NAME, TOOL_LABELS } from './constants';
import { splitAttachedDocuments } from './splitAttachedDocuments';
import { t } from '@/i18n/i18n';
import type { PendingQuestionOutput } from './pendingQuestion';
import type { ChatMessage, ChatMessagePart } from './types';

/**
 * Traduce los mensajes del SDK (`useChat`) al modelo de @openfactu/ui/ai.
 *
 * Lo que la librería sabe pintar (texto, razonamiento, herramientas, adjuntos,
 * pasos) va con su tipo; lo propio de Keirost (widgets generados, descargas,
 * vista previa PDF, preguntas guiadas, documentos adjuntos, pie con tokens) va
 * como parte `custom` con un `kind` que registra `registerKeiroParts`.
 */

/** Tools que son el resultado real, no "proceso". */
const DISPLAY_TOOLS = new Set([
  'render_component',
  'create_excel',
  'create_word',
  'create_pdf',
  'preview_document_template',
  'ask_user_question',
]);
const FILE_TOOLS = new Set(['create_excel', 'create_word', 'create_pdf']);

interface ToolLike {
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: { id: string; approved?: boolean };
}

export interface ToAIMessagesOptions {
  /** Milisegundos que tardó cada respuesta, por id de mensaje. */
  timings: Record<string, number>;
  userAvatarUrl?: string | null;
  estimateTokens: (message: ChatMessage) => number;
}

const custom = (kind: string, data: unknown): AIMessagePart => ({ type: 'custom', kind, data });

function toolStatus(p: ToolLike, ok?: boolean): AIToolStatus {
  switch (p.state) {
    case 'approval-requested':
      return 'approval-required';
    case 'approval-responded':
      return p.approval?.approved ? 'running' : 'denied';
    case 'output-denied':
      return 'denied';
    case 'output-error':
      return 'error';
    case 'output-available':
      return ok === false ? 'error' : 'completed';
    default:
      return 'running';
  }
}

function toParts(message: ChatMessage, isLast: boolean): AIMessagePart[] {
  const parts: AIMessagePart[] = [];
  // Todas las tools de lectura (qué consultó, qué vio) se resumen en un único
  // bloque "Investigó en N pasos", en la posición de la primera.
  let steps: Extract<AIMessagePart, { type: 'steps' }> | null = null;
  let results: { outputs: unknown[] } | null = null;

  (message.parts as ChatMessagePart[]).forEach((part, i) => {
    if (part.type === 'text') {
      if (message.role === 'user') {
        const { userText, documents } = splitAttachedDocuments(part.text);
        if (userText || documents.length === 0) {
          parts.push({
            type: 'text',
            text: documents.length ? userText : part.text,
            format: 'plain',
          });
        }
        for (const d of documents) parts.push(custom('keiro-document', d));
      } else if (part.text) {
        parts.push({ type: 'text', text: part.text, format: 'markdown' });
      }
      return;
    }

    if (part.type === 'reasoning') {
      const streaming = part.state === 'streaming';
      if (part.text.trim() || streaming) {
        parts.push({ type: 'reasoning', text: part.text, streaming });
      }
      return;
    }

    if (part.type === 'file') {
      if (part.mediaType?.startsWith('image')) {
        parts.push({
          type: 'image',
          url: part.url,
          alt: part.filename || t('ai.messages.attachedImage'),
        });
      } else {
        parts.push({
          type: 'file',
          attachment: {
            id: `${message.id}-${i}`,
            name: part.filename || t('ai.messages.attachedFile'),
            mediaType: part.mediaType || 'application/octet-stream',
            url: part.url,
          },
        });
      }
      return;
    }

    if (!part.type.startsWith('tool-')) return;
    const name = part.type.slice('tool-'.length);
    const p = part as unknown as ToolLike;
    const out = p.output as
      | ({ ok?: boolean; error?: string; docCode?: string } & Record<string, unknown>)
      | undefined;
    const labelKey = ACTION_LABELS[name] || TOOL_LABELS[name];
    const label = labelKey ? t(labelKey) : name;

    // ── Acciones (piden confirmación) ──
    if (ACTION_LABELS[name]) {
      const status = toolStatus(p, out?.ok);
      parts.push({
        type: 'tool',
        tool: {
          id: p.approval?.id ?? `${message.id}-${i}`,
          name:
            status === 'approval-required'
              ? t('ai.messages.confirmationRequired', { label })
              : status === 'completed' && out?.docCode
                ? `${label} — ${out.docCode}`
                : label,
          description: status === 'approval-required' ? t('ai.messages.nothingRuns') : undefined,
          status,
          input: status === 'approval-required' ? p.input : undefined,
          error:
            status === 'error'
              ? out?.error || p.errorText || t('ai.messages.noErrorDetails')
              : undefined,
        },
      });
      return;
    }

    // ── Resultados propios: widget, archivos, vista previa, preguntas ──
    if (DISPLAY_TOOLS.has(name)) {
      const done = p.state === 'output-available';
      const failed = p.state === 'output-error' || (done && out?.ok === false);
      if (name === 'render_component') {
        parts.push(custom('keiro-component', { done, failed, output: out }));
      } else if (FILE_TOOLS.has(name)) {
        parts.push(custom('keiro-file', { name, done, failed, output: out }));
      } else if (name === 'preview_document_template') {
        parts.push(custom('keiro-pdf', { done, failed, output: out }));
      } else if (name === 'ask_user_question') {
        const q = p.output as PendingQuestionOutput | undefined;
        if (done && q?.question) {
          // La pendiente (último mensaje) la fija PendingQuestionBar sobre el compositor.
          parts.push(custom('keiro-question', { question: q, pending: isLast }));
        } else if (!failed) {
          parts.push(custom('keiro-question', { loading: true }));
        }
      }
      return;
    }

    // ── Tools de lectura: un paso del resumen + su resultado como tabla/gráfico ──
    if (!steps) {
      steps = { type: 'steps', steps: [] };
      parts.push(steps);
    }
    const status = toolStatus(p);
    steps.steps.push({
      id: `${message.id}-${i}`,
      title: label,
      status: status === 'completed' ? 'done' : status === 'error' ? 'error' : 'running',
    });
    if (p.state === 'output-available') {
      // Todos los resultados de lectura van en un único bloque plegado.
      if (!results) {
        results = { outputs: [] };
        parts.push(custom('keiro-tool-result', results));
      }
      results.outputs.push(p.output);
    }
  });

  return parts;
}

export function toAIMessages(
  messages: ChatMessage[],
  { timings, userAvatarUrl, estimateTokens }: ToAIMessagesOptions,
): AIMessageData[] {
  return messages.map((m, index) => {
    const isUser = m.role === 'user';
    const parts = toParts(m, index === messages.length - 1 && m.role === 'assistant');
    if (!isUser) {
      parts.push(
        custom('keiro-footer', {
          metadata: m.metadata,
          estimate:
            timings[m.id] !== undefined
              ? { tokens: estimateTokens(m), elapsedMs: timings[m.id] }
              : null,
        }),
      );
    }
    return {
      id: m.id,
      role: m.role === 'system' ? 'system' : isUser ? 'user' : 'assistant',
      name: isUser ? t('ai.messages.you') : ASSISTANT_NAME,
      avatar: isUser ? (userAvatarUrl ?? undefined) : undefined,
      parts,
    };
  });
}
