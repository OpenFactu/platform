import type { ChatMessage } from './types';

export interface PendingQuestionOutput {
  question: string;
  options?: Array<{ label: string; description?: string }>;
  multiSelect?: boolean;
  allowFreeText?: boolean;
  freeTextPlaceholder?: string;
  step?: { current: number; total: number; title?: string };
}

/**
 * Busca la pregunta de ask_user_question pendiente de responder — la última
 * tool-part de ese tipo, pero SOLO si pertenece al último mensaje del hilo y
 * ese mensaje es del asistente. Si ya hay un mensaje del usuario después
 * (su respuesta), la pregunta ya no está pendiente y esto devuelve null.
 *
 * Se usa para fijar la pregunta activa como una barra pegada encima del
 * compositor (ver PendingQuestionBar) en vez de dejar que cada paso quede
 * enterrado como una tarjeta más en el hilo de mensajes.
 */
export function findPendingQuestion(messages: ChatMessage[]): PendingQuestionOutput | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return null;
  for (let i = last.parts.length - 1; i >= 0; i--) {
    const part = last.parts[i] as unknown as {
      type: string;
      state?: string;
      output?: PendingQuestionOutput;
    };
    if (
      part.type === 'tool-ask_user_question' &&
      part.state === 'output-available' &&
      part.output?.question
    ) {
      return part.output;
    }
  }
  return null;
}
