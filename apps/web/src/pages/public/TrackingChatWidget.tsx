/**
 * Chat de Keiro en la página pública de seguimiento (`/track/:token`, sin
 * login). Deliberadamente independiente de `AiChatContext`/`ChatLauncherPanel`
 * (el chat interno): no hay usuario autenticado aquí, así que no hay
 * headers de auth, selector de modelo, adjuntos ni persistencia de
 * conversación — efímero, se resetea al recargar. El backend
 * (`POST /api/logistics/track/:token/chat`, ver `trackingChatEngine.ts`)
 * solo tiene acceso a los datos de ESTE envío.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import { Markdown } from '@/modules/ai/components/Markdown';

function isTextPart(part: { type: string }): part is { type: 'text'; text: string } {
  return part.type === 'text';
}

export const TrackingChatWidget: React.FC<{ token: string }> = ({ token }) => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: `/api/logistics/track/${token}/chat` }),
    [token],
  );
  const { messages, sendMessage, status } = useChat({ transport });
  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    void sendMessage({ text });
    setInput('');
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 w-14 h-14 rounded-full bg-slate-900 text-white shadow-xl flex items-center justify-center active:scale-95 transition hover:bg-slate-800"
        aria-label="Preguntar a Keiro sobre tu envío"
      >
        <MessageCircle size={22} />
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-96">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl flex flex-col max-h-[80vh] sm:max-h-[560px] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-900 text-white sm:rounded-t-3xl">
          <div>
            <div className="text-sm font-black leading-none">Keiro</div>
            <div className="text-[11px] text-white/70 mt-0.5">Pregúntame sobre tu envío</div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center"
            aria-label="Cerrar chat"
          >
            <X size={16} />
          </button>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[240px]">
          {messages.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-6">
              Pregúntame por el estado de tu envío o cuéntame si hay algún problema.
            </p>
          )}
          {messages.map((m) => {
            const text = m.parts
              .filter(isTextPart)
              .map((p) => p.text)
              .join('');
            if (!text) return null;
            const isUser = m.role === 'user';
            return (
              <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={
                    isUser
                      ? 'max-w-[85%] rounded-2xl px-3 py-2 text-sm bg-slate-900 text-white'
                      : 'max-w-[85%] rounded-2xl px-3 py-2 text-sm bg-slate-100 text-slate-800'
                  }
                >
                  {isUser ? text : <Markdown>{text}</Markdown>}
                </div>
              </div>
            );
          })}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-3 py-2 bg-slate-100 text-slate-400 inline-flex items-center gap-1.5 text-xs">
                <Loader2 size={12} className="animate-spin" /> Escribiendo…
              </div>
            </div>
          )}
        </div>

        <form onSubmit={submit} className="flex items-center gap-2 p-3 border-t border-slate-100">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe tu mensaje…"
            maxLength={1000}
            className="flex-1 text-sm rounded-full border border-slate-200 px-3.5 py-2 outline-none focus:border-slate-400"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center disabled:opacity-40 active:scale-95 transition shrink-0"
            aria-label="Enviar"
          >
            <Send size={15} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default TrackingChatWidget;
