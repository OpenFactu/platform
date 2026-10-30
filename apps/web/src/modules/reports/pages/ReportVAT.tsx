import React, { useEffect, useState } from 'react';
import { Card, Button, DatePicker, PageHeader, Table } from '@openfactu/ui';
import type { TableColumn } from '@openfactu/ui';
import { ArrowLeft, Download, RefreshCw, Receipt } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

export const ReportVAT: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const fmt = useFormat();
  const navigate = useNavigate();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<{ output: any[]; input: any[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    const qs = new URLSearchParams();
    if (from) qs.append('from', from);
    if (to) qs.append('to', to);
    setLoading(true);
    reportsApi
      .get<any>(`/api/reports/vat?${qs.toString()}`)
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadPdf = async () => {
    const qs = new URLSearchParams();
    if (from) qs.append('from', from);
    if (to) qs.append('to', to);
    await reportsApi.downloadPdf(`/api/reports/vat/pdf?${qs.toString()}`, `libro-iva.pdf`);
  };

  const sum = (arr: any[], k: string) =>
    arr.reduce((s: number, r: any) => s + Number(r[k] || 0), 0);

  const columns: TableColumn<any>[] = [
    {
      header: t('reports.common.date'),
      cell: (r) => fmt.date(r.date),
      sortable: true,
      sortAccessor: (r) => r.date,
    },
    { header: t('reports.vat.invoiceNumber'), accessor: 'code', sortable: true, primary: true },
    {
      header: t('reports.vat.taxId'),
      accessor: 'partnerNif',
      className: 'font-mono',
      sortable: true,
    },
    {
      header: t('reports.common.name'),
      accessor: 'partnerName',
      sortable: true,
      className: 'truncate max-w-[180px]',
    },
    {
      header: t('reports.vat.base'),
      cell: (r) => fmt.money(r.base),
      align: 'right',
      sortable: true,
    },
    { header: t('reports.vat.vat'), cell: (r) => fmt.money(r.tax), align: 'right', sortable: true },
    {
      header: t('reports.common.total'),
      cell: (r) => fmt.money(r.total),
      align: 'right',
      sortable: true,
    },
  ];

  /**
   * Libro (repercutido o soportado). La fila de totales ya no se pinta a mano
   * dentro del <tbody>: la `Table` la coloca en el <tfoot> alineada con las
   * columnas mediante `summaryRow`.
   */
  const VatBook: React.FC<{ title: string; rows: any[]; color: string }> = ({
    title,
    rows,
    color,
  }) => (
    <Card className="p-5 space-y-3">
      <h3 className={`text-xs font-black uppercase tracking-wider ${color}`}>{title}</h3>
      <Table
        columns={columns}
        data={rows}
        rowKey={(_r, i) => i}
        emptyMessage={t('reports.vat.empty')}
        density="compact"
        summaryRow={(visible) => [
          null,
          null,
          null,
          null,
          fmt.money(sum(visible, 'base')),
          <span className={color}>{fmt.money(sum(visible, 'tax'))}</span>,
          fmt.money(sum(visible, 'total')),
        ]}
      />
    </Card>
  );

  const saldo = data ? sum(data.output, 'tax') - sum(data.input, 'tax') : 0;

  return (
    <div className="p-6 w-full space-y-5">
      <PageHeader
        title={t('reports.vat.title')}
        subtitle={t('reports.vat.subtitle')}
        icon={<Receipt size={18} />}
        size="md"
        breadcrumbs={
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={12} className="mr-1" /> {t('reports.common.back')}
          </Button>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={load}
              className="flex items-center gap-2"
            >
              <RefreshCw size={16} /> {t('reports.common.refresh')}
            </Button>
            <Button type="button" onClick={downloadPdf} className="flex items-center gap-2">
              <Download size={16} /> PDF
            </Button>
          </div>
        }
      />

      <Card className="p-4 flex items-end gap-3 flex-wrap">
        <DatePicker
          label={t('reports.common.from')}
          value={from}
          onChange={(v) => setFrom(v ?? '')}
          clearable
        />
        <DatePicker
          label={t('reports.common.to')}
          value={to}
          onChange={(v) => setTo(v ?? '')}
          clearable
        />
      </Card>

      {loading || !data ? (
        <Card className="p-10 text-center text-fg-subtle italic">
          {t('reports.common.loading')}
        </Card>
      ) : (
        <>
          <VatBook title={t('reports.vat.output')} rows={data.output} color="text-success-fg" />
          <VatBook title={t('reports.vat.input')} rows={data.input} color="text-info-fg" />
          <Card className={`p-5 ${saldo >= 0 ? 'bg-danger-bg' : 'bg-success-bg'}`}>
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-black uppercase tracking-widest">
                {saldo >= 0 ? t('reports.vat.toPay') : t('reports.vat.toOffset')}
              </span>
              <span
                className={`text-3xl font-black tabular-nums ${saldo >= 0 ? 'text-danger-fg' : 'text-success-fg'}`}
              >
                {fmt.money(Math.abs(saldo))}
              </span>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default ReportVAT;
