import React, { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Input,
  Modal,
  SearchableSelect,
  Skeleton,
  Switch,
  Table,
  Tabs,
  Textarea,
  useToast,
  type TableColumn,
} from '@openfactu/ui';
import { Copy, Download, Send, X } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { formsApi } from '../../api/formsApi';
import type { FormDoc, FormInviteRow } from '../../domain/types';
import { parseEmails, useShare } from '../../hooks/useShare';

interface Props {
  form: FormDoc;
  isOpen: boolean;
  onClose: () => void;
  canWrite: boolean;
  crm: boolean;
}

type View = 'link' | 'invite' | 'sent';

async function copy(text: string, toast: ReturnType<typeof useToast>) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Enlace copiado');
  } catch {
    toast.error('No se pudo copiar');
  }
}

/** Compartir: enlace, QR para imprimir e invitaciones por correo con enlace personal. */
export const ShareModal: React.FC<Props> = ({ form, isOpen, onClose, canWrite, crm }) => {
  const toast = useToast();
  const fmt = useFormat();
  const { qr, invites, contacts, reloadInvites } = useShare(form.id, isOpen, crm);
  const [view, setView] = useState<View>('link');
  const [emails, setEmails] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [send, setSend] = useState(true);
  const [busy, setBusy] = useState(false);

  const parsed = parseEmails(emails);
  const byId = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const contactOptions = useMemo(
    () =>
      contacts
        .filter((c) => !picked.includes(c.id))
        .map((c) => ({ value: c.id, label: c.name, secondaryLabel: c.email ?? 'sin correo' })),
    [contacts, picked],
  );

  const downloadQr = () => {
    if (!qr) return;
    const a = document.createElement('a');
    a.href = qr;
    a.download = `${form.slug}-qr.png`;
    a.click();
  };

  const invite = async () => {
    setBusy(true);
    try {
      const res = await formsApi.invite(form.id, {
        emails: parsed,
        contactIds: picked,
        message: message || undefined,
        send,
      });
      const failed = send ? res.filter((r) => !r.emailed).length : 0;
      if (failed) toast.error(`${failed} sin correo: copia su enlace en «Enviadas».`);
      else toast.success(send ? 'Invitaciones enviadas' : 'Enlaces creados');
      setEmails('');
      setPicked([]);
      reloadInvites();
      setView('sent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron crear');
    } finally {
      setBusy(false);
    }
  };

  const columns: TableColumn<FormInviteRow>[] = [
    { header: 'Para', id: 'to', accessor: (i) => i.name ?? i.email ?? '—', card: 'title' },
    {
      header: 'Correo',
      id: 'email',
      accessor: (i) => (i.name ? (i.email ?? '—') : '—'),
      card: 'subtitle',
    },
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
        <Button type="button" variant="ghost" size="sm" onClick={() => copy(i.link, toast)}>
          <Copy size={14} /> Copiar enlace
        </Button>
      ),
    },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Compartir formulario" size="lg" hideCancel>
      <div className="space-y-4">
        {!form.isActive && (
          <p className="rounded-xs bg-warning-bg px-3 py-2 text-sm text-warning-fg">
            El formulario no acepta respuestas: quien abra el enlace verá el mensaje de cerrado.
          </p>
        )}
        <Tabs
          value={view}
          onChange={(k) => setView(k as View)}
          items={[
            { key: 'link', label: 'Enlace y QR' },
            ...(canWrite ? [{ key: 'invite', label: 'Invitar' }] : []),
            {
              key: 'sent',
              label: 'Enviadas',
              badge: invites?.length ? (
                <Badge variant="neutral">{invites.length}</Badge>
              ) : undefined,
            },
          ]}
        />

        {view === 'link' && (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 min-w-0">
                <Input
                  label="Enlace"
                  value={form.publicUrl}
                  readOnly
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <Button type="button" onClick={() => copy(form.publicUrl, toast)}>
                <Copy size={14} /> Copiar
              </Button>
            </div>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              {qr ? (
                <img
                  src={qr}
                  alt="Código QR del formulario"
                  className="h-44 w-44 rounded-xs border border-border-default bg-white p-1"
                />
              ) : (
                <Skeleton className="h-44 w-44" />
              )}
              <div className="space-y-2 text-sm text-fg-muted">
                <p>Imprímelo en carteles, tickets o mesas: al escanearlo se abre el formulario.</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={downloadQr}
                  disabled={!qr}
                >
                  <Download size={14} /> Descargar PNG
                </Button>
              </div>
            </div>
          </div>
        )}

        {view === 'invite' && (
          <div className="space-y-4">
            <Textarea
              label="Correos"
              rows={3}
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="ana@ejemplo.com, luis@ejemplo.com"
              helperText={
                parsed.length
                  ? `${parsed.length} dirección(es) válida(s)`
                  : 'Separadas por comas o saltos de línea.'
              }
            />
            {crm && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-fg-body">Contactos del CRM</div>
                <SearchableSelect
                  ariaLabel="Añadir contacto"
                  options={contactOptions}
                  value=""
                  onChange={(v) => v && setPicked((p) => [...p, v])}
                  placeholder="Busca un contacto"
                />
                {picked.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {picked.map((id) => (
                      <Badge key={id} variant="accent" className="gap-1">
                        {byId.get(id)?.name}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Quitar ${byId.get(id)?.name ?? ''}`}
                          onClick={() => setPicked((p) => p.filter((x) => x !== id))}
                          className="h-4 w-4 p-0"
                        >
                          <X size={12} />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-xs text-fg-muted">
                  Sus respuestas quedan ligadas al contacto y a su cliente.
                </p>
              </div>
            )}
            <Textarea
              label="Mensaje (opcional)"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={form.intro ?? ''}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Switch label="Enviar por correo" checked={send} onChange={setSend} />
              <Button
                type="button"
                onClick={invite}
                isLoading={busy}
                disabled={parsed.length + picked.length === 0}
              >
                <Send size={14} /> {send ? 'Enviar invitaciones' : 'Crear enlaces'}
              </Button>
            </div>
            <p className="text-xs text-fg-muted">
              Cada persona recibe un enlace personal y en «Enviadas» ves quién ha respondido.
            </p>
          </div>
        )}

        {view === 'sent' && (
          <Table
            columns={columns}
            data={invites ?? []}
            isLoading={invites === null}
            emptyMessage="Aún no has invitado a nadie."
            ariaLabel="Invitaciones"
          />
        )}
      </div>
    </Modal>
  );
};
