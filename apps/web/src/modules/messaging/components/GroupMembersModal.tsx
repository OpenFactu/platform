import React, { useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Input,
  Modal,
  SearchableSelect,
  useChatActions,
  useChatConversation,
} from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { messagingApi } from '../api/messagingApi';
import { conversationInfo, mapConversation } from '../api/messageCache';
import { messagingErrorText } from '../domain/errors';
import { useMessagingPeople } from '../context/MessagingPeople';

/** Nombre del grupo, quién está, añadir, quitar (propietario) y salir. */
export const GroupMembersModal: React.FC<{
  onClose: () => void;
  conversationId: string;
}> = ({ onClose, conversationId }) => {
  const { t } = useI18n();
  const actions = useChatActions();
  const { conversation } = useChatConversation(conversationId);
  const { meId, members, membersById, readOnly } = useMessagingPeople();
  const info = conversationInfo(conversationId);
  const isOwner = info?.myRole === 'owner';
  const [title, setTitle] = useState(info?.title ?? '');
  const [toAdd, setToAdd] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const participants = useMemo(
    () => conversation?.participantIds ?? [],
    [conversation?.participantIds],
  );
  const candidates = useMemo(
    () =>
      members
        .filter((m) => !participants.includes(m.id))
        .map((m) => ({ value: m.id, label: m.name })),
    [members, participants],
  );

  const apply = async (patch: {
    title?: string;
    addUserIds?: string[];
    removeUserIds?: string[];
  }) => {
    setBusy(true);
    setError(null);
    try {
      const dto = await messagingApi.updateGroup(conversationId, patch);
      if (dto) {
        actions.updateConversation(mapConversation(dto, meId, membersById, t, readOnly));
      } else if (conversation) {
        // Ha salido: se queda en Archivadas, de solo lectura.
        actions.updateConversation({ ...conversation, archived: true, readOnly: true });
        actions.selectConversation(null);
        onClose();
      }
      setToAdd([]);
    } catch (err) {
      setError(messagingErrorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const patch: { title?: string; addUserIds?: string[] } = {};
    if (title.trim() !== (info?.title ?? '')) patch.title = title.trim();
    if (toAdd.length) patch.addUserIds = toAdd;
    if (Object.keys(patch).length) void apply(patch);
  };

  const editable = !readOnly && !conversation?.readOnly;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('messaging.members.title')}
      size="sm"
      isBusy={busy}
      error={error}
      primaryAction={
        editable
          ? { label: t('messaging.members.save'), onClick: save, isLoading: busy }
          : undefined
      }
      tertiaryAction={
        editable
          ? {
              label: t('messaging.members.leave'),
              variant: 'danger',
              onClick: () => apply({ removeUserIds: [meId] }),
            }
          : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {editable && (
          <Input
            label={t('messaging.members.rename')}
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
        )}
        <ul className="flex flex-col gap-2">
          {participants.map((id) => {
            const member = membersById.get(id);
            const name = member?.name ?? t('messaging.unknownUser');
            return (
              <li key={id} className="flex items-center gap-3">
                <Avatar name={name} src={member?.avatarUrl ?? undefined} size="sm" />
                <span className="flex-1 min-w-0 truncate text-sm text-fg-default">
                  {name}
                  {id === meId && (
                    <span className="text-fg-muted"> · {t('messaging.members.you')}</span>
                  )}
                </span>
                {editable && isOwner && id !== meId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void apply({ removeUserIds: [id] })}
                  >
                    {t('messaging.members.remove')}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {editable && candidates.length > 0 && (
          <SearchableSelect
            multiple
            label={t('messaging.members.add')}
            placeholder={t('messaging.members.addPlaceholder')}
            options={candidates}
            value={toAdd}
            onChange={setToAdd}
          />
        )}
      </div>
    </Modal>
  );
};
