import React from 'react';
import { AskUserQuestionCard } from './AskUserQuestionCard';
import type { PendingQuestionOutput } from '../domain/pendingQuestion';

/**
 * Pregunta de Keiro (ask_user_question) PENDIENTE de responder, fijada justo
 * encima del compositor — no enterrada como una tarjeta más en el hilo de
 * mensajes. Con `step`, esto es lo que hace que un flujo guiado ("dame de
 * alta un cliente paso a paso") se sienta como un formulario que va
 * avanzando en el mismo sitio, en vez de una lista de tarjetas creciendo
 * hacia abajo. `key={question.step?.current ?? question.question}` en el
 * caller fuerza el remount al cambiar de paso, para que entre con su propia
 * animación en vez de mutar en sitio.
 */
export const PendingQuestionBar: React.FC<{
  question: PendingQuestionOutput;
  disabled?: boolean;
  onAnswer: (text: string) => void;
}> = ({ question, disabled, onAnswer }) => (
  <div className="mb-2 w-full animate-in fade-in slide-in-from-bottom-2 duration-200">
    <AskUserQuestionCard
      question={question.question}
      options={question.options || []}
      multiSelect={question.multiSelect}
      allowFreeText={question.allowFreeText}
      freeTextPlaceholder={question.freeTextPlaceholder}
      step={question.step}
      disabled={disabled}
      onAnswer={onAnswer}
    />
  </div>
);
