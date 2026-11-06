import React, { useState, useSyncExternalStore } from 'react';
import {
  CalendarPlus,
  FileText,
  Link2,
  MessageSquarePlus,
  Users,
  PhoneCall,
  Video,
  X,
} from 'lucide-react';
import {
  ChatWorkspace,
  useChatActions,
  useChatConversation,
  type ChatHeaderAction,
} from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { conversationInfo, mapMessage } from '../api/messageCache';
import { callClient } from '../api/callClient';
import { rtClient } from '../api/rtClient';
import { useMessagingPeople } from '../context/MessagingPeople';
import { NewConversationModal } from './NewConversationModal';
import { ShareDocumentModal } from './ShareDocumentModal';
import { GroupMembersModal } from './GroupMembersModal';
import { LinkPartnerModal } from './LinkPartnerModal';
import { MeetingModal } from './MeetingModal';

/**
 * El chat completo: el `ChatWorkspace` del kit de @openfactu/ui con las
 * acciones propias de Keirost (nueva conversación, compartir documento,
 * vincular el cliente a un interlocutor, participantes del grupo). Con poco
 * ancho el kit pasa a una columna y pliega las acciones de la cabecera en «⋯».
 *
 * Con `onClose` es el panel lateral: lleva una ✕ para cerrarlo.
 */
export const MessagingWorkspace: React.FC<{ className?: string; onClose?: () => void }> = ({
  className,
  onClose,
}) => {
  const { t } = useI18n();
  const { readOnly } = useMessagingPeople();
  const { conversation } = useChatConversation();
  const actions = useChatActions();
  const [modal, setModal] = useState<'new' | 'share' | 'members' | 'link' | 'meeting' | null>(null);

  const info = conversation ? conversationInfo(conversation.id) : undefined;
  // Con un cliente por un canal: se vincula a un interlocutor y no se le
  // comparten documentos internos (no los podría abrir).
  const contact = info?.kind === 'customer' ? info.contact : null;
  const writable = !readOnly && !conversation?.readOnly;

  const menuActions: ChatHeaderAction[] = [];
  if (contact && !readOnly) {
    menuActions.push({
      id: 'link',
      label: contact.partnerName ?? t('messaging.contacts.linkTitle'),
      icon: <Link2 size={18} />,
      onSelect: () => setModal('link'),
    });
  }
  if (!contact && writable) {
    menuActions.push({
      id: 'share',
      label: t('messaging.documents.share'),
      icon: <FileText size={18} />,
      onSelect: () => setModal('share'),
    });
  }
  // También con clientes: les llega como texto, con la hora y el enlace.
  if (conversation && writable) {
    menuActions.push({
      id: 'meeting',
      label: t('messaging.meetings.schedule'),
      icon: <CalendarPlus size={18} />,
      onSelect: () => setModal('meeting'),
    });
  }
  if (info?.kind === 'group') {
    menuActions.push({
      id: 'members',
      label: t('messaging.members.button'),
      icon: <Users size={18} />,
      onSelect: () => setModal('members'),
    });
  }

  // Las de clientes no admiten llamada. Si ya hay una en curso, se entra en ella.
  const canCall = Boolean(conversation) && !contact && writable && rtClient.canCall;
  const { active } = useSyncExternalStore(callClient.subscribe, callClient.getSnapshot);
  const callInCourse = conversation ? active[conversation.id] : undefined;
  const callLabel = callInCourse ? t('messaging.calls.joinOngoing') : t('messaging.calls.start');
  const callButton = canCall && conversation && (
    <button
      type="button"
      className={`k-chat-icon-button ${callInCourse ? 'text-success-fg' : ''}`}
      aria-label={callLabel}
      title={callLabel}
      onClick={() => void callClient.callConversation(conversation.id)}
    >
      {callInCourse ? <PhoneCall size={18} className="animate-pulse" /> : <Video size={18} />}
    </button>
  );

  const closeButton = onClose && (
    <button
      type="button"
      className="k-chat-icon-button"
      aria-label={t('common.close')}
      title={t('common.close')}
      onClick={onClose}
    >
      <X size={18} />
    </button>
  );

  return (
    <>
      <ChatWorkspace
        className={className}
        composerLayout="inline"
        headerActions={callButton}
        listActions={
          <>
            {!readOnly && (
              <button
                type="button"
                className="k-chat-icon-button"
                aria-label={t('messaging.newConversation.button')}
                title={t('messaging.newConversation.button')}
                onClick={() => setModal('new')}
              >
                <MessageSquarePlus size={18} />
              </button>
            )}
            {closeButton}
          </>
        }
        headerMenuActions={menuActions}
        headerEndActions={closeButton}
      />

      {/* Se montan al abrirse: cada vez empiezan en blanco. */}
      {modal === 'new' && <NewConversationModal onClose={() => setModal(null)} />}
      {modal === 'share' && conversation && (
        <ShareDocumentModal onClose={() => setModal(null)} conversationId={conversation.id} />
      )}
      {modal === 'link' && contact && (
        <LinkPartnerModal contact={contact} onClose={() => setModal(null)} />
      )}
      {modal === 'meeting' && conversation && (
        <MeetingModal
          conversationId={conversation.id}
          customer={Boolean(contact)}
          onSaved={(dto) => actions.receiveMessages([mapMessage(dto, t)])}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'members' && conversation && (
        <GroupMembersModal onClose={() => setModal(null)} conversationId={conversation.id} />
      )}
    </>
  );
};
