import { useChat } from '@ai-sdk/react';

/** Tipos derivados del propio hook — evita duplicar la forma de UIMessage a mano. */
export type ChatMessage = ReturnType<typeof useChat>['messages'][number];
export type ChatMessagePart = ChatMessage['parts'][number];
export type AddToolApprovalResponse = ReturnType<typeof useChat>['addToolApprovalResponse'];

/** Metadata que el server adjunta al terminar cada mensaje (ver api/ai.ts, messageMetadata). */
export interface ChatMessageMetadata {
  finishReason?: string;
  provider?: string;
  localBackend?: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}
