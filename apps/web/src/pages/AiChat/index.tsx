/**
 * Chat interno del asistente de IA (Fases 2-3 + mejoras de UX).
 *
 * Consume el UI message stream de `POST /api/ai/chat` con `useChat` del
 * Vercel AI SDK: streaming token a token, razonamiento (si el modelo lo
 * expone) en un bloque colapsable "Pensando…", resultados de tools como
 * componentes reales (tabla, mini-gráfico — ver ToolResultView), adjuntar
 * imágenes (si el proveedor las soporta) y el flujo de confirmación de
 * ACCIONES: las tools con `needsApproval` llegan como `approval-requested`,
 * se muestra la tarjeta Confirmar/Rechazar y `addToolApprovalResponse` +
 * `sendAutomaticallyWhen` reanudan la conversación — nada se ejecuta sin
 * click.
 *
 * La sesión de chat en sí (useChat, modelo elegido, conversación guardada)
 * vive en `AiChatContext` — montado a nivel de App, no dentro de esta
 * pestaña — así el turno en curso NUNCA se aborta al cambiar de pestaña.
 * Esta página es solo la vista: composición visual + estado de borrador
 * (input/adjuntos sin enviar — ver `useComposerState`, compartido con el
 * lanzador flotante `ChatLauncherPanel`). Las piezas de UI viven en los
 * demás archivos de esta carpeta.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Loader2,
  Maximize2,
  Minimize2,
  Sparkles,
  FileText,
  Users,
  Package,
  LayoutDashboard,
  AlertTriangle,
  FileSpreadsheet,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAiChatContext } from '../../context/AiChatContext';
import { useTabs, useCurrentTab } from '../../context/TabsContext';
import { ASSISTANT_NAME } from './constants';
import { MessageBubble } from './MessageBubble';
import { Composer } from './Composer';
import { ConversationSidebar } from './ConversationSidebar';
import { useComposerState } from './useComposerState';
import { PendingQuestionBar } from './PendingQuestionBar';
import { findPendingQuestion } from './pendingQuestion';

/** Sugerencias iniciales del estado vacío — texto + icono representativo. */
const HERO_SUGGESTIONS: Array<{
  text: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { text: '¿Cuáles son las últimas facturas de venta?', icon: FileText },
  { text: '¿Qué clientes tenemos dados de alta?', icon: Users },
  { text: 'Busca el artículo con más líneas vendidas este año', icon: Package },
  { text: 'Añade un widget de ventas mensuales al Dashboard', icon: LayoutDashboard },
  { text: '¿Qué artículos tienen poco stock?', icon: AlertTriangle },
  { text: 'Genera un Excel con el listado de proveedores', icon: FileSpreadsheet },
];

export const AiChat: React.FC = () => {
  const { user } = useAuth();
  const {
    chat: { messages, error, stop, addToolApprovalResponse },
    status,
    busy,
    supportsImages,
    contextWindow,
    availableModels,
    selectedModel,
    setSelectedModel,
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
    // Al volver a esta pestaña, refresca el proveedor/modelo activo — si
    // cambiaste de proveedor en Ajustes → IA mientras estabas en otra
    // pestaña, el chat lo recoge aquí en vez de seguir mandando el modelo
    // viejo (causaba "model X not found" contra el proveedor nuevo).
    if (visible) void refreshModels();
    return () => setChatVisible(false);
  }, [activeTabId, tabId, setChatVisible, refreshModels]);

  const [fullscreen, setFullscreen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composer = useComposerState(sendToContext, headers);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const handleNewConversation = () => {
    newConversation();
    composer.resetDraft();
  };

  /** ~4 caracteres/token — heurística estándar, solo como fallback visible con "~". */
  const estimateTokens = (m: (typeof messages)[number]) => {
    const chars = m.parts.reduce((sum, p) => {
      if (p.type === 'text' || p.type === 'reasoning') return sum + p.text.length;
      return sum;
    }, 0);
    return Math.max(1, Math.round(chars / 4));
  };

  // "Contexto usado" del anillo del compositor: estimación (mismo ~4
  // car./token) sobre TODO el historial + el borrador actual. El límite es el
  // num_ctx real si el proveedor es local/Ollama, o un techo genérico en
  // proveedores cloud donde no gestionamos ese dato.
  const CONTEXT_LIMIT_FALLBACK = 128000;
  const contextLimit = contextWindow ?? CONTEXT_LIMIT_FALLBACK;
  const historyTokens = messages.reduce((sum, m) => sum + estimateTokens(m), 0);
  const contextUsed = historyTokens + Math.max(0, Math.round(composer.input.length / 4));

  // Pregunta de Keiro pendiente de responder (ask_user_question del último
  // mensaje) — se fija encima del compositor en vez de quedar enterrada en
  // el hilo. Ver PendingQuestionBar.
  const pendingQuestion = findPendingQuestion(messages);

  const composerProps = {
    ...composer,
    supportsImages,
    busy,
    stop: () => void stop(),
    contextUsed,
    contextLimit,
    contextApprox: true,
    modelOptions: availableModels.options,
    selectedModel: selectedModel || availableModels.current,
    onSelectModel: setSelectedModel,
  };

  return (
    <div
      className={
        fullscreen
          ? 'fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 flex animate-in fade-in duration-200'
          : 'h-full flex animate-in fade-in duration-500'
      }
    >
      <div className="hidden md:block py-4 pl-4 h-full">
        <ConversationSidebar
          headers={headers}
          currentId={conversationId}
          onSelect={(id) => void loadConversation(id)}
          onNew={handleNewConversation}
        />
      </div>
      <div className="relative flex-1 min-w-0 flex flex-col min-h-0 p-4">
        {/* La pestaña de arriba ya muestra el icono + "Keiro" — repetirlo aquí
            sobraba. Solo queda el toggle de pantalla completa, pegado a la
            esquina en vez de en su propia fila (dejaba un hueco vacío raro
            cuando no hay nada más en esa fila). */}
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          className="absolute top-3 right-3 z-10 p-2 rounded-md text-slate-400 hover:text-accent hover:bg-accent/5 transition-colors"
          title={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
        >
          {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
        <div className="flex-1 flex flex-col min-h-0 max-w-4xl mx-auto w-full">
          {messages.length === 0 ? (
            // ── Estado vacío: hero centrado + compositor, estilo ChatGPT ──
            <div className="flex-1 flex flex-col items-center justify-center gap-7 px-2">
              <div className="text-center space-y-3">
                <div className="k-ai-glow relative mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20 flex items-center justify-center text-accent">
                  <Bot size={32} />
                  <Sparkles
                    size={14}
                    className="absolute -top-1 -right-1 text-amber-400 fill-amber-300/50 animate-pulse"
                  />
                </div>
                <h2 className="text-2xl font-bold text-ink-900 dark:text-slate-100">
                  Hola, soy <span className="k-shimmer-text">{ASSISTANT_NAME}</span>
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                  Pregúntame sobre los datos de tu empresa, adjunta un Excel/PDF/Word para que lo
                  lea, o pídeme crear un borrador o un widget para el Dashboard — cualquier acción
                  te pedirá confirmación antes de ejecutarse.
                </p>
              </div>
              <div className="w-full max-w-2xl">
                <Composer {...composerProps} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full max-w-2xl">
                {HERO_SUGGESTIONS.map(({ text, icon: Icon }) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => composer.send(text)}
                    className="group flex items-start gap-3 text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 hover:border-accent/40 hover:bg-accent/5 dark:hover:bg-accent/10 hover:-translate-y-0.5 transition-all shadow-sm"
                  >
                    <span className="shrink-0 w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center group-hover:bg-accent group-hover:text-white transition-colors">
                      <Icon size={16} />
                    </span>
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300 leading-snug pt-1.5">
                      {text}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* ── Mensajes ── */}
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
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
                  <div className="flex justify-start">
                    <div className="px-1 text-sm text-slate-400 dark:text-slate-500 inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-accent" /> Pensando…
                    </div>
                  </div>
                )}

                {error && (
                  <div className="text-xs p-3 rounded-md bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                    {error.message || 'Error en el chat'}
                    {error.message?.includes('desactivado') && (
                      <span> — actívalo en Ajustes → Empresa → IA.</span>
                    )}
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {pendingQuestion && (
                <PendingQuestionBar
                  key={pendingQuestion.step?.current ?? pendingQuestion.question}
                  question={pendingQuestion}
                  disabled={busy}
                  onAnswer={composer.send}
                />
              )}
              <Composer {...composerProps} />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
