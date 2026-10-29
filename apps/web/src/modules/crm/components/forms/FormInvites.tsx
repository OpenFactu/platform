import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  SearchableSelect,
  Switch,
  Table,
  useToast,
  type TableColumn,
} from '@openfactu/ui';
import { Copy, Send } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { formsApi } from '../../api';
import type { CrmForm, FormInvite } from '../../domain/forms';
import { useContacts } from '../../hooks/useCrmData';

/**
 * Encuestas con enlace personal: cada contacto recibe el suyo, la respuesta
 * queda ligada a él y a su cliente, y aquí se ve quién ha respondido.
 */
export const FormInvites: React.FC<{ form: CrmForm }> = ({ form }) => {
  const fmt = useFormat();
  const toast = useToast();
  const { contacts } = useContacts();
  const [invites, setInvites] = useState<FormInvite[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [send, setSend] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(
    () =>
      formsApi
        .invites(form.id)
        .then(setInvites)
        .catch(() => setInvites([])),
    [form.id],
  );
  useEffect(() => {
    reload();
  }, [reload]);

  const options = useMemo(
    () =>
      contacts
        .filter((c) => !picked.includes(c.id))
        .map((c) => ({
          value: c.id,
          label: c.name,
          secondaryLabel: [c.partnerName, c.email].filter(Boolean).join(' · '),
        })),
    [contacts, picked],
  );

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const invite = async () => {
    setBusy(true);
    try {
      const res = await formsApi.invite(form.id, picked, send);
      const failed = res.filter((r) => send && !r.emailed);
      if (failed.length)
        toast.error(
          `${failed.length} sin enviar por correo (sin dirección o error de SMTP): copia su enlace en la lista.`,
        );
      else toast.success(send ? 'Invitaciones enviadas' : 'Enlaces creados');
      setPicked([]);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron crear');
    } finally {
      setBusy(false);
    }
  };

  const columns: TableColumn<FormInvite>[] = [
    { header: 'Contacto', id: 'c', accessor: (i) => i.contactName ?? '—', card: 'title' },
    { header: 'Cliente', id: 'p', accessor: (i) => i.partnerName ?? '—', card: 'subtitle' },
    {
      header: 'Estado',
      id: 's',
      card: 'status',
      cell: (i) =>
        i.respondedAt ? (
          <Badge variant="success">Respondida {fmt.date(i.respondedAt)}</Badge>
        ) : i.sentAt ? (
          <Badge variant="info">Enviada {fmt.date(i.sentAt)}</Badge>
        ) : (
          <Badge variant="neutral">Pendiente</Badge>
        ),
    },
    {
      header: '',
      id: 'link',
      align: 'right',
      cell: (i) => (
        <Button type="button" variant="ghost" size="sm" onClick={() => copy(i.link)}>
          <Copy size={14} /> Copiar enlace
        </Button>
      ),
    },
  ];

  const byId = new Map(contacts.map((c) => [c.id, c]));

  return (
    <div className="space-y-4">
      <Card title="Invitar contactos" subtitle="Cada uno recibe un enlace personal.">
        <div className="space-y-3">
          <SearchableSelect
            label="Añadir contacto"
            options={options}
            value={current}
            onChange={(v) => {
              if (v) setPicked((p) => [...p, v]);
              setCurrent('');
            }}
            placeholder="Busca por nombre, cliente o correo"
            disabled={!form.isActive}
          />
          {picked.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {picked.map((id) => (
                <Badge key={id} variant="accent" className="gap-1">
                  {byId.get(id)?.name}
                  <button
                    type="button"
                    aria-label="Quitar"
                    onClick={() => setPicked((p) => p.filter((x) => x !== id))}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Switch label="Enviar por correo" checked={send} onChange={setSend} />
            <Button
              type="button"
              onClick={invite}
              isLoading={busy}
              disabled={picked.length === 0 || !form.isActive}
            >
              <Send size={14} /> {send ? 'Enviar invitaciones' : 'Crear enlaces'}
            </Button>
          </div>
          {!form.isActive && (
            <p className="text-xs text-fg-muted">Activa el formulario para poder invitar.</p>
          )}
        </div>
      </Card>
      <Table
        columns={columns}
        data={invites ?? []}
        isLoading={invites === null}
        emptyMessage="Aún no has invitado a nadie."
        ariaLabel="Invitaciones"
      />
    </div>
  );
};
