import { hrReportsApi } from '../api';
import type { LaborCostRow as Row } from '../api/hrReportsApi';
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, DatePicker, Select, Table, PageHeader } from '@openfactu/ui';
import type { TableColumn } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { PiggyBank, Download } from 'lucide-react';
import { exportToXlsx } from '@/utils/exportXlsx';
import { useI18n } from '@/i18n/I18nContext';
import { formatNumber } from '@/i18n/format';

// Dimensiones de agrupación, en un solo sitio: las `options` del desplegable se
// derivan de aquí.
const GROUP_BY_OPTIONS = [
  { value: 'employee', label: 'hr.common.employee' },
  { value: 'department', label: 'hr.common.department' },
  { value: 'costCenter', label: 'hr.employeeFields.costCenter' },
  { value: 'project', label: 'hrPayroll.laborCost.project' },
];

export const LaborCost: React.FC = () => {
  const { t } = useI18n();
  const { token, user } = useAuth();
  const today = new Date();
  const [filters, setFilters] = useState({
    from: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10),
    to: new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10),
    groupBy: 'employee' as 'employee' | 'department' | 'project' | 'costCenter',
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState({ gross: 0, ssEr: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );

  const fetchAll = async () => {
    setLoading(true);
    const d = await hrReportsApi.laborCost({
      from: filters.from,
      to: filters.to,
      groupBy: filters.groupBy,
    });
    setRows(d.rows || []);
    setTotals(d.totals || { gross: 0, ssEr: 0, total: 0 });
    setLoading(false);
  };
  useEffect(() => {
    if (user?.tenantId) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, filters.from, filters.to, filters.groupBy]);

  const exportExcel = () =>
    exportToXlsx({
      filename: `coste_laboral_${filters.from}_${filters.to}`,
      sheetName: t('hrPayroll.laborCost.title'),
      title: t('hrPayroll.laborCost.exportTitle', { from: filters.from, to: filters.to }),
      columns: [
        { key: 'label', label: t('hrPayroll.laborCost.group'), width: 32 },
        { key: 'gross', label: t('hrPayroll.payrolls.gross'), type: 'currency' },
        { key: 'ssEr', label: t('hrPayroll.payrolls.ssEmployer'), type: 'currency' },
        { key: 'total', label: t('hr.common.total'), type: 'currency' },
        { key: 'count', label: t('hrPayroll.laborCost.count'), type: 'integer' },
      ],
      rows,
      totals: {
        label: t('hr.common.total').toUpperCase(),
        gross: totals.gross,
        ssEr: totals.ssEr,
        total: totals.total,
        count: rows.reduce((s, r) => s + r.count, 0),
      },
    });

  const fmt = (n: number) =>
    formatNumber(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const columns: TableColumn<Row>[] = [
    {
      header: t('hrPayroll.laborCost.group'),
      accessor: 'label',
      sortable: true,
      primary: true,
    },
    {
      header: t('hrPayroll.payrolls.gross'),
      align: 'right',
      sortable: true,
      sortAccessor: (r) => r.gross,
      cell: (r) => <span className="tabular-nums">{fmt(r.gross)} €</span>,
    },
    {
      header: t('hrPayroll.payrolls.ssEmployer'),
      align: 'right',
      sortable: true,
      sortAccessor: (r) => r.ssEr,
      cell: (r) => <span className="tabular-nums">{fmt(r.ssEr)} €</span>,
    },
    {
      header: t('hrPayroll.laborCost.totalCost'),
      align: 'right',
      sortable: true,
      sortAccessor: (r) => r.total,
      cell: (r) => <span className="tabular-nums font-bold">{fmt(r.total)} €</span>,
    },
    {
      header: t('hrPayroll.laborCost.count'),
      align: 'right',
      sortable: true,
      sortAccessor: (r) => r.count,
      cell: (r) => <span className="tabular-nums">{r.count}</span>,
    },
    {
      header: t('hrPayroll.laborCost.pctTotal'),
      align: 'right',
      sortable: true,
      sortAccessor: (r) => (totals.total > 0 ? r.total / totals.total : 0),
      cell: (r) => (
        <span className="tabular-nums">
          {totals.total > 0 ? ((r.total / totals.total) * 100).toFixed(1) : '0.0'}%
        </span>
      ),
    },
  ];

  return (
    <div className="p-4 w-full space-y-5">
      <PageHeader
        title={t('hrPayroll.laborCost.title')}
        subtitle={t('hrPayroll.laborCost.subtitle')}
        icon={<PiggyBank size={18} />}
        size="lg"
        actions={
          <Button type="button" size="sm" variant="secondary" onClick={exportExcel}>
            <Download size={14} /> {t('hrTime.timeclock.exportExcel')}
          </Button>
        }
      />

      <Card noPadding>
        <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          {/* El rango se guarda como '' cuando se vacía, igual que hacía el
              <input type="date">. */}
          <DatePicker
            label={t('hr.common.from')}
            value={filters.from || null}
            onChange={(v) => setFilters({ ...filters, from: v ?? '' })}
          />
          <DatePicker
            label={t('hr.common.to')}
            value={filters.to || null}
            onChange={(v) => setFilters({ ...filters, to: v ?? '' })}
          />
          <Select
            label={t('hrPayroll.laborCost.groupBy')}
            options={GROUP_BY_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
            value={filters.groupBy}
            onChange={(v) => setFilters({ ...filters, groupBy: v as typeof filters.groupBy })}
          />
          <div className="text-xs text-slate-500">
            <span className="font-bold text-fg-body">{rows.length}</span>{' '}
            {t('hrPayroll.laborCost.groups')}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border-2 border-emerald-300 bg-bg-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">
            {t('hrPayroll.laborCost.grossPaid')}
          </div>
          <div className="text-2xl font-black tabular-nums mt-1">{fmt(totals.gross)} €</div>
        </div>
        <div className="rounded-lg border-2 border-indigo-300 bg-bg-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">
            {t('hrPayroll.laborCost.ssEmployer')}
          </div>
          <div className="text-2xl font-black tabular-nums mt-1">{fmt(totals.ssEr)} €</div>
        </div>
        <div className="rounded-lg border-2 border-rose-300 bg-bg-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">
            {t('hrPayroll.laborCost.totalCost')}
          </div>
          <div className="text-2xl font-black tabular-nums mt-1 text-rose-600">
            {fmt(totals.total)} €
          </div>
        </div>
      </div>

      <Card className="overflow-hidden" noPadding>
        <Table
          className="max-md:p-3"
          columns={columns}
          data={rows}
          isLoading={loading}
          rowKey={(r) => r.key}
          emptyMessage={t('hrPayroll.laborCost.empty')}
        />
      </Card>
    </div>
  );
};

export default LaborCost;
