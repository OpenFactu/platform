/**
 * Botón flotante + panel lateral para acceder a Keiro desde cualquier
 * pantalla de la app, sin tener que abrir su pestaña dedicada. Reutiliza
 * `AiChatContext` (misma sesión de chat que la pestaña /ai/chat — un solo
 * turno en curso a la vez) y las piezas de UI de `pages/AiChat/*` para no
 * duplicar la lógica de mensajes/compositor.
 *
 * Se oculta a sí mismo cuando la pestaña activa YA es /ai/chat — mostrar el
 * lanzador ahí sería redundante con la página que ya está abierta.
 *
 * Solo se muestra en desktop (`md:` y superior). En móvil choca con la barra
 * inferior (`MobileBottomNav`, que también es fixed) y con su botón central
 * de escaneo — y Keiro ya es accesible desde ahí vía Menú, así que el
 * lanzador flotante es redundante en pantallas pequeñas.
 *
 * En desktop la bolita se puede arrastrar a cualquiera de las 4 esquinas
 * (arrastre real, no solo click) — al soltar, se ancla a la esquina más
 * cercana y esa elección se recuerda entre sesiones (localStorage).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@openfactu/ui';
import { Bot, Loader2, Maximize2, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAiChatContext } from '@/modules/ai/AiChatContext';
import { useTabs } from '@/context/TabsContext';
import { ASSISTANT_NAME } from '../domain/constants';
import { MessageBubble } from './MessageBubble';
import { Composer } from './Composer';
import { useComposerState } from '../hooks/useComposerState';
import { PendingQuestionBar } from './PendingQuestionBar';
import { findPendingQuestion } from '../domain/pendingQuestion';

type Corner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
const CORNER_STORAGE_KEY = 'keirost:chatBubbleCorner';
// Anclajes con hueco para no tapar el layout fijo de MainLayout.tsx: el riel
// de iconos (60px) a la izquierda y la cabecera (56px, h-14) arriba. Abajo y
// a la derecha no hay nada fijo en desktop, así que ahí sí vale el margen
// normal de 24px (right-6/bottom-6).
const CORNER_CLASSES: Record<Corner, string> = {
  'bottom-right': 'bottom-6 right-6',
  'bottom-left': 'bottom-6 left-[76px]',
  'top-right': 'top-[70px] right-6',
  'top-left': 'top-[70px] left-[76px]',
};
/** Umbral en px para distinguir un click de un arrastre. */
const DRAG_THRESHOLD = 8;

function loadCorner(): Corner {
  try {
    const v = localStorage.getItem(CORNER_STORAGE_KEY);
    if (v && v in CORNER_CLASSES) return v as Corner;
  } catch {
    /* localStorage puede fallar en modo privado — usamos el default */
  }
  return 'bottom-right';
}

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
  const [corner, setCorner] = useState<Corner>(loadCorner);
  const composer = useComposerState(sendToContext, headers);
  const bottomRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; dragging: boolean } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, dragging: false };

    const handleMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = ev.clientX - drag.startX;
      const dy = ev.clientY - drag.startY;
      if (!drag.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.dragging = true;
      // Durante el arrastre, el botón sigue al cursor libremente; al soltar
      // se limpian estos estilos inline y vuelve a las clases de la esquina.
      const btn = btnRef.current;
      if (btn) {
        btn.style.left = `${ev.clientX - 28}px`;
        btn.style.top = `${ev.clientY - 28}px`;
        btn.style.right = 'auto';
        btn.style.bottom = 'auto';
      }
    };

    const handleUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      const drag = dragRef.current;
      dragRef.current = null;
      const btn = btnRef.current;
      if (btn) {
        btn.style.left = '';
        btn.style.top = '';
        btn.style.right = '';
        btn.style.bottom = '';
      }
      if (!drag?.dragging) {
        // Click normal (sin arrastre significativo) → abrir el chat.
        setOpen(true);
        return;
      }
      // Arrastre real → anclar a la esquina más cercana al soltar.
      const next: Corner = `${ev.clientY > window.innerHeight / 2 ? 'bottom' : 'top'}-${
        ev.clientX > window.innerWidth / 2 ? 'right' : 'left'
      }`;
      setCorner(next);
      try {
        localStorage.setItem(CORNER_STORAGE_KEY, next);
      } catch {
        /* no crítico si no se puede persistir */
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

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
  // Pregunta de Keiro pendiente de responder — ver comentario en index.tsx.
  const pendingQuestion = findPendingQuestion(messages);

  return (
    <>
      {!open && (
        <button
          ref={btnRef}
          type="button"
          onPointerDown={handlePointerDown}
          className={`k-ai-glow hidden md:flex fixed ${CORNER_CLASSES[corner]} z-40 w-14 h-14 rounded-full bg-accent text-white shadow-lg hover:scale-105 active:scale-95 transition-transform items-center justify-center cursor-grab active:cursor-grabbing`}
          style={{ touchAction: 'none' }}
          title={`Abrir ${ASSISTANT_NAME} (arrastra para mover)`}
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  openTab('/ai/chat');
                  setOpen(false);
                }}
                title="Abrir a pantalla completa"
                className="text-slate-400 hover:text-accent"
              >
                <Maximize2 size={16} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                title="Cerrar"
                className="text-slate-400 hover:text-rose-500"
              >
                <X size={16} />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 p-3 min-h-0">
            {messages.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-6">
                Pregúntame sobre los datos de tu empresa.
              </p>
            )}
            {messages.map((m, mi) => (
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
                onAnswerQuestion={composer.send}
                busy={busy}
                isLastMessage={mi === messages.length - 1}
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
            {pendingQuestion && (
              <PendingQuestionBar
                key={pendingQuestion.step?.current ?? pendingQuestion.question}
                question={pendingQuestion}
                disabled={busy}
                onAnswer={composer.send}
              />
            )}
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
