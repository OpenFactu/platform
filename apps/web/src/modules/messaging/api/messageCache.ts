import type { ChatConversationData, ChatMessageData } from '@openfactu/ui';
import {
  toChatConversation,
  toChatMessage,
  type ConversationDto,
  type MemberDto,
  type MessageDto,
  type Translate,
} from '../domain/messaging';
import { erpApi } from './messagingApi';

/**
 * Lo que el kit de chat no guarda y la mensajería necesita recordar mientras
 * dura la sesión: tipo y canal de cada conversación, quién ha leído qué y las
 * URL locales de los adjuntos (la descarga del ERP pide sesión, así que no
 * vale un enlace).
 */

const conversations = new Map<
  string,
  Pick<ConversationDto, 'kind' | 'myRole' | 'title' | 'channel' | 'contact'>
>();
const urls = new Map<string, string>();
/** Quién soy: para saber qué mensajes son míos al calcular el "leído". */
let me = '';
/** Por conversación: hasta dónde ha leído cada persona y cuándo. */
const reads = new Map<string, Map<string, { lastRead: string; readAt: string | null }>>();
/** Por conversación: las personas del equipo que están dentro. */
const insiders = new Map<string, string[]>();

/** Conversaciones cuyo historial ya se pidió desde el final. */
const historyStarted = new Set<string>();
const pending = new Map<string, Promise<string | undefined>>();

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
  insiders.set(dto.id, dto.participantIds);
  reads.set(
    dto.id,
    new Map(
      (dto.readStates ?? []).map((r) => [
        r.userId,
        { lastRead: r.lastReadMessageId, readAt: r.readAt },
      ]),
    ),
  );
  conversations.set(dto.id, {
    kind: dto.kind,
    myRole: dto.myRole,
    title: dto.title,
    channel: dto.channel,
    contact: dto.contact,
  });
  return { ...toChatConversation(dto, meId, members, t), readOnly };
}

/** Mensaje del servicio → mensaje del kit, con su "leído". */
export function mapMessage(m: MessageDto, t: Translate): ChatMessageData {
  return withReceipts(toChatMessage(m, t, attachmentUrl));
}

export function setMe(userId: string): void {
  me = userId;
}

/** Alguien ha leído hasta `messageId` (solo avanza, nunca retrocede). */
export function updateReadState(
  conversationId: string,
  userId: string,
  messageId: string,
  readAt: string | null,
): void {
  const byUser = reads.get(conversationId) ?? new Map();
  reads.set(conversationId, byUser);
  const before = byUser.get(userId);
  if (!before || before.lastRead < messageId) byUser.set(userId, { lastRead: messageId, readAt });
}

/**
 * El "leído" de un mensaje mío: quién lo ha leído (con cuándo, para el detalle)
 * y estado `read` cuando lo han leído todos los demás. Los ids son UUID v7:
 * compararlos como texto es compararlos por fecha.
 *
 * En las conversaciones con clientes no se pone: el proveedor (Telegram) no
 * dice si el cliente lo ha leído, y que lo haya leído un compañero no cuenta.
 */
export function withReceipts(m: ChatMessageData): ChatMessageData {
  if (!me || m.senderId !== me || m.status === 'sending' || m.status === 'error') return m;
  const conv = conversations.get(m.conversationId);
  if (!conv || conv.kind === 'customer') return m;
  const recipients = (insiders.get(m.conversationId) ?? []).filter((u) => u !== me);
  if (!recipients.length) return m;
  const byUser = reads.get(m.conversationId);
  const receipts = recipients.flatMap((userId) => {
    const r = byUser?.get(userId);
    // Leído implica entregado: misma fecha para los dos.
    const at = r?.readAt ?? undefined;
    return r && r.lastRead >= m.id ? [{ userId, deliveredAt: at, readAt: at }] : [];
  });
  const allRead = receipts.length === recipients.length;
  const readAt = allRead
    ? receipts
        .map((r) => r.readAt ?? '')
        .sort()
        .at(-1) || undefined
    : undefined;
  return { ...m, receipts, status: allRead ? 'read' : 'sent', readAt, deliveredAt: readAt };
}

/** Al cerrar sesión o cambiar de empresa. */
export function clearMessageCache(): void {
  urls.forEach((url) => URL.revokeObjectURL(url));
  urls.clear();
  conversations.clear();
  historyStarted.clear();
  reads.clear();
  insiders.clear();
  me = '';
  pending.clear();
}
