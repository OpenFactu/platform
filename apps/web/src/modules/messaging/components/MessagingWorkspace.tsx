import React, { useMemo, useState } from 'react';
import { FileText, MessageSquarePlus, Users } from 'lucide-react';
import {
  ChatComposer,
  ChatConversationList,
  ChatHeader,
  ChatMessage,
  ChatMessageList,
  ChatSearch,
  EmptyState,
  groupChatMessages,
  useChatConversation,
  type ChatMessageData,
} from '@openfactu/ui';
import { cn } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { conversationInfo, documentFor } from '../api/messageCache';
import { useMessagingPeople } from '../context/MessagingPeople';
import { DocumentMessage } from './DocumentMessage';
import { NewConversationModal } from './NewConversationModal';
import { ShareDocumentModal } from './ShareDocumentModal';
import { GroupMembersModal } from './GroupMembersModal';

/**
 * El chat completo: lista de conversaciones, hilo y compositor del kit de
 * @openfactu/ui. Es `ChatWorkspace` montado a mano para poder pintar los
 * documentos compartidos como tarjeta (`renderMessage`) y añadir las acciones
 * propias de Keirost (nueva conversación, compartir documento, participantes).
 */
export const MessagingWorkspace: React.FC<{ className?: string }> = ({ className }) => {
  const { t } = useI18n();
  const { readOnly } = useMessagingPeople();
  const { conversation, messages } = useChatConversation();
  const [modal, setModal] = useState<'new' | 'share' | 'members' | null>(null);
  // La búsqueda es de una conversación: al cambiar de conversación empieza cerrada.
  const [search, setSearch] = useState<{ id?: string; query: string; open: boolean }>({
    query: '',
    open: false,
  });
  const current = search.id === conversation?.id ? search : { query: '', open: false };
  const query = current.query;
  const searchOpen = current.open;
  const setQuery = (q: string) => setSearch({ id: conversation?.id, query: q, open: true });
  const setSearchOpen = (open: boolean) =>
    setSearch({ id: conversation?.id, query: open ? query : '', open });

  // Qué mensajes van pegados al anterior (mismo autor, seguidos): sin avatar ni nombre.
  const grouped = useMemo(
    () =>
      new Set(
        groupChatMessages(messages).flatMap((g) =>
          g.messages.slice(1).map((m) => m.clientId ?? m.id),
        ),
      ),
    [messages],
  );

  const renderMessage = (message: ChatMessageData) => {
    const isGrouped = grouped.has(message.clientId ?? message.id);
    const doc = !message.deletedAt ? documentFor(message.id) : undefined;
    return doc ? (
      <DocumentMessage message={message} doc={doc} grouped={isGrouped} />
    ) : (
      <ChatMessage message={message} grouped={isGrouped} searchQuery={query} />
    );
  };

  const isGroup = conversation ? conversationInfo(conversation.id)?.kind === 'group' : false;

  return (
    <div
      className={cn('k-chat-workspace', className)}
      data-conversation-open={Boolean(conversation)}
    >
      <ChatConversationList
        actions={
          !readOnly && (
            <button
              type="button"
              className="k-chat-icon-button"
              aria-label={t('messaging.newConversation.button')}
              title={t('messaging.newConversation.button')}
              onClick={() => setModal('new')}
            >
              <MessageSquarePlus size={18} />
            </button>
          )
        }
      />
      <section
        className="k-chat-thread"
        aria-label={conversation?.title ?? t('messaging.nav.messages')}
      >
        {conversation ? (
          <>
            <ChatHeader
              onSearch={() => setSearchOpen(!searchOpen)}
              actions={
                <>
                  {!readOnly && !conversation.readOnly && (
                    <button
                      type="button"
                      className="k-chat-icon-button"
                      aria-label={t('messaging.documents.share')}
                      title={t('messaging.documents.share')}
                      onClick={() => setModal('share')}
                    >
                      <FileText size={18} />
                    </button>
                  )}
                  {isGroup && (
                    <button
                      type="button"
                      className="k-chat-icon-button"
                      aria-label={t('messaging.members.button')}
                      title={t('messaging.members.button')}
                      onClick={() => setModal('members')}
                    >
                      <Users size={18} />
                    </button>
                  )}
                </>
              }
            />
            {searchOpen && (
              <ChatSearch
                query={query}
                onChange={setQuery}
                onClose={() => {
                  setQuery('');
                  setSearchOpen(false);
                }}
              />
            )}
            <ChatMessageList renderMessage={renderMessage} searchQuery={query} />
            <ChatComposer disabled={readOnly || conversation.readOnly} />
          </>
        ) : (
          <div className="k-chat-empty">
            <EmptyState
              variant="compact"
              icon={<MessageSquarePlus size={28} />}
              title={t('messaging.nav.messages')}
              hint={t('messaging.nav.description')}
            />
          </div>
        )}
      </section>

      {/* Se montan al abrirse: cada vez empiezan en blanco. */}
      {modal === 'new' && <NewConversationModal onClose={() => setModal(null)} />}
      {modal === 'share' && conversation && (
        <ShareDocumentModal onClose={() => setModal(null)} conversationId={conversation.id} />
      )}
      {modal === 'members' && conversation && (
        <GroupMembersModal onClose={() => setModal(null)} conversationId={conversation.id} />
      )}
    </div>
  );
};
