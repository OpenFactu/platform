import { useI18n } from '@/i18n/I18nContext';
import React, { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  SearchInput,
  Table,
  usePopup,
  useToast,
  type TableColumn,
} from '@openfactu/ui';
import { Plus } from 'lucide-react';
import { contactsApi } from '../api';
import type { Contact } from '../domain/crm';
import { useContacts } from '../hooks/useCrmData';
import { useCrmPermissions } from '../hooks/useCrmPermissions';
import { ContactForm, type ContactDraft } from './ContactForm';
import { ActivityForm, type ActivityDraft } from './ActivityForm';
import { useCallFollowUp } from '../hooks/useCallFollowUp';

interface Props {
  /** Limita a los contactos de un interlocutor (ficha del interlocutor). */
  partnerId?: string;
  /** Muestra el buscador y el botón grande; en la ficha va más compacto. */
  standalone?: boolean;
}

export const ContactsTable: React.FC<Props> = ({ partnerId, standalone }) => {
  const toast = useToast();
  const { t } = useI18n();
  const popup = usePopup();
  const { canWrite, canDelete } = useCrmPermissions('/crm/contacts');
  const { contacts, loading, error, refresh } = useContacts(partnerId);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<ContactDraft | null>(null);
  const call = useCallFollowUp();
  // Memoizado: ActivityForm reinicia el formulario cuando cambia la identidad del borrador.
  const callDraft = useMemo<ActivityDraft | null>(
    () =>
      call.followUp
        ? {
            type: 'call',
            subject: t('crm.contacts.callWith', { name: call.followUp.name }),
            partnerId: call.followUp.partnerId,
            contactId: call.followUp.id,
            dueAt: new Date().toISOString().slice(0, 10),
            doneAt: new Date().toISOString(),
          }
        : null,
    [call.followUp, t],
  );

  const term = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      term
        ? contacts.filter((c) =>
            [c.name, c.partnerName, c.email, c.role, c.phone, c.mobile, ...(c.tags ?? [])].some(
              (v) => v?.toLowerCase().includes(term),
            ),
          )
        : contacts,
    [contacts, term],
  );

  const remove = async (c: Contact) => {
    const ok = await popup.confirm({
      title: t('crm.contacts.deleteTitle'),
      message: t('crm.contacts.deleteMessage', { name: c.name }),
      tone: 'danger',
      confirmLabel: t('crm.common.delete'),
    });
    if (!ok) return;
    try {
      await contactsApi.remove(c.id);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('crm.errors.deleteFailed'));
    }
  };

  const columns: TableColumn<Contact>[] = [
    {
      header: t('crm.common.name'),
      id: 'name',
      cell: (c) => (
        <span className="inline-flex items-center gap-2">
          {c.name}
          {c.isMain && <Badge variant="accent">{t('crm.contacts.main')}</Badge>}
          {c.tags?.map((tag) => (
            <Badge key={tag} variant="neutral">
              {tag}
            </Badge>
          ))}
        </span>
      ),
      sortAccessor: (c) => c.name,
      sortable: true,
      card: 'title',
    },
    ...(partnerId
      ? []
      : [
          {
            header: t('crm.partnerSelect.label'),
            accessor: 'partnerName',
            sortable: true,
            card: 'subtitle',
          } as TableColumn<Contact>,
        ]),
    { header: t('crm.contactForm.role'), accessor: (c) => c.role ?? '—' },
    {
      header: t('crm.common.email'),
      id: 'email',
      cell: (c) =>
        c.email ? (
          <a
            href={`mailto:${c.email}`}
            onClick={(e) => e.stopPropagation()}
            className="text-accent hover:underline"
          >
            {c.email}
          </a>
        ) : (
          '—'
        ),
    },
    {
      header: t('crm.common.phone'),
      id: 'phone',
      cell: (c) => {
        const tel = c.mobile || c.phone;
        return tel ? (
          <a
            href={`tel:${tel}`}
            onClick={(e) => {
              e.stopPropagation();
              call.startCall(c);
            }}
            className="text-accent hover:underline"
          >
            {tel}
          </a>
        ) : (
          '—'
        );
      },
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        {standalone ? (
          <div className="w-full sm:max-w-sm">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('crm.contacts.searchPlaceholder')}
            />
          </div>
        ) : (
          <h3 className="text-xs font-bold uppercase tracking-wider text-fg-muted">
            {t('crm.nav.contacts')}
          </h3>
        )}
        {canWrite && (
          <Button
            type="button"
            size="sm"
            variant={standalone ? 'primary' : 'ghost'}
            onClick={() => setDraft({ isMain: contacts.length === 0 })}
          >
            <Plus size={14} /> {t('crm.contactForm.newTitle')}
          </Button>
        )}
      </div>
      <Table
        columns={columns}
        data={rows}
        isLoading={loading}
        errorMessage={error ?? undefined}
        onRetry={refresh}
        onRowClick={canWrite ? setDraft : undefined}
        emptyMessage={t('crm.contacts.empty')}
        ariaLabel={t('crm.nav.contacts')}
        density={standalone ? 'normal' : 'compact'}
        rowActions={(c) =>
          canDelete
            ? [{ label: t('crm.common.delete'), onClick: () => remove(c), destructive: true }]
            : []
        }
      />
      <ActivityForm draft={callDraft} onClose={call.clear} onSaved={() => {}} />
      <ContactForm
        draft={draft}
        fixedPartnerId={partnerId}
        onClose={() => setDraft(null)}
        onSaved={refresh}
      />
    </div>
  );
};
