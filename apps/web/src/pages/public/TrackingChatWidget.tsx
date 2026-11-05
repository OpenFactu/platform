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
import { Button, Card, Input, Spinner } from '@openfactu/ui';
import { MessageCircle, X, Send } from 'lucide-react';
import { Markdown } from '@/modules/ai/components/Markdown';
import { useI18n } from '@/i18n/I18nContext';

function isTextPart(part: { type: string }): part is { type: 'text'; text: string } {
  return part.type === 'text';
}

export const TrackingChatWidget: React.FC<{ token: string }> = ({ token }) => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const { t } = useI18n();
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
      <Button
        className="fixed bottom-5 right-5 z-30 shadow-xl"
        onClick={() => setOpen(true)}
        aria-label={t('app.trackingChat.open')}
      >
        <MessageCircle size={20} />
      </Button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-96">
      <Card
        noPadding
        className="flex flex-col max-h-[80vh] sm:max-h-[560px] overflow-hidden shadow-2xl"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <div>
            <div className="text-sm font-bold text-fg-default">Keiro</div>
            <div className="text-xs text-fg-muted">{t('app.trackingChat.subtitle')}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            aria-label={t('app.trackingChat.close')}
          >
            <X size={16} />
          </Button>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[240px]">
          {messages.length === 0 && (
            <p className="text-xs text-fg-subtle text-center py-6">{t('app.trackingChat.empty')}</p>
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
                      ? 'max-w-[85%] rounded-2xl px-3 py-2 text-sm bg-accent text-accent-fg'
                      : 'max-w-[85%] rounded-2xl px-3 py-2 text-sm bg-bg-muted text-fg-default'
                  }
                >
                  {isUser ? text : <Markdown>{text}</Markdown>}
                </div>
              </div>
            );
          })}
          {busy && (
            <div className="flex items-center gap-1.5 text-xs text-fg-muted">
              <Spinner size="xs" tone="muted" /> {t('app.trackingChat.typing')}
            </div>
          )}
        </div>

        <form
          onSubmit={submit}
          className="flex items-center gap-2 p-3 border-t border-border-default"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('app.trackingChat.placeholder')}
            maxLength={1000}
            containerClassName="flex-1"
          />
          <Button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label={t('app.trackingChat.send')}
          >
            <Send size={15} />
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default TrackingChatWidget;
