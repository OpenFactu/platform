import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Input,
  Loader,
  PageHeader,
  useToast,
  usePopup,
  Modal,
  Badge,
  Select,
  SearchableSelect,
  NumberInput,
  EmptyState,
} from '@openfactu/ui';
import { LayoutGrid, Plus, Trash2, Edit2, Code2, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { WidgetCodeEditorModal } from '@/components/dashboard/WidgetCodeEditorModal';

const PLUGIN_SNIPPET = `// plugins/<mi-plugin>/index.ts
export const init = async ({ widgets }: PluginContext) => {
  widgets.registerDashboard({
    id: 'mi-widget',
    title: 'Mi Widget',
    component: 'ui/MyComponent.tsx', // componente React propio del plugin
    size: 'md',   // sm | md | lg | full
    order: 100,
  });
};`;

interface MetricOption {
  key: string;
  label: string;
}

const WIDGET_SIZE_OPTIONS = [
  { value: 'sm', label: 'settings.dashboardWidgets.sizes.sm' },
  { value: 'md', label: 'settings.dashboardWidgets.sizes.md' },
  { value: 'lg', label: 'settings.dashboardWidgets.sizes.lg' },
  { value: 'full', label: 'settings.dashboardWidgets.sizes.full' },
];

interface WidgetRow {
  id: string;
  title: string;
  subtitle: string | null;
  kind: 'metric' | 'code' | 'query';
  metricKey: string | null;
  metricLabel: string | null;
  size: 'sm' | 'md' | 'lg' | 'full';
  displayOrder: number;
  value: number | null;
}

const defaultForm = () => ({
  title: '',
  subtitle: '',
  kind: 'metric' as 'metric' | 'code' | 'query',
  metricKey: '',
  sourceCode: '',
  size: 'md' as 'sm' | 'md' | 'lg' | 'full',
  displayOrder: 100,
});

export const DashboardWidgets: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const { t } = useI18n();
  const popup = usePopup();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<WidgetRow[]>([]);
  const [metrics, setMetrics] = useState<MetricOption[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [showPluginWay, setShowPluginWay] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm());
  const [submitting, setSubmitting] = useState(false);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
  };

  const load = async () => {
    setLoading(true);
    try {
      const [wRes, mRes] = await Promise.all([
        coreApi.raw('GET', '/api/dashboard-widgets'),
        coreApi.raw('GET', '/api/dashboard-widgets/metrics'),
      ]);
      const w = wRes.data;
      const m = mRes.data;
      setRows(Array.isArray(w) ? w : []);
      setMetrics(Array.isArray(m) ? m : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...defaultForm(), metricKey: metrics[0]?.key || '' });
    setShowModal(true);
  };

  const openEdit = async (r: WidgetRow) => {
    setEditingId(r.id);
    let sourceCode = '';
    if (r.kind === 'code') {
      try {
        const res = await coreApi.raw('GET', `/api/dashboard-widgets/${r.id}`);
        const full = res.data;
        sourceCode = full?.sourceCode || '';
      } catch {
        /* se abre igual, con el editor vacío */
      }
    }
    setForm({
      title: r.title,
      subtitle: r.subtitle || '',
      kind: r.kind,
      metricKey: r.metricKey || '',
      sourceCode,
      size: r.size,
      displayOrder: r.displayOrder,
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error(t('settings.dashboardWidgets.titleRequired'));
      return;
    }
    if (form.kind === 'metric' && !form.metricKey) {
      toast.error(t('settings.dashboardWidgets.metricRequired'));
      return;
    }
    if (form.kind === 'code' && !form.sourceCode.trim()) {
      toast.error(t('settings.dashboardWidgets.codeRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const url = editingId ? `/api/dashboard-widgets/${editingId}` : '/api/dashboard-widgets';
      // Los widgets 'query' se crean desde el chat de IA — desde aquí solo se
      // edita título/subtítulo/tamaño/orden, sin tocar `kind` ni `queryConfig`.
      const body =
        form.kind === 'query'
          ? {
              title: form.title,
              subtitle: form.subtitle,
              size: form.size,
              displayOrder: form.displayOrder,
            }
          : form;
      const res = await coreApi.raw(editingId ? 'PATCH' : 'POST', url, body);
      const data = res.data;
      if (!res.ok) {
        toast.error(data?.error || t('settings.dashboardWidgets.saveError'));
        return;
      }
      toast.success(
        editingId ? t('settings.dashboardWidgets.updated') : t('settings.dashboardWidgets.created'),
      );
      setShowModal(false);
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (row: WidgetRow) => {
    const ok = await popup.confirm({
      title: t('settings.dashboardWidgets.deleteTitle'),
      message: t('settings.dashboardWidgets.deleteMessage', { title: row.title }),
      tone: 'danger',
      confirmLabel: t('settings.dashboardWidgets.delete'),
    });
    if (!ok) return;
    const res = await coreApi.raw('DELETE', `/api/dashboard-widgets/${row.id}`);
    if (!res.ok) {
      const err = res.data ?? {};
      toast.error(err.error || t('settings.dashboardWidgets.deleteError'));
      return;
    }
    toast.success(t('settings.dashboardWidgets.deleted'));
    load();
  };

  return (
    <div className="p-4 space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title={t('settings.dashboardWidgets.title')}
        subtitle={t('settings.dashboardWidgets.subtitle')}
        icon={<LayoutGrid size={18} />}
        size="sm"
        divider
        actions={
          <Button type="button" onClick={openCreate} className="flex items-center gap-2">
            <Plus size={14} /> {t('settings.dashboardWidgets.newWidget')}
          </Button>
        }
      />

      <Card bodyClassName="p-0">
        <button
          onClick={() => setShowPluginWay((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-fg-body">
            <Code2 size={15} className="text-fg-subtle" />
            {t('settings.dashboardWidgets.advanced')}
          </span>
          {showPluginWay ? (
            <ChevronUp size={16} className="text-slate-400" />
          ) : (
            <ChevronDown size={16} className="text-slate-400" />
          )}
        </button>
        {showPluginWay && (
          <div className="px-4 pb-4 space-y-2">
            <p className="text-xs text-fg-muted">
              {t('settings.dashboardWidgets.pluginHelpBefore')}
              <code>init()</code>
              {t('settings.dashboardWidgets.pluginHelpMiddle')}
              <code>plugins/&lt;mi-plugin&gt;/index.ts</code>):
            </p>
            <pre className="bg-slate-900 text-slate-100 text-[11px] leading-relaxed rounded-lg p-3 overflow-x-auto font-mono">
              <code>{PLUGIN_SNIPPET}</code>
            </pre>
          </div>
        )}
      </Card>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader />
        </div>
      ) : rows.length === 0 ? (
        <Card bodyClassName="p-0">
          <EmptyState
            icon={<LayoutGrid size={18} />}
            title={t('settings.dashboardWidgets.emptyTitle')}
            hint={t('settings.dashboardWidgets.emptyHint')}
            action={
              <Button onClick={openCreate} className="flex items-center gap-2">
                <Plus size={14} /> {t('settings.dashboardWidgets.newWidget')}
              </Button>
            }
          />
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 px-4 py-2 border-b border-border-subtle last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-fg-default">{r.title}</span>
                    {r.kind === 'code' ? (
                      <Badge variant="info">{t('settings.dashboardWidgets.kindCode')}</Badge>
                    ) : r.kind === 'query' ? (
                      <Badge variant="info">{t('settings.dashboardWidgets.kindQuery')}</Badge>
                    ) : (
                      <Badge variant="info">{r.metricLabel}</Badge>
                    )}
                    <Badge variant="neutral">{r.size}</Badge>
                  </div>
                  {r.subtitle && (
                    <div className="text-[11px] text-fg-muted truncate">{r.subtitle}</div>
                  )}
                </div>
                {r.kind === 'metric' && (
                  <span className="font-black tabular-nums text-fg-body text-sm">
                    {r.value ?? '—'}
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => openEdit(r)}
                  title={t('settings.dashboardWidgets.edit')}
                >
                  <Edit2 size={13} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(r)}
                  title={t('settings.dashboardWidgets.delete')}
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
        title={
          editingId
            ? t('settings.dashboardWidgets.editTitle')
            : t('settings.dashboardWidgets.newWidget')
        }
        subtitle={t('settings.dashboardWidgets.modalSubtitle')}
        maxWidth="md"
      >
        <div className="space-y-4 pt-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              {t('settings.dashboardWidgets.kindLabel')}
            </label>
            {form.kind === 'query' ? (
              <p className="text-xs text-fg-muted italic">
                {t('settings.dashboardWidgets.queryHelp')}
              </p>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={form.kind === 'metric' ? 'primary' : 'outline'}
                  onClick={() => setForm({ ...form, kind: 'metric' })}
                >
                  {t('settings.dashboardWidgets.kindMetric')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={form.kind === 'code' ? 'primary' : 'outline'}
                  onClick={() => setForm({ ...form, kind: 'code' })}
                >
                  {t('settings.dashboardWidgets.kindCode')}
                </Button>
              </div>
            )}
          </div>
          <Input
            label={t('settings.dashboardWidgets.titleLabel')}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={t('settings.dashboardWidgets.titlePlaceholder')}
          />
          <Input
            label={t('settings.dashboardWidgets.subtitleLabel')}
            value={form.subtitle}
            onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
          />
          {form.kind === 'metric' ? (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                {t('settings.dashboardWidgets.kindMetric')}
              </label>
              <SearchableSelect
                value={form.metricKey}
                onChange={(value) => setForm({ ...form, metricKey: value })}
                placeholder={t('settings.dashboardWidgets.metricPlaceholder')}
                options={metrics.map((m) => ({ value: m.key, label: m.label }))}
              />
            </div>
          ) : form.kind === 'code' ? (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                {t('settings.dashboardWidgets.component')}
              </label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowCodeEditor(true)}
                  className="flex items-center gap-2"
                >
                  <Code2 size={13} /> {t('settings.dashboardWidgets.editCode')}
                </Button>
                <span className="text-xs text-fg-subtle">
                  {form.sourceCode.trim()
                    ? t('settings.dashboardWidgets.codeSaved')
                    : t('settings.dashboardWidgets.noCode')}
                </span>
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 4 opciones fijas: Select, no SearchableSelect. */}
            <Select
              label={t('settings.dashboardWidgets.size')}
              value={form.size}
              onChange={(value) => setForm({ ...form, size: value as typeof form.size })}
              options={WIDGET_SIZE_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
            />
            <NumberInput
              label={t('settings.dashboardWidgets.order')}
              value={form.displayOrder}
              onChange={(v) => setForm({ ...form, displayOrder: v ?? 0 })}
              emptyValue="zero"
              thousandSeparator={false}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              {t('settings.dashboardWidgets.cancel')}
            </Button>
            <Button onClick={save} disabled={submitting}>
              {submitting ? (
                <Loader size="sm" variant="white" />
              ) : editingId ? (
                t('settings.dashboardWidgets.saveChanges')
              ) : (
                t('settings.dashboardWidgets.createWidget')
              )}
            </Button>
          </div>
        </div>
      </Modal>

      <WidgetCodeEditorModal
        open={showCodeEditor}
        initialCode={form.sourceCode || null}
        token={token}
        onClose={() => setShowCodeEditor(false)}
        onSave={(code) => setForm({ ...form, sourceCode: code })}
      />
    </div>
  );
};

export default DashboardWidgets;
