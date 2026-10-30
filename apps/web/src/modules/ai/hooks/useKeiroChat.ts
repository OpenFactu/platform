import { useEffect, useMemo, useState } from 'react';
import type { AIAttachment, AIDraft, AIRun } from '@openfactu/ui/ai';
import { useAuth } from '@/context/AuthContext';
import { useAiChatContext } from '@/modules/ai/AiChatContext';
import { toAIMessages } from '../domain/toAIMessages';
import { findPendingQuestion } from '../domain/pendingQuestion';
import { useComposerState } from './useComposerState';
import { useFileDropZone } from './useFileDropZone';
import { useI18n } from '@/i18n/I18nContext';

/** ~4 caracteres/token — heurística estándar, solo como fallback visible con "~". */
export const estimateTokens = (m: { parts: Array<{ type: string; text?: string }> }) => {
  const chars = m.parts.reduce(
    (sum, p) => (p.type === 'text' || p.type === 'reasoning' ? sum + (p.text?.length ?? 0) : sum),
    0,
  );
  return Math.max(1, Math.round(chars / 4));
};

export const CONTEXT_LIMIT_FALLBACK = 128000;

/**
 * Todo lo que necesita una vista del chat de Keiro (la página y el panel
 * flotante) para pintarse con los componentes de @openfactu/ui/ai: mensajes ya
 * traducidos, estado del turno, borrador, acciones y cita de selección. La
 * sesión en sí (`useChat`) sigue en `AiChatContext`.
 */
export function useKeiroChat() {
  const { user } = useAuth();
  const { t } = useI18n();
  const ctx = useAiChatContext();
  const {
    chat: { messages, error, stop, regenerate, addToolApprovalResponse },
    status,
    busy,
    supportsImages,
    contextWindow,
    availableModels,
    selectedModel,
    messageTimings,
    headers,
    send,
  } = ctx;

  const composer = useComposerState(send, headers, supportsImages);
  // Toda la superficie del chat acepta archivos, no solo la caja de escribir.
  const drop = useFileDropZone(composer.addDropped, busy || composer.extractingDocs);

  const aiMessages = useMemo(
    () =>
      toAIMessages(messages, {
        timings: messageTimings,
        userAvatarUrl: user?.avatarImageUrl,
        estimateTokens,
      }),
    // `t`: las etiquetas se redactan al traducir, hay que rehacerlas al cambiar de idioma.
    [messages, messageTimings, user?.avatarImageUrl, t],
  );
  const pendingQuestion = findPendingQuestion(messages);

  const run: AIRun = error
    ? {
        status: 'error',
        // El mensaje viene del servidor ya traducido: «desactivado» o «disabled».
        error: `${error.message || t('ai.chat.error')}${
          /desactivado|disabled/.test(error.message ?? '') ? t('ai.chat.disabledHint') : ''
        }`,
      }
    : status === 'submitted'
      ? { status: 'submitting', label: t('ai.chat.thinking') }
      : status === 'streaming'
        ? { status: 'streaming' }
        : { status: 'idle' };

  // ── Borrador: texto + imágenes + documentos leídos ──
  const draftAttachments = useMemo<AIAttachment[]>(
    () => [
      ...composer.attachments.map((a, i) => ({
        id: `img-${i}`,
        name: a.filename || t('ai.messages.attachedImage'),
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
              name: t('ai.chat.readingDocument'),
              mediaType: 'text/plain',
              status: 'uploading' as const,
            },
          ]
        : []),
    ],
    [composer.attachments, composer.documents, composer.extractingDocs, t],
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

  const contextUsed =
    messages.reduce((sum, m) => sum + estimateTokens(m), 0) +
    Math.max(0, Math.round(composer.input.length / 4));

  const approveTool = async (id: string) => {
    await addToolApprovalResponse({ id, approved: true });
  };
  const rejectTool = async (id: string) => {
    await addToolApprovalResponse({ id, approved: false });
  };

  // ── Citar un fragmento de una respuesta ("Preguntar sobre esto") ──
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const onMouseUp = (event: MouseEvent) => {
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
      // Junto al puntero (donde acabó el arrastre) y dentro de la ventana: el
      // centro de la selección queda lejos o fuera de pantalla si abarca una
      // tabla ancha.
      const rect = range.getBoundingClientRect();
      const half = 90;
      const x = Math.min(window.innerWidth - half, Math.max(half, event.clientX));
      const y = Math.max(48, Math.min(event.clientY, rect.bottom));
      setSelection({ text, x, y });
    };
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, []);

  return {
    ...ctx,
    composer,
    drop,
    aiMessages,
    pendingQuestion,
    run,
    draft,
    onDraftChange,
    contextUsed,
    contextMax: contextWindow ?? CONTEXT_LIMIT_FALLBACK,
    modelId: selectedModel || availableModels.current,
    approveTool,
    rejectTool,
    selection,
    clearSelection: () => setSelection(null),
    stop: () => void stop(),
    retry: () => void regenerate(),
    supportsImages,
    busy,
  };
}

export type KeiroChat = ReturnType<typeof useKeiroChat>;
