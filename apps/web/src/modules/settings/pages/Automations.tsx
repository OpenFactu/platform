import { coreApi } from '@/shared/api';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Button,
  Input,
  Textarea,
  Checkbox,
  Select,
  EmptyState,
  Modal,
  Loader,
  Badge,
  PageHeader,
  useToast,
  usePopup,
} from '@openfactu/ui';
import { Plus, Trash2, Play, Zap, History, Edit2, Pause, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';

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
  { value: 'salesInvoice.afterCreate', label: 'settings.automations.events.salesInvoiceCreated' },
  { value: 'salesInvoice.afterPost', label: 'settings.automations.events.salesInvoicePosted' },
  {
    value: 'purchaseInvoice.afterCreate',
    label: 'settings.automations.events.purchaseInvoiceCreated',
  },
  {
    value: 'purchaseInvoice.afterPost',
    label: 'settings.automations.events.purchaseInvoicePosted',
  },
  { value: 'salesOrder.afterCreate', label: 'settings.automations.events.salesOrderCreated' },
  {
    value: 'salesDeliveryNote.afterCreate',
    label: 'settings.automations.events.salesDeliveryNoteCreated',
  },
  { value: 'purchaseOrder.afterCreate', label: 'settings.automations.events.purchaseOrderCreated' },
  {
    value: 'purchaseDeliveryNote.afterCreate',
    label: 'settings.automations.events.purchaseDeliveryNoteCreated',
  },
  { value: 'partner.afterCreate', label: 'settings.automations.events.partnerCreated' },
  { value: 'item.afterCreate', label: 'settings.automations.events.itemCreated' },
  { value: 'crm.opportunity.created', label: 'settings.automations.events.crmOpportunityCreated' },
  {
    value: 'crm.opportunity.stageChanged',
    label: 'settings.automations.events.crmOpportunityStageChanged',
  },
  { value: 'crm.opportunity.won', label: 'settings.automations.events.crmOpportunityWon' },
  { value: 'crm.opportunity.lost', label: 'settings.automations.events.crmOpportunityLost' },
  { value: 'crm.activity.created', label: 'settings.automations.events.crmActivityCreated' },
  { value: 'crm.form.submitted', label: 'settings.automations.events.crmFormSubmitted' },
];

const TRIGGER_TYPE_OPTIONS = [
  { value: 'schedule', label: 'settings.automations.triggers.schedule' },
  { value: 'event', label: 'settings.automations.triggers.event' },
  { value: 'manual', label: 'settings.automations.triggers.manual' },
];

const ACTION_TYPE_OPTIONS = [
  { value: 'email', label: 'settings.automations.actions.email' },
  { value: 'webhook', label: 'settings.automations.actions.webhook' },
  { value: 'notification', label: 'settings.automations.actions.notification' },
];

const HTTP_METHOD_OPTIONS = ['POST', 'PUT', 'GET'].map((m) => ({ value: m, label: m }));

const NOTIFY_ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'settings.automations.roles.admin' },
  { value: 'USER', label: 'settings.automations.roles.user' },
  { value: 'SUPERUSER', label: 'settings.automations.roles.superuser' },
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
  const { t } = useI18n();
  const tr = (opts: { value: string; label: string }[]) =>
    opts.map((o) => ({ ...o, label: t(o.label) }));
  const popup = usePopup();
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
      const r = await coreApi.raw('GET', '/api/automations');
      const d = r.data;
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
      toast.error(t('settings.automations.nameRequired'));
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
      const res = await coreApi.raw(method, url, body);
      const data = res.data;
      if (!res.ok) {
        toast.error(data?.error || t('settings.automations.saveError'));
        return;
      }
      toast.success(
        form.id ? t('settings.automations.updated') : t('settings.automations.created'),
      );
      setShowModal(false);
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEnabled = async (a: Automation) => {
    await coreApi.raw('PATCH', `/api/automations/${a.id}`, { enabled: !a.enabled });
    load();
  };

  const remove = async (a: Automation) => {
    const ok = await popup.confirm({
      title: t('settings.automations.deleteTitle'),
      message: t('settings.automations.deleteMessage', { name: a.name }),
      tone: 'danger',
      confirmLabel: t('settings.automations.delete'),
    });
    if (!ok) return;
    await coreApi.raw('DELETE', `/api/automations/${a.id}`);
    load();
  };

  const runNow = async (a: Automation) => {
    const res = await coreApi.raw('POST', `/api/automations/${a.id}/run`, { context: {} });
    const data = res.data;
    if (data.status === 'ok') toast.success(data.output || 'OK');
    else toast.error(data.error || t('settings.automations.failed'));
  };

  const openLogs = async (a: Automation) => {
    setLogsFor(a);
    setLoadingLogs(true);
    const r = await coreApi.raw('GET', `/api/automations/${a.id}/runs`);
    const d = r.data;
    setLogs(Array.isArray(d) ? d : []);
    setLoadingLogs(false);
  };

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <PageHeader
        title={t('settings.automations.title')}
        subtitle={t('settings.automations.subtitle')}
        icon={<Zap size={18} />}
        size="sm"
        divider
        actions={
          <Button type="button" onClick={openCreate} className="flex items-center gap-2">
            <Plus size={14} /> {t('settings.automations.new')}
          </Button>
        }
      />

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader />
        </div>
      ) : rows.length === 0 ? (
        <Card bodyClassName="p-0">
          <EmptyState
            icon={<Zap size={18} />}
            title={t('settings.automations.emptyTitle')}
            hint={t('settings.automations.emptyHint')}
            action={
              <Button onClick={openCreate} className="flex items-center gap-2">
                <Plus size={14} /> {t('settings.automations.new')}
              </Button>
            }
          />
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {rows.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle last:border-0"
              >
                {/* Acción inmediata (PATCH al pulsar), de ahí que sea un Button
                    con icono de estado y no un Checkbox del formulario. */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleEnabled(a)}
                  title={
                    a.enabled ? t('settings.automations.disable') : t('settings.automations.enable')
                  }
                  className={a.enabled ? 'text-emerald-500' : undefined}
                >
                  {a.enabled ? <CheckCircle2 size={16} /> : <Pause size={16} />}
                </Button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-fg-default">{a.name}</span>
                    <Badge variant="neutral">{a.triggerType}</Badge>
                    <Badge variant="info">{a.actionType}</Badge>
                    {!a.enabled && (
                      <Badge variant="warning">{t('settings.automations.inactive')}</Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-fg-muted mt-0.5 font-mono truncate">
                    {a.triggerType === 'schedule' && `cron: ${a.triggerConfig?.cron || ''}`}
                    {a.triggerType === 'event' && `event: ${a.triggerConfig?.event || ''}`}
                    {a.triggerType === 'manual' && t('settings.automations.manualRun')}
                    {a.description && (
                      <span className="ml-2 italic text-slate-400">— {a.description}</span>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => runNow(a)}
                  title={t('settings.automations.runNow')}
                >
                  <Play size={14} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => openLogs(a)}
                  title={t('settings.automations.history')}
                >
                  <History size={14} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => openEdit(a)}
                  title={t('settings.automations.edit')}
                >
                  <Edit2 size={14} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(a)}
                  title={t('settings.automations.delete')}
                >
                  <Trash2 size={14} />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Modal editor ────────────────────────────────────────── */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={form.id ? t('settings.automations.editTitle') : t('settings.automations.newTitle')}
        maxWidth="2xl"
      >
        <div className="space-y-5 pt-4 max-h-[70vh] overflow-y-auto pr-2">
          <Grid2>
            <FieldBox label={t('settings.automations.name')}>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </FieldBox>
            <FieldBox label={t('settings.automations.enabled')}>
              {/* Checkbox y no Switch: se persiste con «Crear»/«Guardar». El
                  toggle inmediato es el botón del listado. */}
              <label className="flex items-center gap-2 h-10 cursor-pointer">
                <Checkbox
                  checked={form.enabled}
                  onChange={(v) => setForm({ ...form, enabled: v })}
                />
                <span className="text-sm">{t('settings.automations.enabledYes')}</span>
              </label>
            </FieldBox>
          </Grid2>
          <FieldBox label={t('settings.automations.description')}>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </FieldBox>

          <SectionTitle>{t('settings.automations.triggerSection')}</SectionTitle>
          <FieldBox label={t('settings.automations.when')}>
            <Select
              ariaLabel={t('settings.automations.when')}
              options={tr(TRIGGER_TYPE_OPTIONS)}
              value={form.triggerType}
              onChange={(v) => setForm({ ...form, triggerType: v })}
            />
          </FieldBox>
          {form.triggerType === 'schedule' && (
            <FieldBox label={t('settings.automations.cronLabel')}>
              <Input
                value={form.cron}
                onChange={(e) => setForm({ ...form, cron: e.target.value })}
                className="font-mono"
              />
            </FieldBox>
          )}
          {form.triggerType === 'event' && (
            <FieldBox label={t('settings.automations.event')}>
              {/* Opciones derivadas de EVENT_OPTIONS (10 entradas, estáticas). */}
              <Select
                ariaLabel={t('settings.automations.event')}
                options={tr(EVENT_OPTIONS)}
                value={form.event}
                onChange={(v) => setForm({ ...form, event: v })}
              />
            </FieldBox>
          )}

          <SectionTitle>{t('settings.automations.actionSection')}</SectionTitle>
          <FieldBox label={t('settings.automations.what')}>
            <Select
              ariaLabel={t('settings.automations.what')}
              options={tr(ACTION_TYPE_OPTIONS)}
              value={form.actionType}
              onChange={(v) => setForm({ ...form, actionType: v })}
            />
          </FieldBox>

          {form.actionType === 'email' && (
            <>
              <FieldBox label={t('settings.automations.emailTo')}>
                <Input
                  value={form.email.to}
                  onChange={(e) =>
                    setForm({ ...form, email: { ...form.email, to: e.target.value } })
                  }
                  placeholder={t('settings.automations.emailToPlaceholder')}
                />
              </FieldBox>
              <FieldBox label={t('settings.automations.subject')}>
                <Input
                  value={form.email.subject}
                  onChange={(e) =>
                    setForm({ ...form, email: { ...form.email, subject: e.target.value } })
                  }
                />
              </FieldBox>
              <FieldBox label={t('settings.automations.body')}>
                <Textarea
                  value={form.email.body}
                  onChange={(e) =>
                    setForm({ ...form, email: { ...form.email, body: e.target.value } })
                  }
                  rows={6}
                  className="font-mono"
                />
              </FieldBox>
            </>
          )}

          {form.actionType === 'webhook' && (
            <>
              <Grid2>
                <FieldBox label="URL">
                  <Input
                    value={form.webhook.url}
                    onChange={(e) =>
                      setForm({ ...form, webhook: { ...form.webhook, url: e.target.value } })
                    }
                    placeholder="https://..."
                  />
                </FieldBox>
                <FieldBox label={t('settings.automations.method')}>
                  <Select
                    ariaLabel={t('settings.automations.httpMethod')}
                    options={HTTP_METHOD_OPTIONS}
                    value={form.webhook.method}
                    onChange={(v) => setForm({ ...form, webhook: { ...form.webhook, method: v } })}
                  />
                </FieldBox>
              </Grid2>
              <FieldBox label={t('settings.automations.webhookBody')}>
                <Textarea
                  value={form.webhook.body}
                  onChange={(e) =>
                    setForm({ ...form, webhook: { ...form.webhook, body: e.target.value } })
                  }
                  rows={6}
                  className="font-mono"
                />
              </FieldBox>
            </>
          )}

          {form.actionType === 'notification' && (
            <>
              <FieldBox label={t('settings.automations.recipients')}>
                <Select
                  ariaLabel={t('settings.automations.recipients')}
                  options={tr(NOTIFY_ROLE_OPTIONS)}
                  value={form.notification.role}
                  onChange={(v) =>
                    setForm({ ...form, notification: { ...form.notification, role: v } })
                  }
                />
              </FieldBox>
              <FieldBox label={t('settings.automations.notificationTitle')}>
                <Input
                  value={form.notification.title}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notification: { ...form.notification, title: e.target.value },
                    })
                  }
                />
              </FieldBox>
              <FieldBox label={t('settings.automations.body')}>
                <Textarea
                  value={form.notification.body}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notification: { ...form.notification, body: e.target.value },
                    })
                  }
                  rows={4}
                />
              </FieldBox>
            </>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              {t('settings.automations.cancel')}
            </Button>
            <Button onClick={save} disabled={submitting}>
              {submitting ? (
                <Loader size="sm" variant="white" />
              ) : form.id ? (
                t('settings.automations.save')
              ) : (
                t('settings.automations.create')
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal de logs ──────────────────────────────────────── */}
      <Modal
        isOpen={!!logsFor}
        onClose={() => setLogsFor(null)}
        title={t('settings.automations.historyTitle', { name: logsFor?.name || '' })}
        maxWidth="2xl"
      >
        <div className="space-y-3 pt-4 max-h-[70vh] overflow-y-auto">
          {loadingLogs ? (
            <div className="py-10 flex justify-center">
              <Loader />
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              icon={<History size={18} />}
              title={t('settings.automations.noRuns')}
              hint={t('settings.automations.noRunsHint')}
            />
          ) : (
            <ul>
              {logs.map((r) => (
                <li
                  key={r.id}
                  className="px-3 py-2 border-b border-border-subtle last:border-0 flex items-start gap-3"
                >
                  <Badge variant={r.status === 'ok' ? 'success' : 'error'}>{r.status}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-fg-muted font-mono">
                      {fmt.date(r.startedAt)} · {r.durationMs ?? 0}ms · {r.triggerSource}
                    </div>
                    <div className="text-xs text-fg-body break-words mt-0.5">
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
  <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle border-b border-border-subtle pb-1 pt-2">
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
