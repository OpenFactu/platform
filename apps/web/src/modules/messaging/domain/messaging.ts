import type {
  ChatAttachment,
  ChatConversationData,
  ChatMessageData,
  ChatReaction,
  ChatUser,
} from '@openfactu/ui';

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
  createdAt: string;
  deleted: boolean;
}

export interface ConversationDto {
  id: string;
  kind: 'direct' | 'group';
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
  lastMessage: LastMessageDto | null;
}

export type MessageKind = 'text' | 'document' | 'attachment' | 'system';

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
  kind: MessageKind;
  body: string | null;
  payload: DocumentRef | { files: AttachmentRef[] } | null;
  clientMsgId: string | null;
  replyToId: string | null;
  reactions: ChatReaction[];
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface MessagePage {
  messages: MessageDto[];
  hasMore: boolean;
}

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
  | { type: 'read'; conversationId: string; userId: string; messageId: string }
  | { type: 'typing'; conversationId: string; userId: string }
  | { type: 'presence'; userId: string; online: boolean }
  | { type: 'error'; code: string }
  | { type: 'pong' };

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

export function conversationTitle(
  conv: Pick<ConversationDto, 'kind' | 'title' | 'participantIds'>,
  meId: string,
  members: Map<string, MemberDto>,
  t: Translate,
): string {
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
  return {
    id: conv.id,
    title: conversationTitle(conv, meId, members, t),
    participantIds: conv.participantIds,
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
    senderId: last.authorId ?? '',
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
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.authorId ?? '',
    // El documento va en el texto para que la lista y las búsquedas lo vean;
    // la burbuja lo pinta como tarjeta (ver DocumentMessage).
    text: doc ? [documentLabel(doc, t), m.body].filter(Boolean).join('\n') : (m.body ?? ''),
    createdAt: m.createdAt,
    clientId: m.clientMsgId ?? undefined,
    replyToId: m.replyToId ?? undefined,
    reactions: m.reactions,
    editedAt: m.editedAt ?? undefined,
    deletedAt: m.deletedAt ?? undefined,
    attachments: attachments.length ? attachments : undefined,
    status: 'sent',
  };
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
