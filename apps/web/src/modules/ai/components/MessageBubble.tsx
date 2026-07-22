import React, { useEffect, useRef, useState } from 'react';
import { User as UserIcon, Bot } from 'lucide-react';
import { ASSISTANT_NAME } from '../domain/constants';
import { ProcessSection } from './ProcessSection';
import { MessageFooter } from './MessageFooter';
import { SelectionToolbar } from './SelectionToolbar';
import { isProcessPart, renderMessagePart } from './renderMessagePart';
import type { AddToolApprovalResponse, ChatMessage } from '../domain/types';

export const MessageBubble: React.FC<{
  message: ChatMessage;
  userAvatarUrl?: string | null;
  estimate: { tokens: number; elapsedMs: number } | null;
  addToolApprovalResponse: AddToolApprovalResponse;
  /** Cita un fragmento seleccionado en el compositor — ver SelectionToolbar. */
  onQuoteText?: (text: string) => void;
  /** Responde una pregunta de Keiro (ask_user_question) enviándola como el
   * siguiente mensaje del usuario — ver AskUserQuestionCard. */
  onAnswerQuestion?: (text: string) => void;
  /** Deshabilita los botones de respuesta mientras hay un turno en curso. */
  busy?: boolean;
  /** Si es el último mensaje del hilo — ver comentario en renderMessagePart. */
  isLastMessage?: boolean;
}> = ({
  message: m,
  userAvatarUrl,
  estimate,
  addToolApprovalResponse,
  onQuoteText,
  onAnswerQuestion,
  busy,
  isLastMessage,
}) => {
  const processEntries = m.parts
    .map((part, i) => ({ part, i }))
    .filter(({ part }) => isProcessPart(part));
  const mainEntries = m.parts
    .map((part, i) => ({ part, i }))
    .filter(({ part }) => !isProcessPart(part));
  const processActive = processEntries.some(
    ({ part }) =>
      (part.type === 'reasoning' && part.state === 'streaming') ||
      (part.type.startsWith('tool-') &&
        ['input-streaming', 'input-available'].includes((part as { state?: string }).state || '')),
  );

  const isUser = m.role === 'user';

  // Preguntar sobre una selección — solo para respuestas de Keiro (citar tu
  // propio mensaje aporta poco). Escucha mouseup en `document` (no solo en
  // el contenedor) para detectar tanto una selección nueva dentro de este
  // mensaje como un clic fuera que deba cerrar la tarjeta.
  const contentRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (isUser || !onQuoteText) return;
    const handleMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!contentRef.current?.contains(range.commonAncestorContainer)) {
        setSelection(null);
        return;
      }
      const text = sel
        .toString()
        .replace(/\n{2,}/g, '\n')
        .trim();
      if (!text) {
        setSelection(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setSelection({ text, x: rect.left + rect.width / 2, y: rect.top });
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [isUser, onQuoteText]);

  const handleQuote = () => {
    if (!selection || !onQuoteText) return;
    onQuoteText(selection.text);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* El usuario mantiene la burbuja de color; el asistente fluye como
          texto plano sobre el fondo de la página (sin caja) — más cerca de
          cómo se leen respuestas largas con markdown/tablas/tool-cards. */}
      <div
        className={
          isUser
            ? 'max-w-[85%] rounded-xl px-4 py-3 text-sm shadow-sm bg-accent text-white'
            : 'max-w-full w-full px-1 text-sm text-slate-800 dark:text-slate-100'
        }
      >
        <div
          className={`flex items-center gap-2.5 mb-2 ${isUser ? 'flex-row-reverse opacity-90' : 'opacity-90'}`}
        >
          <span
            className={`inline-flex items-center justify-center w-8 h-8 rounded-full overflow-hidden shrink-0 ${
              isUser ? 'bg-white/20' : 'bg-accent/10 text-accent'
            }`}
          >
            {isUser ? (
              userAvatarUrl ? (
                <img src={userAvatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <UserIcon size={17} />
              )
            ) : (
              <Bot size={17} />
            )}
          </span>
          <span className="text-xs font-bold uppercase tracking-wider">
            {isUser ? 'Tú' : ASSISTANT_NAME}
          </span>
        </div>
        <div ref={contentRef} className="space-y-2">
          {processEntries.length > 0 && (
            <ProcessSection active={processActive} count={processEntries.length}>
              {processEntries.map(({ part, i }) =>
                renderMessagePart(
                  part,
                  i,
                  m.role,
                  addToolApprovalResponse,
                  onAnswerQuestion,
                  busy,
                  isLastMessage,
                ),
              )}
            </ProcessSection>
          )}
          {mainEntries.map(({ part, i }) =>
            renderMessagePart(
              part,
              i,
              m.role,
              addToolApprovalResponse,
              onAnswerQuestion,
              busy,
              isLastMessage,
            ),
          )}
        </div>
        {!isUser && <MessageFooter metadata={m.metadata} estimate={estimate} />}
      </div>
      {selection && <SelectionToolbar x={selection.x} y={selection.y} onClick={handleQuote} />}
    </div>
  );
};
