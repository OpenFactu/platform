import { t } from '@/i18n/i18n';
import { useI18n } from '@/i18n/I18nContext';
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
    toast.success(t('forms.thanks.linkCopied'));
  } catch {
    toast.error(t('forms.thanks.copyFailed'));
  }
}

/** Compartir: enlace, QR para imprimir e invitaciones por correo con enlace personal. */
export const ShareModal: React.FC<Props> = ({ form, isOpen, onClose, canWrite, crm }) => {
  const { t } = useI18n();
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
        .map((c) => ({
          value: c.id,
          label: c.name,
          secondaryLabel: c.email ?? t('forms.share.noEmail'),
        })),
    [contacts, picked, t],
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
      if (failed) toast.error(t('forms.share.failedEmails', { count: failed }));
      else toast.success(send ? t('forms.share.invitesSent') : t('forms.share.linksCreated'));
      setEmails('');
      setPicked([]);
      reloadInvites();
      setView('sent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms.share.createFailed'));
    } finally {
      setBusy(false);
    }
  };

  const columns: TableColumn<FormInviteRow>[] = [
    {
      header: t('forms.share.to'),
      id: 'to',
      accessor: (i) => i.name ?? i.email ?? '—',
      card: 'title',
    },
    {
      header: t('forms.questionType.email'),
      id: 'email',
      accessor: (i) => (i.name ? (i.email ?? '—') : '—'),
      card: 'subtitle',
    },
    {
      header: t('forms.share.status'),
      id: 's',
      card: 'status',
      cell: (i) =>
        i.respondedAt ? (
          <Badge variant="success">
            {t('forms.share.responded', { date: fmt.date(i.respondedAt) })}
          </Badge>
        ) : i.sentAt ? (
          <Badge variant="info">{t('forms.share.sentOn', { date: fmt.date(i.sentAt) })}</Badge>
        ) : (
          <Badge variant="neutral">{t('forms.share.pending')}</Badge>
        ),
    },
    {
      header: '',
      id: 'link',
      align: 'right',
      cell: (i) => (
        <Button type="button" variant="ghost" size="sm" onClick={() => copy(i.link, toast)}>
          <Copy size={14} /> {t('forms.share.copyLink')}
        </Button>
      ),
    },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('forms.share.title')} size="lg" hideCancel>
      <div className="space-y-4">
        {!form.isActive && (
          <p className="rounded-xs bg-warning-bg px-3 py-2 text-sm text-warning-fg">
            {t('forms.share.inactive')}
          </p>
        )}
        <Tabs
          value={view}
          onChange={(k) => setView(k as View)}
          items={[
            { key: 'link', label: t('forms.share.tabs.link') },
            ...(canWrite ? [{ key: 'invite', label: t('forms.share.tabs.invite') }] : []),
            {
              key: 'sent',
              label: t('forms.share.tabs.sent'),
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
                  label={t('forms.share.link')}
                  value={form.publicUrl}
                  readOnly
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <Button type="button" onClick={() => copy(form.publicUrl, toast)}>
                <Copy size={14} /> {t('forms.thanks.copy')}
              </Button>
            </div>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              {qr ? (
                <img
                  src={qr}
                  alt={t('forms.share.qrAlt')}
                  className="h-44 w-44 rounded-xs border border-border-default bg-white p-1"
                />
              ) : (
                <Skeleton className="h-44 w-44" />
              )}
              <div className="space-y-2 text-sm text-fg-muted">
                <p>{t('forms.share.qrHint')}</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={downloadQr}
                  disabled={!qr}
                >
                  <Download size={14} /> {t('forms.share.downloadPng')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {view === 'invite' && (
          <div className="space-y-4">
            <Textarea
              label={t('forms.share.emails')}
              rows={3}
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder={t('forms.share.emailsPlaceholder')}
              helperText={
                parsed.length
                  ? t('forms.share.validAddresses', { count: parsed.length })
                  : t('forms.share.emailsHint')
              }
            />
            {crm && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-fg-body">
                  {t('forms.share.crmContacts')}
                </div>
                <SearchableSelect
                  ariaLabel={t('forms.share.addContact')}
                  options={contactOptions}
                  value=""
                  onChange={(v) => v && setPicked((p) => [...p, v])}
                  placeholder={t('forms.share.searchContact')}
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
                          aria-label={t('forms.share.remove', { name: byId.get(id)?.name ?? '' })}
                          onClick={() => setPicked((p) => p.filter((x) => x !== id))}
                          className="h-4 w-4 p-0"
                        >
                          <X size={12} />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-xs text-fg-muted">{t('forms.share.linkedHint')}</p>
              </div>
            )}
            <Textarea
              label={t('forms.share.message')}
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={form.intro ?? ''}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Switch label={t('forms.share.sendByEmail')} checked={send} onChange={setSend} />
              <Button
                type="button"
                onClick={invite}
                isLoading={busy}
                disabled={parsed.length + picked.length === 0}
              >
                <Send size={14} />{' '}
                {send ? t('forms.share.sendInvites') : t('forms.share.createLinks')}
              </Button>
            </div>
            <p className="text-xs text-fg-muted">{t('forms.share.personalLinkHint')}</p>
          </div>
        )}

        {view === 'sent' && (
          <Table
            columns={columns}
            data={invites ?? []}
            isLoading={invites === null}
            emptyMessage={t('forms.share.empty')}
            ariaLabel={t('forms.share.invitations')}
          />
        )}
      </div>
    </Modal>
  );
};
