import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Input, Modal, Loader, Badge, useToast } from '@openfactu/ui';
import { Plus, Trash2, Play, Zap, History, Edit2, Pause, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFormat } from '../hooks/useFormat';

interface Automation {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  triggerType: 'schedule' | 'event' | 'manual';
  triggerConfig: any;
  actionType: 'email' | 'webhook' | 'notification';
  actionConfig: any;
  createdAt: string;
  updatedAt: string;
}

interface RunRow {
  id: string;
  status: 'ok' | 'fail';
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  outputText: string | null;
  errorText: string | null;
  triggerSource: string | null;
}

const EVENT_OPTIONS = [
  { value: 'salesInvoice.afterCreate', label: 'Factura de venta creada' },
  { value: 'salesInvoice.afterPost', label: 'Factura de venta asentada' },
  { value: 'purchaseInvoice.afterCreate', label: 'Factura de compra creada' },
  { value: 'purchaseInvoice.afterPost', label: 'Factura de compra asentada' },
  { value: 'salesOrder.afterCreate', label: 'Pedido de venta creado' },
  { value: 'salesDeliveryNote.afterCreate', label: 'Albarán de venta creado' },
  { value: 'purchaseOrder.afterCreate', label: 'Pedido de compra creado' },
  { value: 'purchaseDeliveryNote.afterCreate', label: 'Albarán de compra creado' },
  { value: 'partner.afterCreate', label: 'Partner creado' },
  { value: 'item.afterCreate', label: 'Artículo creado' },
];

const defaultForm = (): any => ({
  id: null,
  name: '',
  description: '',
  enabled: true,
  triggerType: 'schedule',
  cron: '0 9 * * 1',
  event: EVENT_OPTIONS[0].value,
  actionType: 'email',
  email: { to: '', subject: '', body: '' },
  webhook: { url: '', method: 'POST', body: '{}' },
  notification: { role: 'ADMIN', title: '', body: '' },
});

export const Automations: React.FC = () => {
  const { token, user } = useAuth();
  const fmt = useFormat();
  const toast = useToast();
  const [rows, setRows] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<any>(defaultForm());
  const [submitting, setSubmitting] = useState(false);
  const [logsFor, setLogsFor] = useState<Automation | null>(null);
  const [logs, setLogs] = useState<RunRow[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/automations', { headers });
      const d = await r.json();
      setRows(Array.isArray(d) ? d : []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const openCreate = () => {
    setForm(defaultForm());
    setShowModal(true);
  };

  const openEdit = (a: Automation) => {
    setForm({
      id: a.id,
      name: a.name,
      description: a.description || '',
      enabled: a.enabled,
      triggerType: a.triggerType,
      cron: a.triggerConfig?.cron || '0 9 * * 1',
      event: a.triggerConfig?.event || EVENT_OPTIONS[0].value,
      actionType: a.actionType,
      email: {
        to: a.actionConfig?.to || '',
        subject: a.actionConfig?.subject || '',
        body: a.actionConfig?.body || '',
      },
      webhook: {
        url: a.actionConfig?.url || '',
        method: a.actionConfig?.method || 'POST',
        body:
          typeof a.actionConfig?.body === 'string'
            ? a.actionConfig.body
            : JSON.stringify(a.actionConfig?.body || {}, null, 2),
      },
      notification: {
        role: a.actionConfig?.role || 'ADMIN',
        title: a.actionConfig?.title || '',
        body: a.actionConfig?.body || '',
      },
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name) {
      toast.error('El nombre es obligatorio.');
      return;
    }
    const triggerConfig: any =
      form.triggerType === 'schedule'
        ? { cron: form.cron }
        : form.triggerType === 'event'
          ? { event: form.event }
          : {};

    const actionConfig: any =
      form.actionType === 'email'
        ? { to: form.email.to, subject: form.email.subject, body: form.email.body }
        : form.actionType === 'webhook'
          ? {
              url: form.webhook.url,
              method: form.webhook.method,
              body: tryParseJson(form.webhook.body),
            }
          : {
              role: form.notification.role,
              title: form.notification.title,
              body: form.notification.body,
            };

    const body = {
      name: form.name,
      description: form.description || null,
      enabled: !!form.enabled,
      triggerType: form.triggerType,
      triggerConfig,
      actionType: form.actionType,
      actionConfig,
    };

    setSubmitting(true);
    try {
      const url = form.id ? `/api/automations/${form.id}` : '/api/automations';
      const method = form.id ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Error al guardar');
        return;
      }
      toast.success(form.id ? 'Actualizada' : 'Creada');
      setShowModal(false);
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEnabled = async (a: Automation) => {
    await fetch(`/api/automations/${a.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ enabled: !a.enabled }),
    });
    load();
  };

  const remove = async (a: Automation) => {
    if (!confirm(`¿Eliminar automatización "${a.name}"?`)) return;
    await fetch(`/api/automations/${a.id}`, { method: 'DELETE', headers });
    load();
  };

  const runNow = async (a: Automation) => {
    const res = await fetch(`/api/automations/${a.id}/run`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ context: {} }),
    });
    const data = await res.json();
    if (data.status === 'ok') toast.success(data.output || 'OK');
    else toast.error(data.error || 'Falló');
  };

  const openLogs = async (a: Automation) => {
    setLogsFor(a);
    setLoadingLogs(true);
    const r = await fetch(`/api/automations/${a.id}/runs`, { headers });
    const d = await r.json();
    setLogs(Array.isArray(d) ? d : []);
    setLoadingLogs(false);
  };

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <header className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <Zap className="text-blue-600 dark:text-blue-300" size={22} />
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              Automatizaciones
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ejecuta acciones según un horario, un evento del sistema o a demanda.
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus size={14} /> Nueva
        </Button>
      </header>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader />
        </div>
      ) : rows.length === 0 ? (
        <Card bodyClassName="py-16 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Aún no has creado automatizaciones.
          </p>
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {rows.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 dark:border-slate-800/50 last:border-0"
              >
                <button
                  onClick={() => toggleEnabled(a)}
                  title={a.enabled ? 'Desactivar' : 'Activar'}
                  className={`p-1.5 rounded ${a.enabled ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10' : 'text-slate-300 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  {a.enabled ? <CheckCircle2 size={16} /> : <Pause size={16} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                      {a.name}
                    </span>
                    <Badge variant="neutral">{a.triggerType}</Badge>
                    <Badge variant="info">{a.actionType}</Badge>
                    {!a.enabled && <Badge variant="warning">Inactiva</Badge>}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono truncate">
                    {a.triggerType === 'schedule' && `cron: ${a.triggerConfig?.cron || ''}`}
                    {a.triggerType === 'event' && `event: ${a.triggerConfig?.event || ''}`}
                    {a.triggerType === 'manual' && 'ejecución manual'}
                    {a.description && <span className="ml-2 italic text-slate-400">— {a.description}</span>}
                  </div>
                </div>
                <button onClick={() => runNow(a)} title="Ejecutar ahora" className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded">
                  <Play size={14} />
                </button>
                <button onClick={() => openLogs(a)} title="Historial" className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded">
                  <History size={14} />
                </button>
                <button onClick={() => openEdit(a)} title="Editar" className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded">
                  <Edit2 size={14} />
                </button>
                <button onClick={() => remove(a)} title="Eliminar" className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Modal editor ────────────────────────────────────────── */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={form.id ? 'Editar automatización' : 'Nueva automatización'} maxWidth="2xl">
        <div className="space-y-5 pt-4 max-h-[70vh] overflow-y-auto pr-2">
          <Grid2>
            <FieldBox label="Nombre">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </FieldBox>
            <FieldBox label="Activada">
              <label className="flex items-center gap-2 h-10">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                <span className="text-sm">Sí, se ejecuta</span>
              </label>
            </FieldBox>
          </Grid2>
          <FieldBox label="Descripción (opcional)">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </FieldBox>

          <SectionTitle>Trigger</SectionTitle>
          <FieldBox label="Cuándo se ejecuta">
            <select value={form.triggerType} onChange={(e) => setForm({ ...form, triggerType: e.target.value })} className="h-10 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3">
              <option value="schedule">Programado (cron)</option>
              <option value="event">Evento del sistema</option>
              <option value="manual">Manual (solo botón)</option>
            </select>
          </FieldBox>
          {form.triggerType === 'schedule' && (
            <FieldBox label="Cron (m h dom mon dow). Ejemplos: '0 9 * * 1' = lunes 9:00; '*/15 * * * *' = cada 15 min">
              <Input value={form.cron} onChange={(e) => setForm({ ...form, cron: e.target.value })} className="font-mono" />
            </FieldBox>
          )}
          {form.triggerType === 'event' && (
            <FieldBox label="Evento">
              <select value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })} className="h-10 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3">
                {EVENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </FieldBox>
          )}

          <SectionTitle>Acción</SectionTitle>
          <FieldBox label="Qué hace">
            <select value={form.actionType} onChange={(e) => setForm({ ...form, actionType: e.target.value })} className="h-10 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3">
              <option value="email">Enviar email</option>
              <option value="webhook">Llamar a webhook (HTTP POST)</option>
              <option value="notification">Notificación interna</option>
            </select>
          </FieldBox>

          {form.actionType === 'email' && (
            <>
              <FieldBox label="Para (acepta {{ path }})">
                <Input value={form.email.to} onChange={(e) => setForm({ ...form, email: { ...form.email, to: e.target.value } })} placeholder="admin@empresa.com ó {{ partner.email }}" />
              </FieldBox>
              <FieldBox label="Asunto">
                <Input value={form.email.subject} onChange={(e) => setForm({ ...form, email: { ...form.email, subject: e.target.value } })} />
              </FieldBox>
              <FieldBox label="Cuerpo">
                <textarea value={form.email.body} onChange={(e) => setForm({ ...form, email: { ...form.email, body: e.target.value } })} rows={6} className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3 py-2 font-mono" />
              </FieldBox>
            </>
          )}

          {form.actionType === 'webhook' && (
            <>
              <Grid2>
                <FieldBox label="URL">
                  <Input value={form.webhook.url} onChange={(e) => setForm({ ...form, webhook: { ...form.webhook, url: e.target.value } })} placeholder="https://..." />
                </FieldBox>
                <FieldBox label="Método">
                  <select value={form.webhook.method} onChange={(e) => setForm({ ...form, webhook: { ...form.webhook, method: e.target.value } })} className="h-10 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3">
                    <option>POST</option><option>PUT</option><option>GET</option>
                  </select>
                </FieldBox>
              </Grid2>
              <FieldBox label="Body (JSON — soporta {{ path }})">
                <textarea value={form.webhook.body} onChange={(e) => setForm({ ...form, webhook: { ...form.webhook, body: e.target.value } })} rows={6} className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3 py-2 font-mono" />
              </FieldBox>
            </>
          )}

          {form.actionType === 'notification' && (
            <>
              <FieldBox label="Destinatarios">
                <select value={form.notification.role} onChange={(e) => setForm({ ...form, notification: { ...form.notification, role: e.target.value } })} className="h-10 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3">
                  <option value="ADMIN">Administradores</option>
                  <option value="USER">Todos los usuarios</option>
                  <option value="SUPERUSER">Superusers</option>
                </select>
              </FieldBox>
              <FieldBox label="Título">
                <Input value={form.notification.title} onChange={(e) => setForm({ ...form, notification: { ...form.notification, title: e.target.value } })} />
              </FieldBox>
              <FieldBox label="Cuerpo">
                <textarea value={form.notification.body} onChange={(e) => setForm({ ...form, notification: { ...form.notification, body: e.target.value } })} rows={4} className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3 py-2" />
              </FieldBox>
            </>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={submitting}>
              {submitting ? <Loader size="sm" variant="white" /> : form.id ? 'Guardar' : 'Crear'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal de logs ──────────────────────────────────────── */}
      <Modal isOpen={!!logsFor} onClose={() => setLogsFor(null)} title={`Historial · ${logsFor?.name || ''}`} maxWidth="2xl">
        <div className="space-y-3 pt-4 max-h-[70vh] overflow-y-auto">
          {loadingLogs ? (
            <div className="py-10 flex justify-center"><Loader /></div>
          ) : logs.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-10">Sin ejecuciones aún.</div>
          ) : (
            <ul>
              {logs.map((r) => (
                <li key={r.id} className="px-3 py-2 border-b border-slate-50 dark:border-slate-800/50 last:border-0 flex items-start gap-3">
                  <Badge variant={r.status === 'ok' ? 'success' : 'error'}>{r.status}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      {fmt.date(r.startedAt)} · {r.durationMs ?? 0}ms · {r.triggerSource}
                    </div>
                    <div className="text-xs text-slate-700 dark:text-slate-200 break-words mt-0.5">
                      {r.status === 'ok' ? r.outputText : r.errorText}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </div>
  );
};

const Grid2: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
);
const FieldBox: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
      {label}
    </label>
    {children}
  </div>
);
const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-1 pt-2">
    {children}
  </div>
);

function tryParseJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export default Automations;
