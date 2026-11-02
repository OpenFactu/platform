import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  Button,
  Modal,
  SearchableSelect,
  useDebouncedValue,
  type SearchableSelectOption,
} from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { useTabs } from '@/context/TabsContext';
import { erpApi, messagingApi } from '../api/messagingApi';
import { messagingErrorText } from '../domain/errors';
import type { ContactDto } from '../domain/messaging';

interface PartnerHit {
  id: string;
  code: string;
  name: string;
  nif: string;
}

/**
 * Vincula al cliente que escribe por un canal con un interlocutor del ERP. El
 * buscador es el global del ERP, que ya solo devuelve lo que el usuario puede
 * ver.
 */
export const LinkPartnerModal: React.FC<{ contact: ContactDto; onClose: () => void }> = ({
  contact,
  onClose,
}) => {
  const { t } = useI18n();
  const { openTab } = useTabs();
  const [term, setTerm] = useState(contact.displayName);
  const debounced = useDebouncedValue(term, 250);
  const [result, setResult] = useState<{ term: string; options: SearchableSelectOption[] }>({
    term: '',
    options: [],
  });
  const [selected, setSelected] = useState(contact.partnerId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = debounced.trim();

  useEffect(() => {
    if (q.length < 2) return;
    let cancelled = false;
    erpApi
      .search(q)
      .then((res) =>
        ((res.partners as PartnerHit[] | undefined) ?? []).map((p) => ({
          value: p.id,
          label: p.name,
          secondaryLabel: [p.code, p.nif].filter(Boolean).join(' · '),
        })),
      )
      .catch(() => [])
      .then((options) => {
        if (!cancelled) setResult({ term: q, options });
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  // El vinculado ahora sale siempre, aunque no case con la búsqueda.
  const current =
    contact.partnerId && contact.partnerName
      ? [{ value: contact.partnerId, label: contact.partnerName }]
      : [];
  const found = result.term === q ? result.options : [];
  const options = [...current, ...found.filter((o) => o.value !== contact.partnerId)];

  const save = async (partner: { id: string; name: string } | null) => {
    setBusy(true);
    setError(null);
    try {
      await messagingApi.linkContact(contact.id, partner);
      onClose();
    } catch (err) {
      setError(messagingErrorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  const chosen = options.find((o) => o.value === selected);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('messaging.contacts.linkTitle')}
      subtitle={contact.displayName}
      size="sm"
      isBusy={busy}
      error={error}
      primaryAction={{
        label: t('messaging.contacts.link'),
        disabled: !chosen || chosen.value === contact.partnerId,
        isLoading: busy,
        onClick: () => (chosen ? save({ id: chosen.value, name: chosen.label }) : undefined),
      }}
      tertiaryAction={
        contact.partnerId
          ? { label: t('messaging.contacts.unlink'), variant: 'danger', onClick: () => save(null) }
          : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-fg-muted">{t('messaging.contacts.linkHint')}</p>
        <SearchableSelect
          label={t('messaging.contacts.partner')}
          placeholder={t('messaging.contacts.partnerPlaceholder')}
          options={options}
          value={selected}
          onChange={setSelected}
          onSearchChange={setTerm}
          loading={q.length >= 2 && result.term !== q}
          emptyMessage={t('messaging.contacts.noPartners')}
        />
        {contact.partnerId && (
          <Button
            variant="soft"
            size="sm"
            className="self-start"
            onClick={() => {
              openTab(`/partners/${contact.partnerId}`, {
                title: contact.partnerName ?? undefined,
              });
              onClose();
            }}
          >
            <ExternalLink size={14} />
            {t('messaging.contacts.openPartner')}
          </Button>
        )}
      </div>
    </Modal>
  );
};
