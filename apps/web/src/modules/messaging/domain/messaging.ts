import type {
  ChatAttachment,
  ChatConversationData,
  ChatMessageData,
  ChatReaction,
  ChatUser,
} from '@openfactu/ui';
import { MEETING_BLOCK, isMeeting, type MeetingSnapshot } from './meeting';
import type { CallChatLine, CallState, WaitingGuest } from './call';

/**
 * Tipos del servicio de mensajería (`apps/messaging`) y su traducción a los
 * del kit de chat de @openfactu/ui. Sin React ni red: solo datos.
 */

export interface MemberDto {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface LastMessageDto {
  id: string;
  kind: MessageKind;
  body: string | null;
  authorId: string | null;
  authorContactId: string | null;
  createdAt: string;
  deleted: boolean;
}

/** Cliente de fuera, en las conversaciones por un canal (Telegram…). */
export interface ContactDto {
  id: string;
  displayName: string;
  username: string | null;
  partnerId: string | null;
  partnerName: string | null;
}

export interface ConversationDto {
  id: string;
  kind: 'direct' | 'group' | 'customer';
  channel: string;
  title: string | null;
  createdBy: string;
  createdAt: string;
  lastMessageAt: string | null;
  myRole: 'owner' | 'member';
  muted: boolean;
  favorite: boolean;
  archived: boolean;
  markedUnread: boolean;
  lastReadMessageId: string | null;
  unread: number;
  participantIds: string[];
  pinnedMessageIds: string[];
  /** Hasta dónde ha leído cada persona del equipo. */
  readStates: ReadStateDto[];
  lastMessage: LastMessageDto | null;
  contact: ContactDto | null;
}

export interface ReadStateDto {
  userId: string;
  lastReadMessageId: string;
  readAt: string | null;
}

export type MessageKind = 'text' | 'document' | 'attachment' | 'system' | 'meeting' | 'call';

export interface DocumentRef {
  docType: DocType;
  id: string;
  number: string | null;
}

export interface AttachmentRef {
  attachmentId: string;
  name: string;
  size: number;
  mime: string;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  authorId: string | null;
  authorContactId: string | null;
  kind: MessageKind;
  body: string | null;
  payload: DocumentRef | { files: AttachmentRef[] } | MeetingSnapshot | CallSummary | null;
  clientMsgId: string | null;
  replyToId: string | null;
  reactions: ChatReaction[];
  /** El proveedor del canal (Telegram…) no aceptó el mensaje. */
  deliveryError: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

/** Un canal conectado en la empresa (sin la credencial, que no sale del servicio). */
export interface ChannelAccount {
  channel: string;
  displayName: string;
  config: { username?: string; botId?: number };
  status: 'active' | 'error' | 'disabled';
  lastError: string | null;
}

export interface MessagePage {
  messages: MessageDto[];
  hasMore: boolean;
}

/** Una llamada que terminó, en la conversación. */
export interface CallSummary {
  callId: string;
  startedBy: string;
  seconds: number;
}

export const CALL_BLOCK = 'keirost.call';

export type ServerEvent =
  | { type: 'ready'; userId: string; online: string[] }
  | { type: 'message.created'; message: MessageDto }
  | { type: 'message.updated'; message: MessageDto }
  | {
      type: 'message.reactions';
      conversationId: string;
      messageId: string;
      reactions: ChatReaction[];
    }
  | { type: 'message.deleted'; conversationId: string; messageId: string }
  | { type: 'conversation.updated'; conversationId: string }
  | { type: 'read'; conversationId: string; userId: string; messageId: string; readAt: string }
  | { type: 'typing'; conversationId: string; userId: string }
  | { type: 'presence'; userId: string; online: boolean }
  | { type: 'error'; code: string }
  | { type: 'pong' }
  | { type: 'call.ringing'; call: CallState }
  | { type: 'call.updated'; call: CallState }
  | { type: 'call.ended'; callId: string; conversationId: string }
  | {
      type: 'call.joined';
      callId: string;
      peerId: number;
      sdp: RTCSessionDescriptionInit;
      chat: CallChatLine[];
    }
  | { type: 'call.chat'; callId: string; line: CallChatLine }
  | { type: 'call.lobby'; callId: string; waiting: WaitingGuest[] }
  | { type: 'guest.waiting' }
  | { type: 'guest.admitted'; call: CallState; iceServers: RTCIceServer[] }
  | { type: 'guest.rejected' }
  | { type: 'call.offer'; callId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'call.error'; callId: string; code: string };

// ── Documentos del ERP que se pueden compartir ─────────────────────────────

export type DocType = 'SINV' | 'PINV' | 'SO' | 'PO' | 'SDN' | 'PDN';

/** Ruta de la ficha y permiso que hace falta para abrirla. */
export const DOCUMENTS: Record<DocType, { route: string; permission: string }> = {
  SINV: { route: '/sales/invoices', permission: '/sales/invoices' },
  PINV: { route: '/purchases/invoices', permission: '/purchases/invoices' },
  SO: { route: '/sales-orders', permission: '/sales-orders' },
  PO: { route: '/purchase-orders', permission: '/purchase-orders' },
  SDN: { route: '/sales/delivery-notes', permission: '/sales/delivery-notes' },
  PDN: { route: '/purchases/delivery-notes', permission: '/purchases/delivery-notes' },
};

/** Secciones de `/api/search` que son documentos, con su tipo. */
export const SEARCH_SECTIONS: { key: string; docType: DocType }[] = [
  { key: 'salesInvoices', docType: 'SINV' },
  { key: 'purchaseInvoices', docType: 'PINV' },
  { key: 'salesOrders', docType: 'SO' },
  { key: 'purchaseOrders', docType: 'PO' },
  { key: 'salesDeliveryNotes', docType: 'SDN' },
  { key: 'purchaseDeliveryNotes', docType: 'PDN' },
];

/** `kind` del bloque de un documento compartido dentro de la burbuja. */
export const DOCUMENT_BLOCK = 'keirost.document';

export function isDocType(value: unknown): value is DocType {
  return typeof value === 'string' && value in DOCUMENTS;
}

export function documentOf(message: MessageDto): DocumentRef | null {
  if (message.kind !== 'document' || !message.payload) return null;
  const ref = message.payload as DocumentRef;
  return isDocType(ref.docType) ? ref : null;
}

// ── Traducción al kit de chat ───────────────────────────────────────────────

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Lo que se lee de un documento en la lista y en la burbuja. */
export function documentLabel(ref: DocumentRef, t: Translate): string {
  const type = t(`messaging.documents.types.${ref.docType}`);
  return ref.number ? `${type} ${ref.number}` : type;
}

/** En el kit, un contacto de fuera es un "usuario" más con este id. */
export function contactUserId(contactId: string): string {
  return `contact:${contactId}`;
}

/** Remitente para el kit: el usuario del equipo o el contacto de fuera. */
function senderOf(authorId: string | null, authorContactId: string | null): string {
  if (authorId) return authorId;
  return authorContactId ? contactUserId(authorContactId) : '';
}

export function conversationTitle(
  conv: Pick<ConversationDto, 'kind' | 'title' | 'participantIds' | 'contact'>,
  meId: string,
  members: Map<string, MemberDto>,
  t: Translate,
): string {
  if (conv.kind === 'customer' && conv.contact) return conv.contact.displayName;
  if (conv.title) return conv.title;
  const others = conv.participantIds.filter((id) => id !== meId);
  const names = others.map((id) => members.get(id)?.name ?? t('messaging.unknownUser'));
  if (conv.kind === 'direct') return names[0] ?? t('messaging.unknownUser');
  return names.length ? names.join(', ') : t('messaging.emptyGroup');
}

export function toChatConversation(
  conv: ConversationDto,
  meId: string,
  members: Map<string, MemberDto>,
  t: Translate,
): ChatConversationData {
  // En las de clientes, el canal y con quién está vinculado, bajo el nombre.
  const contact = conv.kind === 'customer' ? conv.contact : null;
  const channel = t(`messaging.channels.names.${conv.channel}`);
  const description = contact
    ? [channel, contact.partnerName ?? (contact.username ? `@${contact.username}` : null)]
        .filter(Boolean)
        .join(' · ')
    : undefined;
  return {
    id: conv.id,
    title: conversationTitle(conv, meId, members, t),
    description,
    participantIds: contact
      ? [...conv.participantIds, contactUserId(contact.id)]
      : conv.participantIds,
    unreadCount: conv.unread,
    hasOlderMessages: Boolean(conv.lastMessage),
    favorite: conv.favorite,
    archived: conv.archived,
    muted: conv.muted,
    markedUnread: conv.markedUnread,
    pinnedMessageIds: conv.pinnedMessageIds,
  };
}

/** El último mensaje de la lista, como mensaje del kit (para la vista previa). */
export function lastToChatMessage(conv: ConversationDto, t: Translate): ChatMessageData | null {
  const last = conv.lastMessage;
  if (!last) return null;
  return {
    id: last.id,
    conversationId: conv.id,
    senderId: senderOf(last.authorId, last.authorContactId),
    text: last.deleted ? '' : previewText(last.kind, last.body, t),
    createdAt: last.createdAt,
    deletedAt: last.deleted ? last.createdAt : undefined,
    status: 'sent',
  };
}

function previewText(kind: MessageKind, body: string | null, t: Translate): string {
  if (body) return body;
  if (kind === 'document') return t('messaging.documents.shared');
  return '';
}

export function toChatMessage(
  m: MessageDto,
  t: Translate,
  attachmentUrl: (id: string) => string | undefined,
): ChatMessageData {
  const doc = documentOf(m);
  const files = m.kind === 'attachment' && m.payload && 'files' in m.payload ? m.payload.files : [];
  const attachments: ChatAttachment[] = files.map((f) => ({
    id: f.attachmentId,
    name: f.name,
    mediaType: f.mime || 'application/octet-stream',
    size: f.size,
    status: 'ready',
    url: attachmentUrl(f.attachmentId),
  }));
  const meeting = m.kind === 'meeting' && isMeeting(m.payload) ? m.payload : null;
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: senderOf(m.authorId, m.authorContactId),
    // El texto de una reunión es para quien solo recibe texto (Telegram): aquí
    // la pinta su tarjeta.
    text: meeting ? '' : (m.body ?? ''),
    // El documento y la reunión van como bloque dentro de la burbuja; su
    // `summary` es lo que ven la lista, las respuestas y la búsqueda (ver
    // `MessagingHost`).
    blocks: doc
      ? [{ kind: DOCUMENT_BLOCK, data: doc }]
      : meeting
        ? [{ kind: MEETING_BLOCK, data: meeting }]
        : m.kind === 'call' && m.payload
          ? [{ kind: CALL_BLOCK, data: m.payload }]
          : undefined,
    createdAt: m.createdAt,
    clientId: m.clientMsgId ?? undefined,
    replyToId: m.replyToId ?? undefined,
    reactions: m.reactions,
    editedAt: m.editedAt ?? undefined,
    deletedAt: m.deletedAt ?? undefined,
    attachments: attachments.length ? attachments : undefined,
    // Si el canal no lo entregó, el kit lo pinta como fallido con su botón de reintentar.
    status: m.deliveryError ? 'error' : 'sent',
    error: m.deliveryError ? t('messaging.channels.notDelivered') : undefined,
  };
}

/** Un cliente de fuera como "usuario" del kit, para pintar su nombre. */
export function contactUser(contact: ContactDto): ChatUser {
  return { id: contactUserId(contact.id), name: contact.displayName };
}

/** Los clientes de las conversaciones, como "usuarios" del kit para pintar su nombre. */
export function contactUsers(conversations: ConversationDto[]): ChatUser[] {
  const seen = new Map<string, ChatUser>();
  for (const c of conversations) {
    if (c.contact) seen.set(c.contact.id, contactUser(c.contact));
  }
  return [...seen.values()];
}

export function toChatUsers(members: MemberDto[], online: Set<string>): ChatUser[] {
  return members.map((m) => ({
    id: m.id,
    name: m.name,
    avatar: m.avatarUrl ?? undefined,
    status: online.has(m.id) ? 'online' : 'offline',
  }));
}

/** UUID v7 en texto: compararlos como cadenas es compararlos por fecha. */
export function isAtOrBefore(a: string, b: string): boolean {
  return a <= b;
}
