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

import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Input, Modal, Badge, Loader, useToast } from '@openfactu/ui';
import { Plus, Trash2, Edit2, Webhook, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

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
    const r = await fetch('/api/webhooks', { headers });
    const d = r.ok ? await r.json() : [];
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
    const r = await fetch(url, { method, headers, body: JSON.stringify(form) });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      toast.error(d.error || 'Error');
      return;
    }
    toast.success(editing ? 'Webhook actualizado' : 'Webhook creado');
    setShowModal(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar webhook?')) return;
    await fetch(`/api/webhooks/${id}`, { method: 'DELETE', headers });
    load();
  };

  const test = async (id: string) => {
    const r = await fetch(`/api/webhooks/${id}/test`, { method: 'POST', headers });
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
      <header className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <Webhook className="text-indigo-600 dark:text-indigo-300" size={22} />
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-slate-100">
              Webhooks salientes
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Suscríbete a eventos del sistema y recíbelos en tu propia URL con firma HMAC-SHA256
              opcional.
            </p>
          </div>
        </div>
        <Button onClick={openNew} className="flex items-center gap-2">
          <Plus size={14} /> Nuevo
        </Button>
      </header>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader />
        </div>
      ) : subs.length === 0 ? (
        <Card bodyClassName="py-10 text-center text-sm text-slate-500">
          Sin suscripciones. Crea la primera para recibir eventos en tu sistema.
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {subs.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 dark:border-slate-800/50 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                      {s.name}
                    </span>
                    {!s.isActive && <Badge variant="neutral">Inactivo</Badge>}
                    {s.secret && <Badge variant="info">Firmado HMAC</Badge>}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono truncate">{s.url}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {s.events.length === 0 ? 'Todos los eventos' : s.events.join(', ')}
                  </div>
                </div>
                <button
                  onClick={() => test(s.id)}
                  className="px-2 py-1 text-[11px] rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800"
                  title="Enviar ping de prueba"
                >
                  <Send size={11} className="inline" /> Probar
                </button>
                <button
                  onClick={() => openEdit(s)}
                  className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded"
                >
                  <Edit2 size={13} />
                </button>
                <button
                  onClick={() => remove(s.id)}
                  className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded"
                >
                  <Trash2 size={13} />
                </button>
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
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Nombre
            </label>
            <Input
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Integración con ERP interno"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              URL
            </label>
            <Input
              value={form.url || ''}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://miempresa.com/hooks/keirost"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Secreto (opcional) — para firma HMAC-SHA256
            </label>
            <Input
              type="password"
              value={form.secret || ''}
              onChange={(e) => setForm({ ...form, secret: e.target.value })}
              placeholder="Genera una cadena aleatoria"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
              Eventos a recibir (vacío = todos)
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {AVAILABLE_EVENTS.map((e) => (
                <label
                  key={e.value}
                  className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-slate-50 dark:bg-slate-800/40 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={(form.events || []).includes(e.value)}
                    onChange={() => toggleEvent(e.value)}
                  />
                  <span className="font-mono text-[10px]">{e.value}</span>
                  <span className="text-slate-500">{e.label}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive !== false}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Activo
          </label>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
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
