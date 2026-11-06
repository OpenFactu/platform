import { useEffect, useLayoutEffect, useRef } from 'react';
import { useChatActions, useChatState, type ChatMessageData, type ChatUser } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { rtClient } from '../api/rtClient';
import { messagingApi } from '../api/messagingApi';
import {
  mapConversation,
  mapMessage,
  resolveAttachment,
  updateReadState,
  withReceipts,
} from '../api/messageCache';
import {
  contactUser,
  isAtOrBefore,
  lastToChatMessage,
  type ConversationDto,
  type MemberDto,
  type ServerEvent,
} from '../domain/messaging';
import { useMessaging } from '../context/messagingState';

const TYPING_TTL_MS = 4000;
const TYPING_SEND_EVERY_MS = 2000;

interface BridgeOptions {
  meId: string;
  members: Map<string, MemberDto>;
  readOnly: boolean;
  onOnlineChange: (online: Set<string>) => void;
  /** Un cliente de fuera aparece (o cambia de nombre). */
  onContact: (contact: ChatUser) => void;
}

/**
 * Une el websocket del servicio con el estado del kit de chat: lo que llega
 * por el socket entra al `ChatProvider`, y lo que hace el usuario (abrir una
 * conversación, escribir, leer) se avisa al servicio.
 */
export function useRealtimeBridge({
  meId,
  members,
  readOnly,
  onOnlineChange,
  onContact,
}: BridgeOptions) {
  const { t } = useI18n();
  const state = useChatState();
  const actions = useChatActions();
  const { setUnread, drawerOpen, pageTarget } = useMessaging();

  // Lo último, para leerlo desde los handlers del socket sin re-suscribirse.
  const latest = useRef({ state, actions, members, t, readOnly });
  useLayoutEffect(() => {
    latest.current = { state, actions, members, t, readOnly };
  });

  const loaded = useRef(new Set<string>());
  const readSent = useRef(new Map<string, string>());
  const typing = useRef(new Map<string, Map<string, ReturnType<typeof setTimeout>>>());
  const online = useRef(new Set<string>());
  const readyOnce = useRef(false);

  const viewing = drawerOpen || Boolean(pageTarget);

  // ── Eventos del servicio ───────────────────────────────────────────────────
  useEffect(() => {
    const rememberContact = (c: ConversationDto) => {
      if (c.contact) onContact(contactUser(c.contact));
    };

    // Vuelve a calcular el "leído" de mis mensajes de esa conversación.
    const refreshReceipts = (conversationId: string, upTo?: string) => {
      const { actions: a, state: s } = latest.current;
      const changed = s.messages
        .filter(
          (m) =>
            m.conversationId === conversationId &&
            m.senderId === meId &&
            (!upTo || isAtOrBefore(m.id, upTo)),
        )
        .map((m) => [m, withReceipts(m)] as const)
        .filter(
          ([before, after]) =>
            before.status !== after.status || before.receipts?.length !== after.receipts?.length,
        )
        .map(([, after]) => after);
      if (changed.length) a.receiveMessages(changed);
    };

    const refreshConversation = async (id: string) => {
      const { actions: a, members: mem, t: tr, readOnly: ro, state: s } = latest.current;
      try {
        const dto = await messagingApi.conversation(id);
        rememberContact(dto);
        a.updateConversation(mapConversation(dto, meId, mem, tr, ro));
        refreshReceipts(id);
      } catch {
        // Ya no está dentro (salió o le sacaron): se queda archivada y de solo lectura.
        const before = s.conversations.find((c) => c.id === id);
        if (before) a.updateConversation({ ...before, archived: true, readOnly: true });
      }
    };

    const resync = async () => {
      const { actions: a, members: mem, t: tr, readOnly: ro } = latest.current;
      const list = await messagingApi.conversations().catch(() => null);
      if (!list) return;
      // Primero los mensajes y después la conversación: así el contador de no
      // leídos queda el del servidor y no se suma dos veces.
      a.receiveMessages(
        list.map((c) => lastToChatMessage(c, tr)).filter(Boolean) as ChatMessageData[],
      );
      list.forEach((c) => {
        rememberContact(c);
        a.updateConversation(mapConversation(c, meId, mem, tr, ro));
        refreshReceipts(c.id);
      });
      // Lo que se perdió mientras el socket estuvo caído, en las ya abiertas.
      for (const id of loaded.current) {
        const page = await messagingApi.messages(id).catch(() => null);
        if (page) a.receiveMessages(page.messages.map((m) => mapMessage(m, tr)));
      }
    };

    const setTyping = (conversationId: string, userId: string, on: boolean) => {
      const timers = typing.current.get(conversationId) ?? new Map();
      typing.current.set(conversationId, timers);
      const previous = timers.get(userId);
      if (previous) clearTimeout(previous);
      if (on) {
        timers.set(
          userId,
          setTimeout(() => setTyping(conversationId, userId, false), TYPING_TTL_MS),
        );
      } else {
        timers.delete(userId);
      }
      latest.current.actions.setTyping(conversationId, [...timers.keys()]);
    };

    const handle = (event: ServerEvent) => {
      const { actions: a, state: s, t: tr } = latest.current;
      switch (event.type) {
        case 'ready':
          online.current = new Set(event.online);
          onOnlineChange(new Set(online.current));
          if (readyOnce.current) void resync();
          readyOnce.current = true;
          break;
        case 'presence':
          if (event.online) online.current.add(event.userId);
          else online.current.delete(event.userId);
          onOnlineChange(new Set(online.current));
          break;
        case 'message.created': {
          const message = mapMessage(event.message, tr);
          if (message.senderId) setTyping(message.conversationId, message.senderId, false);
          if (s.conversations.some((c) => c.id === message.conversationId)) {
            a.receiveMessages([message]);
          } else {
            // Conversación nueva para él: primero la conversación, luego el mensaje.
            void refreshConversation(message.conversationId).then(() =>
              latest.current.actions.receiveMessages([message]),
            );
          }
          break;
        }
        case 'message.updated':
          a.receiveMessages([mapMessage(event.message, tr)]);
          break;
        case 'message.deleted': {
          const before = s.messages.find(
            (m) => m.conversationId === event.conversationId && m.id === event.messageId,
          );
          if (before) {
            a.receiveMessages([
              { ...before, text: '', attachments: undefined, deletedAt: new Date().toISOString() },
            ]);
          }
          break;
        }
        case 'message.reactions':
          a.receiveReactions({
            conversationId: event.conversationId,
            messageId: event.messageId,
            reactions: event.reactions,
          });
          break;
        case 'conversation.updated':
          void refreshConversation(event.conversationId);
          break;
        case 'read':
          updateReadState(event.conversationId, event.userId, event.messageId, event.readAt);
          if (event.userId === meId) a.markRead(event.conversationId);
          // Lo mío hasta ahí lo ha leído alguien más: "leído" (o uno más en el detalle).
          else refreshReceipts(event.conversationId, event.messageId);
          break;
        case 'typing':
          setTyping(event.conversationId, event.userId, true);
          break;
      }
    };

    const unsubscribe = rtClient.subscribe(handle);
    const typingTimers = typing.current;
    return () => {
      unsubscribe();
      typingTimers.forEach((timers) => timers.forEach((timer) => clearTimeout(timer)));
      typingTimers.clear();
    };
  }, [meId, onOnlineChange, onContact]);

  // ── Al abrir una conversación, su historial ─────────────────────────────────
  const activeId = state.activeConversationId;
  useEffect(() => {
    if (!activeId || loaded.current.has(activeId)) return;
    loaded.current.add(activeId);
    void actions.loadOlderMessages(activeId);
  }, [activeId, actions]);

  // ── Sin ninguna vista abierta, ninguna conversación está "activa" ───────────
  // (si no, lo que llegue mientras tanto no contaría como no leído)
  useEffect(() => {
    if (!viewing && activeId) actions.selectConversation(null);
  }, [viewing, activeId, actions]);

  // ── Leído: lo último de la conversación abierta, si se está viendo ──────────
  const activeMessages = state.messages.filter((m) => m.conversationId === activeId);
  const lastConfirmedId = [...activeMessages]
    .reverse()
    .find((m) => m.status !== 'sending' && m.status !== 'error')?.id;
  useEffect(() => {
    if (!activeId || !lastConfirmedId || !viewing) return;
    const send = () => {
      if (document.visibilityState !== 'visible') return;
      const previous = readSent.current.get(activeId);
      if (previous && isAtOrBefore(lastConfirmedId, previous)) return;
      readSent.current.set(activeId, lastConfirmedId);
      messagingApi.read(activeId, lastConfirmedId).catch(() => readSent.current.delete(activeId));
    };
    send();
    document.addEventListener('visibilitychange', send);
    return () => document.removeEventListener('visibilitychange', send);
  }, [activeId, lastConfirmedId, viewing]);

  // ── "Escribiendo…" cuando cambia el borrador ────────────────────────────────
  const draftText = activeId ? (state.drafts[activeId]?.text ?? '') : '';
  const lastTypingSent = useRef(0);
  useEffect(() => {
    if (!activeId || !draftText) return;
    const now = Date.now();
    if (now - lastTypingSent.current < TYPING_SEND_EVERY_MS) return;
    lastTypingSent.current = now;
    rtClient.typing(activeId);
  }, [activeId, draftText]);

  // ── Adjuntos de la conversación abierta: bajarlos para poder verlos ─────────
  const missing = activeMessages.filter((m) => m.attachments?.some((a) => !a.url));
  const missingKey = missing.map((m) => m.id).join(',');
  useEffect(() => {
    if (!missing.length) return;
    let cancelled = false;
    void Promise.all(
      missing.map(async (m) => {
        const attachments = await Promise.all(
          (m.attachments ?? []).map(async (a) => ({
            ...a,
            url: a.url ?? (await resolveAttachment(a.id)),
          })),
        );
        return { ...m, attachments };
      }),
    ).then((updated) => {
      if (!cancelled) latest.current.actions.receiveMessages(updated);
    });
    return () => {
      cancelled = true;
    };
    // `missingKey` resume `missing`; con el array se dispararía en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey]);

  // ── Total de no leídos para el botón del header ─────────────────────────────
  const unread = state.conversations
    .filter((c) => !c.archived && !c.muted)
    .reduce((sum, c) => sum + (c.unreadCount ?? 0) + (c.markedUnread && !c.unreadCount ? 1 : 0), 0);
  useEffect(() => {
    setUnread(unread);
  }, [unread, setUnread]);
  useEffect(() => () => setUnread(0), [setUnread]);
}
