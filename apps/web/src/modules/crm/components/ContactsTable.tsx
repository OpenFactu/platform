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
            subject: `Llamada con ${call.followUp.name}`,
            partnerId: call.followUp.partnerId,
            contactId: call.followUp.id,
            dueAt: new Date().toISOString().slice(0, 10),
            doneAt: new Date().toISOString(),
          }
        : null,
    [call.followUp],
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
      title: 'Borrar contacto',
      message: `¿Borrar a ${c.name}?`,
      tone: 'danger',
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    try {
      await contactsApi.remove(c.id);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo borrar');
    }
  };

  const columns: TableColumn<Contact>[] = [
    {
      header: 'Nombre',
      id: 'name',
      cell: (c) => (
        <span className="inline-flex items-center gap-2">
          {c.name}
          {c.isMain && <Badge variant="accent">Principal</Badge>}
          {c.tags?.map((t) => (
            <Badge key={t} variant="neutral">
              {t}
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
            header: 'Interlocutor',
            accessor: 'partnerName',
            sortable: true,
            card: 'subtitle',
          } as TableColumn<Contact>,
        ]),
    { header: 'Cargo', accessor: (c) => c.role ?? '—' },
    {
      header: 'Correo',
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
      header: 'Teléfono',
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
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nombre, interlocutor, correo…"
            className="sm:max-w-sm w-full"
          />
        ) : (
          <h3 className="text-xs font-bold uppercase tracking-wider text-fg-muted">Contactos</h3>
        )}
        {canWrite && (
          <Button
            type="button"
            size="sm"
            variant={standalone ? 'primary' : 'ghost'}
            onClick={() => setDraft({ isMain: contacts.length === 0 })}
          >
            <Plus size={14} /> Nuevo contacto
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
        emptyMessage="Sin contactos."
        ariaLabel="Contactos"
        density={standalone ? 'normal' : 'compact'}
        rowActions={(c) =>
          canDelete ? [{ label: 'Borrar', onClick: () => remove(c), destructive: true }] : []
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
