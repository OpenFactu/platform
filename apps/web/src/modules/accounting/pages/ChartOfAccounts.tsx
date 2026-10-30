import React, { useEffect, useState } from 'react';
import {
  Table,
  Card,
  Button,
  Input,
  PageHeader,
  useToast,
  Badge,
  usePopup,
  Select,
  SearchableSelect,
  Checkbox,
} from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { BookOpen, Plus, Trash2, Pencil, Wand2 } from 'lucide-react';
import { PluginFieldsPanel } from '@/components/PluginFieldsPanel';
import { ExcelTools } from '@/components/common/ExcelTools';
import { chartOfAccountsApi } from '../api';

interface Account {
  id: string;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  parentId: string | null;
  isAnalytical: boolean;
  isActive: boolean;
  notes: string | null;
  [k: string]: any;
}

/** Claves i18n por tipo de cuenta: se traducen al pintar. */
const TYPE_LABELS: Record<string, string> = {
  asset: 'accounting.chart.types.asset',
  liability: 'accounting.chart.types.liability',
  equity: 'accounting.chart.types.equity',
  income: 'accounting.chart.types.income',
  expense: 'accounting.chart.types.expense',
};
const TYPE_VARIANTS: Record<string, any> = {
  asset: 'success',
  liability: 'warning',
  equity: 'neutral',
  income: 'info',
  expense: 'error',
};

export const ChartOfAccounts: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const canWrite =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.write;
  const canDelete =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.delete;

  const [rows, setRows] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<Partial<Account>>({});
  const [pluginValues, setPluginValues] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  const popup = usePopup();

  // Las opciones del desplegable salen de TYPE_LABELS para no repetir la lista.
  const typeOptions = Object.entries(TYPE_LABELS).map(([value, label]) => ({
    value,
    label: t(label),
  }));

  const fetchRows = async () => {
    setLoading(true);
    try {
      const data = await chartOfAccountsApi.list();
      setRows((Array.isArray(data) ? data : []) as unknown as Account[]);
    } catch {
      toast.error(t('accounting.chart.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) fetchRows();
  }, [user?.tenantId]);

  const openCreate = () => {
    setEditing(null);
    setForm({ type: 'asset', isAnalytical: false, isActive: true });
    setPluginValues({});
  };
  const openEdit = (r: Account) => {
    setEditing(r);
    setForm(r);
    setPluginValues(r);
  };
  const closeForm = () => {
    setEditing(null);
    setForm({});
    setPluginValues({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code || !form.name || !form.type) {
      toast.error(t('accounting.chart.requiredFields'));
      return;
    }
    setSubmitting(true);
    const payload = { ...form, ...pluginValues };
    try {
      if (editing) await chartOfAccountsApi.update(editing.id, payload);
      else await chartOfAccountsApi.create(payload);
      toast.success(editing ? t('accounting.chart.updated') : t('accounting.chart.created'));
      closeForm();
      fetchRows();
    } catch (err) {
      toast.error((err instanceof Error && err.message) || t('accounting.common.errorSaving'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await popup.confirm({
      title: t('accounting.chart.deleteTitle'),
      message: t('accounting.common.irreversible'),
      tone: 'danger',
      confirmLabel: t('accounting.common.delete'),
    });
    if (!ok) return;
    try {
      await chartOfAccountsApi.remove(id);
      toast.success(t('accounting.chart.deleted'));
      fetchRows();
    } catch (err) {
      toast.error((err instanceof Error && err.message) || t('accounting.common.errorDeleting'));
    }
  };

  const columns = [
    {
      header: t('accounting.common.code'),
      accessor: 'code',
      sortable: true,
      sortAccessor: (r: any) => r.code,
      primary: true,
    },
    {
      header: t('accounting.common.name'),
      accessor: 'name',
      sortable: true,
      sortAccessor: (r: any) => r.name,
    },
    {
      header: t('accounting.common.type'),
      cell: (r: any) => (
        <Badge variant={TYPE_VARIANTS[r.type] || 'default'}>
          {TYPE_LABELS[r.type] ? t(TYPE_LABELS[r.type]) : r.type}
        </Badge>
      ),
    },
    {
      header: t('accounting.chart.analytical'),
      cell: (r: any) =>
        r.isAnalytical ? (
          <Badge variant="info">{t('accounting.common.yes')}</Badge>
        ) : (
          <Badge variant="neutral">{t('accounting.common.no')}</Badge>
        ),
    },
    {
      header: t('accounting.common.status'),
      cell: (r: any) =>
        r.isActive ? (
          <Badge variant="success">{t('accounting.chart.active')}</Badge>
        ) : (
          <Badge variant="neutral">{t('accounting.chart.inactive')}</Badge>
        ),
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que los permisos se declaran
  // una vez en lugar de duplicarse.
  const rowActions = (r: Account): RowAction[] => [
    {
      label: t('accounting.common.edit'),
      icon: <Pencil size={14} />,
      disabled: !canWrite,
      onClick: () => openEdit(r),
    },
    {
      label: t('accounting.common.delete'),
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => handleDelete(r.id),
    },
  ];

  const formOpen = editing !== null || Object.keys(form).length > 0;

  return (
    <div className="p-8 w-full space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title={t('accounting.chart.title')}
        subtitle={t('accounting.chart.subtitle')}
        icon={<BookOpen size={18} />}
        size="lg"
        actions={
          canWrite && (
            <div className="flex items-center gap-2 flex-shrink-0 whitespace-nowrap">
              {rows.length === 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    const ok = await popup.confirm({
                      title: t('accounting.chart.seed.title'),
                      message: t('accounting.chart.seed.message'),
                      confirmLabel: t('accounting.chart.seed.confirm'),
                    });
                    if (!ok) return;
                    let d;
                    try {
                      d = await chartOfAccountsApi.seed();
                    } catch (err) {
                      toast.error(
                        (err instanceof Error && err.message) || t('accounting.chart.seed.error'),
                      );
                      return;
                    }
                    toast.success(
                      t('accounting.chart.seed.done', {
                        accounts: d.accountsCreated,
                        mappings: d.mappingsCreated,
                      }),
                    );
                    fetchRows();
                  }}
                  className="flex items-center gap-2 whitespace-nowrap"
                  title={t('accounting.chart.seed.tooltip')}
                >
                  <Wand2 size={16} />
                  {t('accounting.chart.seed.button')}
                </Button>
              )}
              <ExcelTools
                data={rows}
                filename="plan-contable"
                columns={[
                  { key: 'code', label: t('accounting.common.code'), required: true },
                  { key: 'name', label: t('accounting.common.name'), required: true },
                  { key: 'type', label: t('accounting.common.type') },
                  { key: 'notes', label: t('accounting.common.notes') },
                ]}
                onImport={async (parsed) => {
                  await chartOfAccountsApi.bulkImport(parsed);
                  fetchRows();
                }}
              />
              <Button
                type="button"
                onClick={openCreate}
                className="flex items-center gap-2 whitespace-nowrap"
              >
                <Plus size={16} />
                {t('accounting.chart.new')}
              </Button>
            </div>
          )
        }
      />

      {formOpen && (
        <Card className="border-border-subtle shadow-lg" noPadding>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label={t('accounting.common.code')}
                placeholder="4300000"
                value={form.code || ''}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                required
              />
              <Input
                label={t('accounting.common.name')}
                placeholder={t('accounting.chart.namePlaceholder')}
                value={form.name || ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <Select
                label={t('accounting.common.type')}
                options={typeOptions}
                value={form.type || 'asset'}
                onChange={(v) => setForm({ ...form, type: v as Account['type'] })}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-fg-body mb-1">
                  {t('accounting.chart.parent')}
                </label>
                {/* SearchableSelect y no Select: el plan contable puede tener
                    cientos de cuentas y sin buscador es inmanejable. */}
                <SearchableSelect
                  options={rows
                    .filter((r) => r.id !== editing?.id)
                    .map((r) => ({ value: r.id, label: `${r.code} — ${r.name}` }))}
                  value={form.parentId || ''}
                  onChange={(v) => setForm({ ...form, parentId: v || null })}
                  placeholder={t('accounting.chart.noParent')}
                  clearable
                />
              </div>
              <Input
                label={t('accounting.common.notes')}
                placeholder={t('accounting.chart.notesPlaceholder')}
                value={form.notes || ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            {/* Checkbox y no Switch: son campos del formulario, no se persisten
                hasta pulsar Guardar. El <label> se queda porque Checkbox no
                tiene prop `label` — renderiza solo el input. */}
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={!!form.isAnalytical}
                  onChange={(checked) => setForm({ ...form, isAnalytical: checked })}
                />
                {t('accounting.chart.analyticalCheckbox')}
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={form.isActive !== false}
                  onChange={(checked) => setForm({ ...form, isActive: checked })}
                />
                {t('accounting.chart.active')}
              </label>
            </div>

            <PluginFieldsPanel
              tableName="ChartOfAccount"
              values={pluginValues}
              onChange={(k, v) => setPluginValues((prev) => ({ ...prev, [k]: v }))}
              layout="inline"
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={closeForm}>
                {t('accounting.common.cancel')}
              </Button>
              <Button type="submit" disabled={submitting}>
                {editing ? t('accounting.common.saveChanges') : t('accounting.chart.create')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden border-border-subtle" noPadding>
        <Table
          className="max-md:p-3"
          columns={columns}
          data={rows}
          isLoading={loading}
          rowActions={rowActions}
          onRowClick={(r: any) => openEdit(r)}
        />
      </Card>
    </div>
  );
};

export default ChartOfAccounts;
