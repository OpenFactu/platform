import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Video } from 'lucide-react';
import {
  ChatProvider,
  Drawer,
  useChatActions,
  type ChatConversationData,
  type ChatMessageData,
  type ChatProviderProps,
  type ChatUser,
} from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useI18n } from '@/i18n/I18nContext';
import { ApiError } from '@/shared/http';
import { callClient } from '../api/callClient';
import { rtClient } from '../api/rtClient';
import { erpApi, messagingApi } from '../api/messagingApi';
import {
  clearMessageCache,
  conversationInfo,
  mapConversation,
  setMe,
  withReceipts,
} from '../api/messageCache';
import {
  CALL_BLOCK,
  DOCUMENT_BLOCK,
  contactUsers,
  documentLabel,
  lastToChatMessage,
  toChatUsers,
  type CallSummary,
  type DocumentRef,
  type MemberDto,
} from '../domain/messaging';
import { callBadge, channelBadge } from '../domain/channelBadge';
import { MEETING_BLOCK, isMeeting, meetingText } from '../domain/meeting';
import { DocumentCard } from './DocumentCard';
import { MeetingCard } from './MeetingCard';
import { CallHost } from './CallHost';
import { callDuration } from '../domain/call';
import { useMessaging } from '../context/messagingState';
import { MessagingPeopleContext, type MessagingPeople } from '../context/MessagingPeople';
import { useChatTransport } from '../hooks/useChatTransport';
import { useRealtimeBridge } from '../hooks/useRealtimeBridge';
import { MessagingWorkspace } from './MessagingWorkspace';

interface Loaded {
  /** Sesión (usuario, empresa, intento) para la que se cargó. */
  key: string;
  members: MemberDto[];
  conversations: ChatConversationData[];
  lastMessages: ChatMessageData[];
  /** Clientes de fuera, como "usuarios" del kit para pintar su nombre. */
  contacts: ChatUser[];
  readOnly: boolean;
  customers: boolean;
  manage: boolean;
}

/**
 * Dueño de la mensajería mientras dura la sesión: decide si está disponible
 * (flag de la empresa + permiso `/messaging`), carga lo inicial, mantiene la
 * conexión y monta el `ChatProvider`. El chat se ve en el panel lateral y, por
 * portal, en la página de Mensajes; ambos comparten este mismo estado.
 */
export const MessagingHost: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const { enabled, sessionKey, setStatus, drawerOpen, setDrawerOpen, pageTarget } = useMessaging();
  const [state, setLoaded] = useState<Loaded | null>(null);
  const [online, setOnline] = useState<Set<string>>(() => new Set());
  const mobile = useIsMobile();
  const meId = user?.id ?? '';
  // Lo cargado para otra sesión (otra empresa, sesión cerrada) ya no vale.
  const loaded = enabled && state?.key === sessionKey ? state : null;

  useEffect(() => {
    if (!enabled || !meId) return;
    let cancelled = false;
    rtClient.start();
    Promise.all([erpApi.members(), messagingApi.conversations()])
      .then(([members, convs]) => {
        if (cancelled) return;
        const byId = new Map(members.map((m) => [m.id, m]));
        const readOnly = !rtClient.canWrite;
        setMe(meId);
        const conversations = convs.map((c) => mapConversation(c, meId, byId, t, readOnly));
        setLoaded({
          key: sessionKey,
          members,
          readOnly,
          customers: rtClient.customers,
          manage: rtClient.manage,
          contacts: contactUsers(convs),
          conversations,
          // Las conversaciones primero: así ya se sabe quién ha leído qué.
          lastMessages: convs
            .map((c) => lastToChatMessage(c, t))
            .filter((m): m is ChatMessageData => Boolean(m))
            .map(withReceipts),
        });
        setStatus({ key: sessionKey, phase: 'ready' });
      })
      .catch((err) => {
        if (cancelled) return;
        const forbidden = err instanceof ApiError && err.status === 403;
        setStatus({ key: sessionKey, phase: forbidden ? 'disabled' : 'error' });
      });
    return () => {
      cancelled = true;
      rtClient.stop();
      clearMessageCache();
      setOnline(new Set());
    };
    // `t` cambia con el idioma: no hace falta recargar la mensajería por eso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, meId, sessionKey, setStatus]);

  const people = useMemo<MessagingPeople | null>(
    () =>
      loaded && {
        meId,
        members: loaded.members,
        membersById: new Map(loaded.members.map((m) => [m.id, m])),
        readOnly: loaded.readOnly,
        customers: loaded.customers,
        manage: loaded.manage,
      },
    [loaded, meId],
  );
  const users = useMemo(
    () => (loaded ? [...toChatUsers(loaded.members, online), ...loaded.contacts] : []),
    [loaded, online],
  );
  const currentUser = useMemo(
    () => ({
      id: meId,
      name: user?.username ?? '',
      avatar: user?.avatarImageUrl ?? undefined,
      status: 'online' as const,
    }),
    [meId, user?.username, user?.avatarImageUrl],
  );
  const transport = useChatTransport();
  const { active: activeCalls } = useSyncExternalStore(
    callClient.subscribe,
    callClient.getSnapshot,
  );

  // Lo que va dentro de la burbuja: un documento compartido o una reunión.
  const blockRenderers = useMemo<ChatProviderProps['blockRenderers']>(
    () => ({
      [DOCUMENT_BLOCK]: {
        render: ({ data }) => <DocumentCard doc={data as DocumentRef} />,
        summary: (data) => documentLabel(data as DocumentRef, t),
      },
      // Una reunión: cuándo, entrar, al calendario; quien organiza la cambia.
      [MEETING_BLOCK]: {
        render: ({ data, message }) =>
          isMeeting(data) ? (
            <MeetingCard meeting={data} conversationId={message.conversationId} />
          ) : null,
        summary: (data) => (isMeeting(data) ? meetingText(data, t, data.cancelled) : ''),
      },
      // Una llamada que ha terminado.
      [CALL_BLOCK]: {
        render: ({ data }) => (
          <span className="inline-flex items-center gap-2 py-1 text-sm text-fg-body">
            <Video size={14} />
            {t('messaging.calls.ended', {
              duration: callDuration((data as CallSummary).seconds, t),
            })}
          </span>
        ),
        summary: (data) =>
          t('messaging.calls.ended', { duration: callDuration((data as CallSummary).seconds, t) }),
      },
    }),
    [t],
  );
  // Sello en el avatar: una llamada en curso o, con clientes, el canal.
  const renderConversationBadge = useCallback(
    (conversation: ChatConversationData) => {
      if (activeCalls[conversation.id]) return callBadge(t('messaging.calls.inCourse'));
      const info = conversationInfo(conversation.id);
      return info?.kind === 'customer'
        ? channelBadge(info.channel, t(`messaging.channels.names.${info.channel}`))
        : null;
    },
    [t, activeCalls],
  );

  // Un cliente nuevo escribe por Telegram: que su nombre salga en sus mensajes.
  const addContact = useCallback((contact: ChatUser) => {
    setLoaded((prev) =>
      !prev ||
      prev.contacts.some(
        (c) => c.id === contact.id && c.name === contact.name && c.avatar === contact.avatar,
      )
        ? prev
        : { ...prev, contacts: [...prev.contacts.filter((c) => c.id !== contact.id), contact] },
    );
  }, []);

  if (!loaded || !people) return null;

  return (
    <MessagingPeopleContext.Provider value={people}>
      <ChatProvider
        key={sessionKey}
        currentUser={currentUser}
        users={users}
        initialConversations={loaded.conversations}
        initialMessages={loaded.lastMessages}
        blockRenderers={blockRenderers}
        renderConversationBadge={renderConversationBadge}
        {...transport}
      >
        <Bridge onOnlineChange={setOnline} onContact={addContact} />
        <CallHost />
        {/* El panel es para escritorio: en móvil el botón lleva a la página.
            A sangre y sin cabecera: la ✕ la pone el propio chat. */}
        <Drawer
          open={drawerOpen && !mobile}
          onClose={() => setDrawerOpen(false)}
          side="right"
          size="lg"
          hideHeader
          padding="none"
          ariaLabel={t('messaging.nav.messages')}
        >
          <MessagingWorkspace
            className="!h-full !max-h-none !rounded-none !border-0"
            onClose={() => setDrawerOpen(false)}
          />
        </Drawer>
        {/* En la página ocupa toda la pestaña, sin marco de tarjeta. */}
        {pageTarget &&
          createPortal(
            <MessagingWorkspace className="!h-full !max-h-none !rounded-none !border-0" />,
            pageTarget,
          )}
      </ChatProvider>
    </MessagingPeopleContext.Provider>
  );
};

/** El puente con el socket tiene que vivir dentro del `ChatProvider`. */
const Bridge: React.FC<{
  onOnlineChange: (online: Set<string>) => void;
  onContact: (contact: ChatUser) => void;
}> = ({ onOnlineChange, onContact }) => {
  const people = React.useContext(MessagingPeopleContext)!;
  const { focusConversation, setFocusConversation } = useMessaging();
  const { selectConversation } = useChatActions();
  useEffect(() => {
    if (!focusConversation) return;
    selectConversation(focusConversation);
    setFocusConversation(null);
  }, [focusConversation, selectConversation, setFocusConversation]);
  useRealtimeBridge({
    meId: people.meId,
    members: people.membersById,
    readOnly: people.readOnly,
    onOnlineChange,
    onContact,
  });
  return null;
};
