import React, { useMemo, useState } from 'react';
import { Input, Modal, SearchableSelect, SegmentedControl, useChatActions } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { messagingApi } from '../api/messagingApi';
import { mapConversation } from '../api/messageCache';
import { messagingErrorText } from '../domain/errors';
import { useMessagingPeople } from '../context/MessagingPeople';

type Kind = 'direct' | 'group';

/** Abrir un chat con alguien (si ya existe, se reutiliza) o crear un grupo. */
export const NewConversationModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useI18n();
  const actions = useChatActions();
  const { meId, members, membersById, readOnly } = useMessagingPeople();
  const [kind, setKind] = useState<Kind>('direct');
  const [person, setPerson] = useState('');
  const [people, setPeople] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(
    () => members.filter((m) => m.id !== meId).map((m) => ({ value: m.id, label: m.name })),
    [members, meId],
  );

  const canSubmit = kind === 'direct' ? Boolean(person) : people.length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const dto =
        kind === 'direct'
          ? await messagingApi.createDirect(person)
          : await messagingApi.createGroup(title.trim(), people);
      actions.updateConversation(mapConversation(dto, meId, membersById, t, readOnly));
      actions.selectConversation(dto.id);
      onClose();
    } catch (err) {
      setError(messagingErrorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('messaging.newConversation.title')}
      size="sm"
      isBusy={busy}
      error={error}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      primaryAction={{
        label: t('messaging.newConversation.create'),
        disabled: !canSubmit,
        isLoading: busy,
      }}
    >
      {options.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('messaging.newConversation.noMembers')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <SegmentedControl<Kind>
            fullWidth
            value={kind}
            onChange={setKind}
            options={[
              { value: 'direct', label: t('messaging.newConversation.direct') },
              { value: 'group', label: t('messaging.newConversation.group') },
            ]}
          />
          {kind === 'direct' ? (
            <SearchableSelect
              label={t('messaging.newConversation.person')}
              placeholder={t('messaging.newConversation.personPlaceholder')}
              options={options}
              value={person}
              onChange={setPerson}
            />
          ) : (
            <>
              <Input
                label={t('messaging.newConversation.groupTitle')}
                placeholder={t('messaging.newConversation.groupTitlePlaceholder')}
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
              />
              <SearchableSelect
                multiple
                label={t('messaging.newConversation.people')}
                placeholder={t('messaging.newConversation.peoplePlaceholder')}
                options={options}
                value={people}
                onChange={setPeople}
              />
            </>
          )}
        </div>
      )}
    </Modal>
  );
};
