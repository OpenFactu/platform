import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChatProvider,
  Drawer,
  type ChatConversationData,
  type ChatMessageData,
} from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useI18n } from '@/i18n/I18nContext';
import { ApiError } from '@/shared/http';
import { rtClient } from '../api/rtClient';
import { erpApi, messagingApi } from '../api/messagingApi';
import { clearMessageCache, mapConversation } from '../api/messageCache';
import { lastToChatMessage, toChatUsers, type MemberDto } from '../domain/messaging';
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
  readOnly: boolean;
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
        setLoaded({
          key: sessionKey,
          members,
          readOnly,
          conversations: convs.map((c) => mapConversation(c, meId, byId, t, readOnly)),
          lastMessages: convs
            .map((c) => lastToChatMessage(c, t))
            .filter((m): m is ChatMessageData => Boolean(m)),
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
      },
    [loaded, meId],
  );
  const users = useMemo(
    () => (loaded ? toChatUsers(loaded.members, online) : []),
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

  if (!loaded || !people) return null;

  return (
    <MessagingPeopleContext.Provider value={people}>
      <ChatProvider
        key={sessionKey}
        currentUser={currentUser}
        users={users}
        initialConversations={loaded.conversations}
        initialMessages={loaded.lastMessages}
        {...transport}
      >
        <Bridge onOnlineChange={setOnline} />
        {/* El panel es para escritorio: en móvil el botón lleva a la página. */}
        <Drawer
          open={drawerOpen && !mobile}
          onClose={() => setDrawerOpen(false)}
          side="right"
          size="lg"
          ariaLabel={t('messaging.nav.messages')}
        >
          <MessagingWorkspace className="!h-full !max-h-none" />
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
const Bridge: React.FC<{ onOnlineChange: (online: Set<string>) => void }> = ({
  onOnlineChange,
}) => {
  const people = React.useContext(MessagingPeopleContext)!;
  const stableOnline = useCallback((s: Set<string>) => onOnlineChange(s), [onOnlineChange]);
  useRealtimeBridge({
    meId: people.meId,
    members: people.membersById,
    readOnly: people.readOnly,
    onOnlineChange: stableOnline,
  });
  return null;
};
