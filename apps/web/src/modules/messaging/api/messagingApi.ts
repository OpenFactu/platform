import { apiClient } from '@/shared/http';
import type {
  AttachmentRef,
  ChannelAccount,
  ConversationDto,
  DocumentRef,
  MemberDto,
  MessageDto,
  MessagePage,
} from '../domain/messaging';
import type { MeetingInput, MeetingItem } from '../domain/meeting';
import { rtClient } from './rtClient';

/** Un enlace para invitados (el token solo se ve al crearlo). */
export interface CallInvite {
  id: string;
  callId: string | null;
  meetingId: string | null;
  expiresAt: string;
  createdAt: string;
}

/** API del servicio de mensajería (`/rt/v1`), siempre con el ticket. */
export const messagingApi = {
  conversations: () => rtClient.request<ConversationDto[]>('GET', '/conversations'),
  conversation: (id: string) => rtClient.request<ConversationDto>('GET', `/conversations/${id}`),
  createDirect: (userId: string) =>
    rtClient.request<ConversationDto>('POST', '/conversations', {
      kind: 'direct',
      participantIds: [userId],
    }),
  createGroup: (title: string, participantIds: string[]) =>
    rtClient.request<ConversationDto>('POST', '/conversations', {
      kind: 'group',
      title,
      participantIds,
    }),
  /** Devuelve `undefined` (204) si quien la cambia acaba de salir. */
  updateGroup: (
    id: string,
    patch: { title?: string; addUserIds?: string[]; removeUserIds?: string[] },
  ) => rtClient.request<ConversationDto | undefined>('PATCH', `/conversations/${id}`, patch),
  setPrefs: (
    id: string,
    prefs: { favorite?: boolean; archived?: boolean; muted?: boolean; markedUnread?: boolean },
  ) => rtClient.request<ConversationDto>('PATCH', `/conversations/${id}/prefs`, prefs),
  pin: (id: string, messageId: string, pinned: boolean) =>
    rtClient.request<void>(pinned ? 'PUT' : 'DELETE', `/conversations/${id}/pins/${messageId}`),

  messages: (id: string, before?: string, limit = 50) =>
    rtClient.request<MessagePage>(
      'GET',
      `/conversations/${id}/messages?limit=${limit}${before ? `&before=${before}` : ''}`,
    ),
  sendText: (id: string, body: string, clientMsgId: string, replyToId?: string) =>
    rtClient.request<MessageDto>('POST', `/conversations/${id}/messages`, {
      kind: 'text',
      body,
      clientMsgId,
      replyToId,
    }),
  sendFiles: (
    id: string,
    files: AttachmentRef[],
    body: string,
    clientMsgId: string,
    replyToId?: string,
  ) =>
    rtClient.request<MessageDto>('POST', `/conversations/${id}/messages`, {
      kind: 'attachment',
      body,
      payload: { files },
      clientMsgId,
      replyToId,
    }),
  sendDocument: (id: string, doc: DocumentRef, clientMsgId: string) =>
    rtClient.request<MessageDto>('POST', `/conversations/${id}/messages`, {
      kind: 'document',
      payload: doc,
      clientMsgId,
    }),
  inviteToCall: (callId: string) =>
    rtClient.request<{ invite: CallInvite; token: string }>('POST', `/calls/${callId}/invites`),
  inviteToMeeting: (meetingId: string) =>
    rtClient.request<{ invite: CallInvite; token: string }>(
      'POST',
      `/meetings/${meetingId}/invites`,
    ),
  invites: (conversationId: string) =>
    rtClient.request<CallInvite[]>('GET', `/conversations/${conversationId}/invites`),
  revokeInvite: (id: string) => rtClient.request<void>('DELETE', `/invites/${id}`),
  meetings: (from: Date, to: Date) =>
    rtClient.request<MeetingItem[]>(
      'GET',
      `/meetings?limit=500&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
    ),
  scheduleMeeting: (id: string, input: MeetingInput) =>
    rtClient.request<MessageDto>('POST', `/conversations/${id}/meetings`, input),
  rescheduleMeeting: (meetingId: string, input: MeetingInput) =>
    rtClient.request<MessageDto>('PATCH', `/meetings/${meetingId}`, input),
  cancelMeeting: (meetingId: string, summary: string) =>
    rtClient.request<MessageDto>('POST', `/meetings/${meetingId}/cancel`, { summary }),
  edit: (messageId: string, body: string) =>
    rtClient.request<MessageDto>('PATCH', `/messages/${messageId}`, { body }),
  remove: (messageId: string) => rtClient.request<void>('DELETE', `/messages/${messageId}`),
  react: (messageId: string, emoji: string, active: boolean) =>
    rtClient.request<void>('POST', `/messages/${messageId}/reactions`, { emoji, active }),
  read: (id: string, messageId: string) =>
    rtClient.request<void>('POST', `/conversations/${id}/read`, { messageId }),
  /** Reintenta entregar al canal (Telegram…) un mensaje que falló. */
  retry: (messageId: string) =>
    rtClient.request<MessageDto>('POST', `/messages/${messageId}/retry`),

  // Canales y contactos
  channels: () => rtClient.request<ChannelAccount[]>('GET', '/channels'),
  connectTelegram: (token: string) =>
    rtClient.request<ChannelAccount>('PUT', '/channels/telegram', { token }),
  disconnectTelegram: () => rtClient.request<void>('DELETE', '/channels/telegram'),
  linkContact: (contactId: string, partner: { id: string; name: string } | null) =>
    rtClient.request<void>('PATCH', `/contacts/${contactId}`, {
      partnerId: partner?.id ?? null,
      partnerName: partner?.name ?? null,
    }),
};

/** Lo que la mensajería necesita del ERP: personas, ficheros y buscador. */
export const erpApi = {
  members: () => apiClient.get<MemberDto[]>('/api/members'),

  /** Sube el fichero al almacenamiento de la empresa, colgado de la conversación. */
  upload: (conversationId: string, file: File, signal?: AbortSignal) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.postForm<{ id: string; fileName: string; mime: string; size: number }>(
      `/api/attachments?entityType=ChatConversation&entityId=${encodeURIComponent(conversationId)}`,
      form,
      { signal },
    );
  },

  /** La descarga exige sesión: se baja como blob y se enseña con una URL local. */
  download: (attachmentId: string) =>
    apiClient.getBlob(`/api/attachments/${encodeURIComponent(attachmentId)}/download`),

  search: (term: string) =>
    apiClient.get<Record<string, unknown>>(`/api/search?q=${encodeURIComponent(term)}`),
};
