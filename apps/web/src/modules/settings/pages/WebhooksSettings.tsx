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

interface Sub {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret: string | null;
  isActive: boolean;
}

const AVAILABLE_EVENTS = [
  { value: 'shipment.pending', label: 'Envío en preparación' },
  { value: 'shipment.in_transit', label: 'Envío en camino' },
  { value: 'shipment.out_for_delivery', label: 'Envío en reparto' },
  { value: 'shipment.postponed', label: 'Entrega aplazada' },
  { value: 'shipment.delivered', label: 'Envío entregado' },
  { value: 'shipment.cancelled', label: 'Envío cancelado' },
  { value: 'shipment.returned', label: 'Envío devuelto' },
  { value: 'shipment.exception', label: 'Incidencia' },
];

export const WebhooksSettings: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
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
      toast.error('Nombre y URL son obligatorios');
      return;
    }
    const url = editing ? `/api/webhooks/${editing.id}` : '/api/webhooks';
    const method = editing ? 'PATCH' : 'POST';
    const r = await coreApi.raw(method, url, form);
    if (!r.ok) {
      toast.error(r.data?.error || 'Error');
      return;
    }
    toast.success(editing ? 'Webhook actualizado' : 'Webhook creado');
    setShowModal(false);
    load();
  };

  const remove = async (id: string) => {
    const ok = await popup.confirm({
      title: 'Eliminar webhook',
      message: 'Dejarás de recibir eventos en esa URL. La suscripción no se puede recuperar.',
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    await coreApi.raw('DELETE', `/api/webhooks/${id}`);
    load();
  };

  const test = async (id: string) => {
    const r = await coreApi.raw('POST', `/api/webhooks/${id}/test`);
    if (r.ok) toast.success('Ping enviado — revisa el servicio receptor');
    else toast.error('Fallo al enviar ping');
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
        title="Webhooks salientes"
        subtitle="Suscríbete a eventos del sistema y recíbelos en tu propia URL con firma HMAC-SHA256 opcional."
        icon={<Webhook size={18} />}
        size="sm"
        divider
        actions={
          <Button type="button" onClick={openNew} className="flex items-center gap-2">
            <Plus size={14} /> Nuevo
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
            title="Sin suscripciones"
            hint="Crea la primera para recibir eventos del sistema en tu propia URL."
            action={
              <Button onClick={openNew} className="flex items-center gap-2">
                <Plus size={14} /> Nuevo
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
                    {!s.isActive && <Badge variant="neutral">Inactivo</Badge>}
                    {s.secret && <Badge variant="info">Firmado HMAC</Badge>}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono truncate">{s.url}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {s.events.length === 0 ? 'Todos los eventos' : s.events.join(', ')}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => test(s.id)}
                  title="Enviar ping de prueba"
                  className="flex items-center gap-1"
                >
                  <Send size={11} /> Probar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => openEdit(s)}
                  title="Editar"
                >
                  <Edit2 size={13} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(s.id)}
                  title="Eliminar"
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
        title={editing ? 'Editar webhook' : 'Nuevo webhook'}
        maxWidth="md"
      >
        <div className="space-y-3 pt-2">
          <Input
            label="Nombre"
            value={form.name || ''}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Integración con ERP interno"
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
            label="Secreto (opcional) — para firma HMAC-SHA256"
            value={form.secret || ''}
            onChange={(e) => setForm({ ...form, secret: e.target.value })}
            generator={{ length: 40 }}
            placeholder="Genera una cadena aleatoria"
          />
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
              Eventos a recibir (vacío = todos)
            </label>
            <div className="grid grid-cols-2 gap-1.5">
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
                  <span className="text-slate-500">{e.label}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={form.isActive !== false}
              onChange={(v) => setForm({ ...form, isActive: v })}
            />
            Activo
          </label>
          <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>Guardar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default WebhooksSettings;
