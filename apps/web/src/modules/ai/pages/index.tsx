/**
 * Chat interno del asistente de IA.
 *
 * La interfaz es el espacio de trabajo de `@openfactu/ui/ai`: historial,
 * conversación, compositor, confirmaciones de herramientas y razonamiento los
 * pinta la librería. Esta página solo la conecta con lo de Keirost:
 *
 * - La sesión (`useChat`, modelo, conversación guardada) vive en
 *   `AiChatContext`, montado a nivel de App, para que el turno en curso no se
 *   aborte al cambiar de pestaña.
 * - `toAIMessages` traduce los mensajes del SDK al modelo de la librería; lo
 *   propio de Keirost (widgets, descargas, vista previa PDF, preguntas
 *   guiadas, documentos adjuntos, pie con tokens) son partes `custom` que
 *   registra `registerKeiroParts`.
 * - El borrador (texto, imágenes, documentos leídos) sigue en
 *   `useComposerState`, compartido con el lanzador flotante.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@openfactu/ui';
import {
  AIComposer,
  AIContextUsage,
  AIConversation,
  AIWorkspace,
  type AIAttachment,
  type AIDraft,
  type AIRun,
} from '@openfactu/ui/ai';
import {
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Maximize2,
  Minimize2,
  Package,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAiChatContext } from '@/modules/ai/AiChatContext';
import { useTabs, useCurrentTab } from '@/context/TabsContext';
import { ASSISTANT_NAME, MAX_ATTACHMENTS } from '../domain/constants';
import { toAIMessages } from '../domain/toAIMessages';
import { findPendingQuestion } from '../domain/pendingQuestion';
import { useComposerState } from '../hooks/useComposerState';
import { useConversationList } from '../hooks/useConversationList';
import { useFileDropZone } from '../hooks/useFileDropZone';
import { DropOverlay } from '../components/DropOverlay';
import { PendingQuestionBar } from '../components/PendingQuestionBar';
import { SelectionToolbar } from '../components/SelectionToolbar';
import { registerKeiroParts } from '../components/keiroParts';

registerKeiroParts();

/** Sugerencias iniciales del estado vacío. */
const HERO_SUGGESTIONS = [
  { id: 'facturas', label: '¿Cuáles son las últimas facturas de venta?', icon: FileText },
  { id: 'clientes', label: '¿Qué clientes tenemos dados de alta?', icon: Users },
  { id: 'articulo', label: 'Busca el artículo con más líneas vendidas este año', icon: Package },
  {
    id: 'widget',
    label: 'Añade un widget de ventas mensuales al Dashboard',
    icon: LayoutDashboard,
  },
  { id: 'stock', label: '¿Qué artículos tienen poco stock?', icon: AlertTriangle },
  { id: 'excel', label: 'Genera un Excel con el listado de proveedores', icon: FileSpreadsheet },
];

const LABELS = {
  emptyTitle: `Hola, soy ${ASSISTANT_NAME}`,
  emptyHint:
    'Pregúntame sobre los datos de tu empresa, adjunta un Excel/PDF/Word para que lo lea, o pídeme crear un borrador o un widget para el Dashboard — cualquier acción te pedirá confirmación antes de ejecutarse.',
  assistant: ASSISTANT_NAME,
};

/** ~4 caracteres/token — heurística estándar, solo como fallback visible con "~". */
const estimateTokens = (m: { parts: Array<{ type: string; text?: string }> }) => {
  const chars = m.parts.reduce(
    (sum, p) => (p.type === 'text' || p.type === 'reasoning' ? sum + (p.text?.length ?? 0) : sum),
    0,
  );
  return Math.max(1, Math.round(chars / 4));
};

const CONTEXT_LIMIT_FALLBACK = 128000;

export const AiChat: React.FC = () => {
  const { user } = useAuth();
  const {
    chat: { messages, error, stop, regenerate, addToolApprovalResponse },
    status,
    busy,
    supportsImages,
    contextWindow,
    availableModels,
    selectedModel,
    conversationId,
    messageTimings,
    headers,
    send: sendToContext,
    loadConversation,
    newConversation,
    setChatVisible,
    refreshModels,
  } = useAiChatContext();

  // Le dice al provider si ESTA pestaña (del sistema de pestañas interno,
  // no del navegador) es la que se está viendo ahora mismo — así el aviso de
  // "ya respondió" solo salta cuando el usuario no está mirando el chat.
  const { activeTabId } = useTabs();
  const { id: tabId } = useCurrentTab();
  useEffect(() => {
    const visible = activeTabId === tabId;
    setChatVisible(visible);
    // Al volver a esta pestaña, refresca el proveedor/modelo activo (si
    // cambiaste de proveedor en Ajustes → IA mientras estabas en otra).
    if (visible) void refreshModels();
    return () => setChatVisible(false);
  }, [activeTabId, tabId, setChatVisible, refreshModels]);

  const [fullscreen, setFullscreen] = useState(false);
  const composer = useComposerState(sendToContext, headers, supportsImages);
  const history = useConversationList(conversationId);
  // Toda la superficie del chat acepta archivos, no solo la caja de escribir.
  const drop = useFileDropZone(composer.addDropped, busy || composer.extractingDocs);

  // ── Mensajes ──
  const aiMessages = useMemo(
    () =>
      toAIMessages(messages, {
        timings: messageTimings,
        userAvatarUrl: user?.avatarImageUrl,
        estimateTokens,
      }),
    [messages, messageTimings, user?.avatarImageUrl],
  );
  const pendingQuestion = findPendingQuestion(messages);

  const run: AIRun = error
    ? {
        status: 'error',
        error: `${error.message || 'Error en el chat'}${
          error.message?.includes('desactivado') ? ' — actívalo en Ajustes → Empresa → IA.' : ''
        }`,
      }
    : status === 'submitted'
      ? { status: 'submitting', label: 'Pensando…' }
      : status === 'streaming'
        ? { status: 'streaming' }
        : { status: 'idle' };

  // ── Borrador: texto + imágenes + documentos leídos ──
  const draftAttachments = useMemo<AIAttachment[]>(
    () => [
      ...composer.attachments.map((a, i) => ({
        id: `img-${i}`,
        name: a.filename || 'imagen adjunta',
        mediaType: a.mediaType || 'image/png',
        url: a.url,
      })),
      ...composer.documents.map((d, i) => ({
        id: `doc-${i}`,
        name: d.filename,
        mediaType: 'text/plain',
      })),
      ...(composer.extractingDocs
        ? [
            {
              id: 'extracting',
              name: 'Leyendo documento…',
              mediaType: 'text/plain',
              status: 'uploading' as const,
            },
          ]
        : []),
    ],
    [composer.attachments, composer.documents, composer.extractingDocs],
  );
  const draft: AIDraft = { text: composer.input, attachments: draftAttachments };

  const onDraftChange = (next: AIDraft) => {
    if (next.text !== composer.input) composer.setInput(next.text);
    const keep = new Set(next.attachments.map((a) => a.id));
    // De mayor a menor índice, para que quitar uno no desplace los demás.
    [...draftAttachments]
      .reverse()
      .filter((a) => a.id !== 'extracting' && !keep.has(a.id))
      .forEach((a) => {
        const index = Number(a.id.split('-')[1]);
        if (a.id.startsWith('img-')) composer.removeAttachment(index);
        else composer.removeDocument(index);
      });
  };

  // ── Modelo y contexto ──
  const modelId = selectedModel || availableModels.current;
  const contextUsed =
    messages.reduce((sum, m) => sum + estimateTokens(m), 0) +
    Math.max(0, Math.round(composer.input.length / 4));

  // ── Citar un fragmento de una respuesta ("Preguntar sobre esto") ──
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const onMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return setSelection(null);
      const range = sel.getRangeAt(0);
      const node =
        range.commonAncestorContainer instanceof Element
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement;
      if (!node?.closest('.ai-message[data-role="assistant"]')) return setSelection(null);
      const text = sel
        .toString()
        .replace(/\n{2,}/g, '\n')
        .trim();
      if (!text) return setSelection(null);
      const rect = range.getBoundingClientRect();
      setSelection({ text, x: rect.left + rect.width / 2, y: rect.top });
    };
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, []);

  const handleNewConversation = () => {
    newConversation();
    composer.resetDraft();
  };

  const emptyChat = messages.length === 0;

  return (
    <div
      className={
        fullscreen
          ? 'fixed inset-0 z-50 bg-bg-muted flex animate-in fade-in duration-200'
          : 'h-full flex animate-in fade-in duration-500'
      }
    >
      <div className="relative flex-1 min-w-0 min-h-0" {...drop.dropZoneProps}>
        <DropOverlay visible={drop.dragOver} acceptImages={supportsImages} />
        <AIWorkspace
          className="h-full"
          labels={LABELS}
          title={ASSISTANT_NAME}
          header={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFullscreen((v) => !v)}
              title={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              className="ml-auto text-fg-subtle hover:text-accent"
            >
              {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </Button>
          }
          state={{
            conversations: history.conversations,
            conversationId: conversationId ?? undefined,
            messages: aiMessages,
            draft,
            models: [],
            modelId,
            run,
            artifacts: [],
            historyLoading: history.loading,
          }}
          actions={{
            onDraftChange,
            onSubmit: (d) => composer.send(d.text),
            onStop: () => void stop(),
            onRetry: () => void regenerate(),
            onSelectConversation: (id) => void loadConversation(id),
            onNewConversation: handleNewConversation,
            onDeleteConversation: (id) => void history.remove(id),
            onFiles: (files) => composer.addDropped(files),
            onApproveTool: async (id) => {
              await addToolApprovalResponse({ id, approved: true });
            },
            onRejectTool: async (id) => {
              await addToolApprovalResponse({ id, approved: false });
            },
          }}
        >
          <AIConversation
            messages={aiMessages}
            conversationId={conversationId ?? undefined}
            run={run}
            actions={{
              onRetry: () => void regenerate(),
              onApproveTool: async (id) => {
                await addToolApprovalResponse({ id, approved: true });
              },
              onRejectTool: async (id) => {
                await addToolApprovalResponse({ id, approved: false });
              },
            }}
            labels={LABELS}
            suggestions={emptyChat ? HERO_SUGGESTIONS : undefined}
            onSelectPrompt={(text) => composer.send(text)}
          />
          <div className="ai-workspace-composer">
            {pendingQuestion && (
              <PendingQuestionBar
                key={pendingQuestion.step?.current ?? pendingQuestion.question}
                question={pendingQuestion}
                disabled={busy}
                onAnswer={composer.send}
              />
            )}
            {composer.quotedText && (
              <div className="mb-2 flex items-start gap-2 rounded-md border-l-2 border-accent bg-bg-muted px-3 py-2 text-xs text-fg-body">
                <span className="line-clamp-3 flex-1 whitespace-pre-wrap">
                  {composer.quotedText}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={composer.clearQuote}
                  title="Quitar cita"
                >
                  <X size={14} />
                </Button>
              </div>
            )}
            <AIComposer
              draft={draft}
              onDraftChange={onDraftChange}
              onSubmit={(d) => composer.send(d.text)}
              run={run}
              onStop={() => void stop()}
              onFiles={(files) => composer.addDropped(files)}
              maxFiles={MAX_ATTACHMENTS + 3}
              maxSizeMb={15}
              labels={LABELS}
            >
              <AIComposer.Attachments />
              <AIComposer.Input />
              <AIComposer.Tools>
                <AIContextUsage
                  usedTokens={contextUsed}
                  maxTokens={contextWindow ?? CONTEXT_LIMIT_FALLBACK}
                  modelLabel={modelId || undefined}
                  placement="top"
                  align="start"
                  details={[{ label: 'Cálculo', value: 'Estimado (~4 caracteres por token)' }]}
                  labels={LABELS}
                />
              </AIComposer.Tools>
            </AIComposer>
          </div>
        </AIWorkspace>
        {selection && (
          <SelectionToolbar
            x={selection.x}
            y={selection.y}
            onClick={() => {
              composer.quoteText(selection.text);
              setSelection(null);
              window.getSelection()?.removeAllRanges();
            }}
          />
        )}
      </div>
    </div>
  );
};
