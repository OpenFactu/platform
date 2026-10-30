import React, { useEffect, useMemo, useState } from 'react';
import {
  Table,
  Card,
  Button,
  Input,
  DatePicker,
  PageHeader,
  useToast,
  Badge,
  usePopup,
  Select,
  SearchableSelect,
  CurrencyInput,
} from '@openfactu/ui';
import type { RowAction, TableColumn } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { formatDate } from '@/i18n/format';
import { ScrollText, Plus, Trash2, Pencil, CheckCircle, Undo2 } from 'lucide-react';
import { PluginFieldsPanel } from '@/components/PluginFieldsPanel';
import { journalEntriesApi, chartOfAccountsApi, periodsApi } from '../api';

interface Line {
  id?: string;
  accountId: string;
  // number puro: antes admitían string porque venían de e.target.value de un
  // <input type="number">; con CurrencyInput el valor ya llega numérico.
  debit: number;
  credit: number;
  description?: string;
  partnerId?: string | null;
  costCenterId?: string | null;
  profitCenterId?: string | null;
  internalOrderId?: string | null;
}

interface Entry {
  id: string;
  number: number;
  date: string;
  periodId: string;
  description: string | null;
  source: string;
  status: 'draft' | 'posted' | 'reversed';
  reversedById: string | null;
  lines?: Line[];
}

/** Claves i18n del origen del asiento: se traducen al pintar. */
const SOURCE_LABELS: Record<string, string> = {
  manual: 'accounting.journal.sources.manual',
  sales_invoice: 'accounting.journal.sources.salesInvoice',
  purchase_invoice: 'accounting.journal.sources.purchaseInvoice',
  payment: 'accounting.journal.sources.payment',
  payroll: 'accounting.journal.sources.payroll',
  period_close: 'accounting.journal.sources.periodClose',
  period_open: 'accounting.journal.sources.periodOpen',
  reversal: 'accounting.journal.sources.reversal',
};

const STATUS_VARIANT: Record<string, any> = {
  draft: 'neutral',
  posted: 'success',
  reversed: 'warning',
};
const STATUS_LABEL: Record<string, string> = {
  draft: 'accounting.journal.statuses.draft',
  posted: 'accounting.journal.statuses.posted',
  reversed: 'accounting.journal.statuses.reversed',
};

export const JournalEntries: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const canWrite =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.write;

  const [rows, setRows] = useState<Entry[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [header, setHeader] = useState<Partial<Entry>>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [pluginValues, setPluginValues] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  const popup = usePopup();

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        journalEntriesApi.list(),
        chartOfAccountsApi.list(),
        periodsApi.list(),
      ]);
      setRows((Array.isArray(r1) ? r1 : []) as unknown as Entry[]);
      setAccounts(Array.isArray(r2) ? r2 : []);
      setPeriods(Array.isArray(r3) ? r3 : []);
    } catch {
      toast.error(t('accounting.journal.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) fetchAll();
  }, [user?.tenantId]);

  const openCreate = () => {
    setEditing(null);
    const today = new Date().toISOString().substring(0, 10);
    const openPeriod = periods.find((p) => p.status === 'O');
    setHeader({ date: today, periodId: openPeriod?.id || '', description: '', source: 'manual' });
    setLines([
      { accountId: '', debit: 0, credit: 0 },
      { accountId: '', debit: 0, credit: 0 },
    ]);
    setPluginValues({});
  };

  const openEdit = async (r: Entry) => {
    const full: any = await journalEntriesApi.get(r.id);
    setEditing(full);
    setHeader({
      date: full.date?.substring(0, 10),
      periodId: full.periodId,
      description: full.description || '',
      source: full.source,
    });
    setLines(
      (full.lines || []).map((l: any) => ({
        id: l.id,
        accountId: l.accountId,
        debit: Number(l.debit),
        credit: Number(l.credit),
        description: l.description,
        partnerId: l.partnerId,
        costCenterId: l.costCenterId,
        profitCenterId: l.profitCenterId,
        internalOrderId: l.internalOrderId,
      })),
    );
    setPluginValues(full);
  };

  const closeForm = () => {
    setEditing(null);
    setHeader({});
    setLines([]);
    setPluginValues({});
  };

  const addLine = () => setLines([...lines, { accountId: '', debit: 0, credit: 0 }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  // Una vez por render en lugar de una vez por línea del asiento.
  const accountOptions = useMemo(
    () => accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
    [accounts],
  );

  const totalDebit = useMemo(() => lines.reduce((s, l) => s + Number(l.debit || 0), 0), [lines]);
  const totalCredit = useMemo(() => lines.reduce((s, l) => s + Number(l.credit || 0), 0), [lines]);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!header.periodId) {
      toast.error(t('accounting.journal.periodRequired'));
      return;
    }
    if (lines.length < 2) {
      toast.error(t('accounting.journal.minLines'));
      return;
    }
    // Antes lo cubría el `required` del <select> nativo de la línea. SearchableSelect
    // no tiene equivalente, así que el aviso se da aquí: sin esto el asiento se
    // enviaría con líneas sin cuenta.
    const sinCuenta = lines.findIndex((l) => !l.accountId);
    if (sinCuenta !== -1) {
      toast.error(t('accounting.journal.lineWithoutAccount', { line: sinCuenta + 1 }));
      return;
    }
    if (!balanced) {
      toast.error(
        t('accounting.journal.unbalanced', {
          debit: totalDebit.toFixed(2),
          credit: totalCredit.toFixed(2),
        }),
      );
      return;
    }
    setSubmitting(true);
    try {
      const body = { ...header, ...pluginValues, lines };
      // NOTA: para editar un asiento draft se crearía un endpoint PATCH;
      // de momento solo permitimos crear + postear + reversar. Los borradores
      // se pueden eliminar y recrear si hace falta.
      if (editing) await journalEntriesApi.update(editing.id, body);
      else await journalEntriesApi.create(body);
      toast.success(t('accounting.journal.createdDraft'));
      closeForm();
      fetchAll();
    } catch (err) {
      toast.error((err instanceof Error && err.message) || t('accounting.common.errorSaving'));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePost = async (id: string) => {
    try {
      const data = await journalEntriesApi.post(id);
      toast.success(t('accounting.journal.posted', { number: data.number ?? '' }));
      fetchAll();
    } catch (err) {
      toast.error((err instanceof Error && err.message) || t('accounting.journal.postError'));
    }
  };

  const handleReverse = async (id: string) => {
    const ok = await popup.confirm({
      title: t('accounting.journal.reverseTitle'),
      message: t('accounting.journal.reverseMessage'),
      tone: 'warning',
      confirmLabel: t('accounting.journal.reverse'),
    });
    if (!ok) return;
    try {
      await journalEntriesApi.reverse(id);
      toast.success(t('accounting.journal.reversed'));
      fetchAll();
    } catch (err) {
      toast.error((err instanceof Error && err.message) || t('accounting.journal.reverseError'));
    }
  };

  const columns: TableColumn<Entry>[] = [
    {
      header: t('accounting.journal.number'),
      cell: (r: Entry) =>
        r.status === 'draft' ? <span className="text-fg-subtle">—</span> : <b>{r.number}</b>,
    },
    { header: t('accounting.common.date'), cell: (r: Entry) => formatDate(r.date) },
    { header: t('accounting.common.concept'), accessor: 'description' },
    {
      header: t('accounting.journal.source'),
      cell: (r: Entry) => (
        <Badge variant="info">
          {SOURCE_LABELS[r.source] ? t(SOURCE_LABELS[r.source]) : r.source}
        </Badge>
      ),
    },
    {
      header: t('accounting.common.status'),
      cell: (r: Entry) => (
        <Badge variant={STATUS_VARIANT[r.status] || 'neutral'}>
          {STATUS_LABEL[r.status] ? t(STATUS_LABEL[r.status]) : r.status}
        </Badge>
      ),
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que las condiciones de estado
  // (draft / posted) y de permiso se declaran una vez en lugar de duplicarse.
  const rowActions = (r: Entry): RowAction[] => [
    ...(r.status === 'draft' && canWrite
      ? [
          {
            label: t('accounting.journal.post'),
            icon: <CheckCircle size={14} />,
            onClick: () => handlePost(r.id),
          },
        ]
      : []),
    ...(r.status === 'posted' && canWrite
      ? [
          {
            label: t('accounting.journal.reverse'),
            icon: <Undo2 size={14} />,
            onClick: () => handleReverse(r.id),
          },
        ]
      : []),
    {
      label: t('accounting.journal.viewEdit'),
      icon: <Pencil size={14} />,
      onClick: () => openEdit(r),
    },
  ];

  const formOpen = editing !== null || lines.length > 0;
  const isReadOnly = !!editing && editing.status !== 'draft';

  return (
    <div className="p-8 w-full space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title={t('accounting.journal.title')}
        subtitle={t('accounting.journal.subtitle')}
        icon={<ScrollText size={18} />}
        size="lg"
        actions={
          canWrite && (
            <Button type="button" onClick={openCreate} className="flex items-center gap-2">
              <Plus size={18} />
              {t('accounting.journal.new')}
            </Button>
          )
        }
      />

      {formOpen && (
        <Card className="border-border-subtle shadow-lg" noPadding>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <DatePicker
                label={t('accounting.common.date')}
                value={(header.date as string) || null}
                onChange={(v) => setHeader({ ...header, date: v ?? '' })}
                disabled={isReadOnly}
                required
              />
              <Select
                label={t('accounting.journal.period')}
                options={periods.map((p) => ({
                  value: p.id,
                  label: `${p.code} — ${p.name}${p.status !== 'O' ? ` ${t('accounting.journal.closedSuffix')}` : ''}`,
                  disabled: p.status !== 'O',
                }))}
                value={header.periodId || ''}
                onChange={(v) => setHeader({ ...header, periodId: v })}
                disabled={isReadOnly}
                placeholder={t('accounting.common.selectPlaceholder')}
              />
              <Input
                label={t('accounting.common.concept')}
                value={(header.description as string) || ''}
                onChange={(e) => setHeader({ ...header, description: e.target.value })}
                disabled={isReadOnly}
              />
            </div>

            {/* Rejilla editable (selector de cuenta, importes y alta/baja de
                líneas en caliente): se queda como <table> a mano — la Table del
                paquete es de solo lectura. */}
            <div className="border border-border-default rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-bg-muted text-fg-body">
                  <tr>
                    <th className="p-2 text-left">#</th>
                    <th className="p-2 text-left">{t('accounting.common.account')}</th>
                    <th className="p-2 text-left">{t('accounting.common.description')}</th>
                    <th className="p-2 text-right">{t('accounting.common.debit')}</th>
                    <th className="p-2 text-right">{t('accounting.common.credit')}</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-t border-border-subtle">
                      <td className="p-2 text-fg-subtle">{i + 1}</td>
                      <td className="p-2">
                        <SearchableSelect
                          options={accountOptions}
                          value={l.accountId}
                          onChange={(v) => updateLine(i, { accountId: v })}
                          disabled={isReadOnly}
                          placeholder="—"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={l.description || ''}
                          onChange={(e) => updateLine(i, { description: e.target.value })}
                          disabled={isReadOnly}
                          inputSize="sm"
                        />
                      </td>
                      <td className="p-2">
                        <CurrencyInput
                          value={l.debit}
                          onChange={(v) => updateLine(i, { debit: v ?? 0, credit: 0 })}
                          min={0}
                          emptyValue="zero"
                          disabled={isReadOnly}
                          inputSize="sm"
                          containerClassName="w-28"
                        />
                      </td>
                      <td className="p-2">
                        <CurrencyInput
                          value={l.credit}
                          onChange={(v) => updateLine(i, { credit: v ?? 0, debit: 0 })}
                          min={0}
                          emptyValue="zero"
                          disabled={isReadOnly}
                          inputSize="sm"
                          containerClassName="w-28"
                        />
                      </td>
                      <td className="p-2">
                        {!isReadOnly && lines.length > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLine(i)}
                            title={t('accounting.journal.removeLine')}
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-bg-muted font-semibold">
                  <tr>
                    <td colSpan={3} className="p-2 text-right">
                      {t('accounting.journal.totals')}
                    </td>
                    <td className="p-2 text-right">{totalDebit.toFixed(2)}</td>
                    <td className="p-2 text-right">{totalCredit.toFixed(2)}</td>
                    <td className="p-2 text-right">
                      {balanced ? (
                        <Badge variant="success">OK</Badge>
                      ) : (
                        <Badge variant="error">Δ {(totalDebit - totalCredit).toFixed(2)}</Badge>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
              {!isReadOnly && (
                <div className="p-2 bg-bg-muted border-t border-border-default">
                  <Button type="button" variant="ghost" size="sm" onClick={addLine}>
                    <Plus size={14} className="mr-1" />
                    {t('accounting.journal.addLine')}
                  </Button>
                </div>
              )}
            </div>

            <PluginFieldsPanel
              tableName="JournalEntry"
              values={pluginValues}
              onChange={(k, v) => setPluginValues((prev) => ({ ...prev, [k]: v }))}
              layout="inline"
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={closeForm}>
                {isReadOnly ? t('accounting.common.close') : t('accounting.common.cancel')}
              </Button>
              {!isReadOnly && (
                <Button type="submit" disabled={submitting || !balanced}>
                  {t('accounting.journal.saveDraft')}
                </Button>
              )}
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
        />
      </Card>
    </div>
  );
};

export default JournalEntries;
