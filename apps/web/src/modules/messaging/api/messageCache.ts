import type { ChatConversationData, ChatMessageData } from '@openfactu/ui';
import {
  documentOf,
  toChatConversation,
  toChatMessage,
  type ConversationDto,
  type DocumentRef,
  type MemberDto,
  type MessageDto,
  type Translate,
} from '../domain/messaging';
import { erpApi } from './messagingApi';

/**
 * Lo que el kit de chat no guarda y la mensajería necesita recordar mientras
 * dura la sesión: qué mensajes son documentos y las URL locales de los
 * adjuntos (la descarga del ERP pide sesión, así que no vale un enlace).
 */

const documents = new Map<string, DocumentRef>();
const conversations = new Map<string, Pick<ConversationDto, 'kind' | 'myRole' | 'title'>>();
const urls = new Map<string, string>();
/** Conversaciones cuyo historial ya se pidió desde el final. */
const historyStarted = new Set<string>();
const pending = new Map<string, Promise<string | undefined>>();

export function documentFor(messageId: string): DocumentRef | undefined {
  return documents.get(messageId);
}

export function attachmentUrl(attachmentId: string): string | undefined {
  return urls.get(attachmentId);
}

/** URL local para un fichero recién subido: no hace falta volver a bajarlo. */
export function rememberUpload(attachmentId: string, file: Blob): string {
  const url = URL.createObjectURL(file);
  urls.set(attachmentId, url);
  return url;
}

/** Baja el adjunto (una sola vez) y devuelve su URL local. */
export function resolveAttachment(attachmentId: string): Promise<string | undefined> {
  const known = urls.get(attachmentId);
  if (known) return Promise.resolve(known);
  let request = pending.get(attachmentId);
  if (!request) {
    request = erpApi
      .download(attachmentId)
      .then(({ blob }) => rememberUpload(attachmentId, blob))
      .catch(() => undefined)
      .finally(() => pending.delete(attachmentId));
    pending.set(attachmentId, request);
  }
  return request;
}

/**
 * ¿Es la primera vez que se pide historial de esta conversación? Entonces hay
 * que pedirlo desde el final: el último mensaje que hay en pantalla vino de la
 * lista de conversaciones, que solo trae un resumen (sin documento ni ficheros).
 */
export function startHistory(conversationId: string): boolean {
  if (historyStarted.has(conversationId)) return false;
  historyStarted.add(conversationId);
  return true;
}

/** Tipo, papel y título propio de una conversación (el kit no los guarda). */
export function conversationInfo(id: string) {
  return conversations.get(id);
}

/** Conversación del servicio → conversación del kit, recordando lo que el kit no guarda. */
export function mapConversation(
  dto: ConversationDto,
  meId: string,
  members: Map<string, MemberDto>,
  t: Translate,
  readOnly: boolean,
): ChatConversationData {
  conversations.set(dto.id, { kind: dto.kind, myRole: dto.myRole, title: dto.title });
  return { ...toChatConversation(dto, meId, members, t), readOnly };
}

/** Mensaje del servicio → mensaje del kit, recordando si es un documento. */
export function mapMessage(m: MessageDto, t: Translate): ChatMessageData {
  const doc = documentOf(m);
  if (doc) {
    documents.set(m.id, doc);
    if (m.clientMsgId) documents.set(m.clientMsgId, doc);
  }
  return toChatMessage(m, t, attachmentUrl);
}

/** Al cerrar sesión o cambiar de empresa. */
export function clearMessageCache(): void {
  urls.forEach((url) => URL.revokeObjectURL(url));
  urls.clear();
  documents.clear();
  conversations.clear();
  historyStarted.clear();
  pending.clear();
}
