/**
 * Ajustes → Webhooks salientes.
 *
 * Permite suscribirse a eventos del core (p. ej. `shipment.delivered`) y
 * recibir POSTs en una URL propia. Cada suscripción tiene:
 *   - URL receptor
 *   - Secreto opcional (para firmar el payload con HMAC-SHA256, header
 *     `X-Keirost-Signature`).
 *   - Lista de eventos a escuchar (vacía = todos).
 */

import { coreApi } from '@/shared/api';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Button,
  Input,
  PasswordInput,
  Checkbox,
  EmptyState,
  Modal,
  Badge,
  Loader,
  PageHeader,
  useToast,
  usePopup,
} from '@openfactu/ui';
import { Plus, Trash2, Edit2, Webhook, Send } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';

interface Sub {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret: string | null;
  isActive: boolean;
}

const AVAILABLE_EVENTS = [
  { value: 'shipment.pending', label: 'settings.webhooks.events.pending' },
  { value: 'shipment.in_transit', label: 'settings.webhooks.events.inTransit' },
  { value: 'shipment.out_for_delivery', label: 'settings.webhooks.events.outForDelivery' },
  { value: 'shipment.postponed', label: 'settings.webhooks.events.postponed' },
  { value: 'shipment.delivered', label: 'settings.webhooks.events.delivered' },
  { value: 'shipment.cancelled', label: 'settings.webhooks.events.cancelled' },
  { value: 'shipment.returned', label: 'settings.webhooks.events.returned' },
  { value: 'shipment.exception', label: 'settings.webhooks.events.exception' },
];

export const WebhooksSettings: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const { t } = useI18n();
  const popup = usePopup();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Sub | null>(null);
  const [form, setForm] = useState<Partial<Sub>>({ events: [], isActive: true });

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-tenant-id': user?.tenantId || '',
    }),
    [token, user?.tenantId],
  );

  const load = async () => {
    setLoading(true);
    const r = await coreApi.raw('GET', '/api/webhooks');
    const d = r.ok ? r.data : [];
    setSubs(Array.isArray(d) ? d : []);
    setLoading(false);
  };

  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const openNew = () => {
    setEditing(null);
    setForm({ events: [], isActive: true });
    setShowModal(true);
  };

  const openEdit = (s: Sub) => {
    setEditing(s);
    setForm({ ...s, events: Array.isArray(s.events) ? s.events : [] });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name || !form.url) {
      toast.error(t('settings.webhooks.required'));
      return;
    }
    const url = editing ? `/api/webhooks/${editing.id}` : '/api/webhooks';
    const method = editing ? 'PATCH' : 'POST';
    const r = await coreApi.raw(method, url, form);
    if (!r.ok) {
      toast.error(r.data?.error || t('settings.webhooks.error'));
      return;
    }
    toast.success(editing ? t('settings.webhooks.updated') : t('settings.webhooks.created'));
    setShowModal(false);
    load();
  };

  const remove = async (id: string) => {
    const ok = await popup.confirm({
      title: t('settings.webhooks.deleteTitle'),
      message: t('settings.webhooks.deleteMessage'),
      tone: 'danger',
      confirmLabel: t('settings.webhooks.delete'),
    });
    if (!ok) return;
    await coreApi.raw('DELETE', `/api/webhooks/${id}`);
    load();
  };

  const test = async (id: string) => {
    const r = await coreApi.raw('POST', `/api/webhooks/${id}/test`);
    if (r.ok) toast.success(t('settings.webhooks.pingSent'));
    else toast.error(t('settings.webhooks.pingFailed'));
  };

  const toggleEvent = (evt: string) => {
    const curr = new Set<string>(form.events || []);
    if (curr.has(evt)) curr.delete(evt);
    else curr.add(evt);
    setForm({ ...form, events: [...curr] });
  };

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <PageHeader
        title={t('settings.webhooks.title')}
        subtitle={t('settings.webhooks.subtitle')}
        icon={<Webhook size={18} />}
        size="sm"
        divider
        actions={
          <Button type="button" onClick={openNew} className="flex items-center gap-2">
            <Plus size={14} /> {t('settings.webhooks.new')}
          </Button>
        }
      />

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader />
        </div>
      ) : subs.length === 0 ? (
        <Card bodyClassName="p-0">
          <EmptyState
            icon={<Webhook size={18} />}
            title={t('settings.webhooks.emptyTitle')}
            hint={t('settings.webhooks.emptyHint')}
            action={
              <Button onClick={openNew} className="flex items-center gap-2">
                <Plus size={14} /> {t('settings.webhooks.new')}
              </Button>
            }
          />
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {subs.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-fg-default">{s.name}</span>
                    {!s.isActive && (
                      <Badge variant="neutral">{t('settings.webhooks.inactive')}</Badge>
                    )}
                    {s.secret && <Badge variant="info">{t('settings.webhooks.signed')}</Badge>}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono truncate">{s.url}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {s.events.length === 0 ? t('settings.webhooks.allEvents') : s.events.join(', ')}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => test(s.id)}
                  title={t('settings.webhooks.sendPing')}
                  className="flex items-center gap-1"
                >
                  <Send size={11} /> {t('settings.webhooks.test')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => openEdit(s)}
                  title={t('settings.webhooks.edit')}
                >
                  <Edit2 size={13} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(s.id)}
                  title={t('settings.webhooks.delete')}
                >
                  <Trash2 size={13} />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? t('settings.webhooks.editTitle') : t('settings.webhooks.newTitle')}
        maxWidth="md"
      >
        <div className="space-y-3 pt-2">
          <Input
            label={t('settings.webhooks.name')}
            value={form.name || ''}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t('settings.webhooks.namePlaceholder')}
          />
          <Input
            label="URL"
            value={form.url || ''}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://miempresa.com/hooks/keirost"
          />
          {/* `generator`: el secreto HMAC es una cadena aleatoria, así que el
              botón de generar sustituye al «Genera una cadena aleatoria» que
              antes solo era un placeholder. */}
          <PasswordInput
            label={t('settings.webhooks.secret')}
            value={form.secret || ''}
            onChange={(e) => setForm({ ...form, secret: e.target.value })}
            generator={{ length: 40 }}
            placeholder={t('settings.webhooks.secretPlaceholder')}
          />
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
              {t('settings.webhooks.eventsLabel')}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {AVAILABLE_EVENTS.map((e) => (
                <label
                  key={e.value}
                  className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-bg-muted cursor-pointer"
                >
                  <Checkbox
                    checked={(form.events || []).includes(e.value)}
                    onChange={() => toggleEvent(e.value)}
                  />
                  <span className="font-mono text-[10px]">{e.value}</span>
                  <span className="text-slate-500">{t(e.label)}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={form.isActive !== false}
              onChange={(v) => setForm({ ...form, isActive: v })}
            />
            {t('settings.webhooks.active')}
          </label>
          <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              {t('settings.webhooks.cancel')}
            </Button>
            <Button onClick={save}>{t('settings.webhooks.save')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default WebhooksSettings;
