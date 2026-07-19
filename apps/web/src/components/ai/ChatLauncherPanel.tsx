/**
 * Botón flotante + panel lateral para acceder a Keiro desde cualquier
 * pantalla de la app, sin tener que abrir su pestaña dedicada. Reutiliza
 * `AiChatContext` (misma sesión de chat que la pestaña /ai/chat — un solo
 * turno en curso a la vez) y las piezas de UI de `pages/AiChat/*` para no
 * duplicar la lógica de mensajes/compositor.
 *
 * Se oculta a sí mismo cuando la pestaña activa YA es /ai/chat — mostrar el
 * lanzador ahí sería redundante con la página que ya está abierta.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Maximize2, Sparkles, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAiChatContext } from '../../context/AiChatContext';
import { useTabs } from '../../context/TabsContext';
import { ASSISTANT_NAME } from '../../pages/AiChat/constants';
import { MessageBubble } from '../../pages/AiChat/MessageBubble';
import { Composer } from '../../pages/AiChat/Composer';
import { useComposerState } from '../../pages/AiChat/useComposerState';

export const ChatLauncherPanel: React.FC = () => {
  const { user } = useAuth();
  const { tabs, activeTabId, openTab } = useTabs();
  const {
    chat: { messages, error, stop, addToolApprovalResponse },
    status,
    busy,
    supportsImages,
    contextWindow,
    availableModels,
    selectedModel,
    setSelectedModel,
    messageTimings,
    headers,
    send: sendToContext,
    setChatVisible,
  } = useAiChatContext();

  const [open, setOpen] = useState(false);
  const composer = useComposerState(sendToContext, headers);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const onChatTab = Boolean(activeTab?.path?.startsWith('/ai/chat'));

  useEffect(() => {
    // La pestaña dedicada gestiona su propia visibilidad — si está activa,
    // no la pisamos desde aquí (el panel ni siquiera se muestra en ese caso).
    if (onChatTab) return;
    setChatVisible(open);
    return () => setChatVisible(false);
  }, [open, onChatTab, setChatVisible]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy, open]);

  if (onChatTab) return null;

  const CONTEXT_LIMIT_FALLBACK = 128000;
  const contextLimit = contextWindow ?? CONTEXT_LIMIT_FALLBACK;
  const estimateTokens = (m: (typeof messages)[number]) => {
    const chars = m.parts.reduce((sum, p) => {
      if (p.type === 'text' || p.type === 'reasoning') return sum + p.text.length;
      return sum;
    }, 0);
    return Math.max(1, Math.round(chars / 4));
  };
  const contextUsed =
    messages.reduce((sum, m) => sum + estimateTokens(m), 0) +
    Math.max(0, Math.round(composer.input.length / 4));

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="k-ai-glow fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-accent text-white shadow-lg hover:scale-105 active:scale-95 transition-transform flex items-center justify-center"
          title={`Abrir ${ASSISTANT_NAME}`}
        >
          <Bot size={26} />
          <Sparkles
            size={14}
            className="absolute -top-1 -right-1 text-amber-300 fill-amber-300/40 animate-pulse"
          />
        </button>
      )}

      {open && (
        <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-[420px] h-full flex flex-col bg-white dark:bg-slate-900 sm:border-l border-slate-200 dark:border-slate-700 shadow-2xl animate-in fade-in slide-in-from-right duration-300 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0 bg-gradient-to-r from-accent/10 via-transparent to-transparent">
            <div className="flex items-center gap-2 font-bold">
              <span className="relative shrink-0">
                <Bot size={18} className="text-accent" />
                <Sparkles
                  size={9}
                  className="absolute -top-1.5 -right-1.5 text-accent animate-pulse"
                />
              </span>
              <span className="k-shimmer-text">{ASSISTANT_NAME}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  openTab('/ai/chat');
                  setOpen(false);
                }}
                className="p-1.5 rounded-md text-slate-400 hover:text-accent hover:bg-accent/5 transition-colors"
                title="Abrir a pantalla completa"
              >
                <Maximize2 size={16} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                title="Cerrar"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 p-3 min-h-0">
            {messages.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-6">
                Pregúntame sobre los datos de tu empresa.
              </p>
            )}
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                userAvatarUrl={user?.avatarImageUrl}
                estimate={
                  messageTimings[m.id] !== undefined
                    ? { tokens: estimateTokens(m), elapsedMs: messageTimings[m.id] }
                    : null
                }
                addToolApprovalResponse={addToolApprovalResponse}
                onQuoteText={composer.quoteText}
              />
            ))}

            {status === 'submitted' && (
              <div className="px-1 text-xs text-slate-400 inline-flex items-center gap-2">
                <Loader2 size={12} className="animate-spin text-accent" /> Pensando…
              </div>
            )}

            {error && (
              <div className="text-xs p-2 rounded-md bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                {error.message || 'Error en el chat'}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <div className="p-3 pt-0 shrink-0">
            <Composer
              {...composer}
              supportsImages={supportsImages}
              busy={busy}
              stop={() => void stop()}
              contextUsed={contextUsed}
              contextLimit={contextLimit}
              contextApprox
              modelOptions={availableModels.options}
              selectedModel={selectedModel || availableModels.current}
              onSelectModel={setSelectedModel}
            />
          </div>
        </div>
      )}
    </>
  );
};
