import React, { useEffect, useState } from 'react';
import { Card, Button, DatePicker, PageHeader, Table } from '@openfactu/ui';
import type { TableColumn } from '@openfactu/ui';
import { ArrowLeft, Download, RefreshCw, Receipt } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

export const ReportVAT: React.FC = () => {
  const { user } = useAuth();
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
    { header: 'Fecha', cell: (r) => fmt.date(r.date), sortable: true, sortAccessor: (r) => r.date },
    { header: 'Nº Factura', accessor: 'code', sortable: true, primary: true },
    { header: 'NIF', accessor: 'partnerNif', className: 'font-mono', sortable: true },
    {
      header: 'Nombre',
      accessor: 'partnerName',
      sortable: true,
      className: 'truncate max-w-[180px]',
    },
    { header: 'Base', cell: (r) => fmt.money(r.base), align: 'right', sortable: true },
    { header: 'IVA', cell: (r) => fmt.money(r.tax), align: 'right', sortable: true },
    { header: 'Total', cell: (r) => fmt.money(r.total), align: 'right', sortable: true },
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
        emptyMessage="Sin facturas en el período"
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
        title="Libro de IVA"
        subtitle="IVA repercutido y soportado (modelo 303)."
        icon={<Receipt size={18} />}
        size="md"
        breadcrumbs={
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={12} className="mr-1" /> Volver
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
              <RefreshCw size={16} /> Actualizar
            </Button>
            <Button type="button" onClick={downloadPdf} className="flex items-center gap-2">
              <Download size={16} /> PDF
            </Button>
          </div>
        }
      />

      <Card className="p-4 flex items-end gap-3 flex-wrap">
        <DatePicker label="Desde" value={from} onChange={(v) => setFrom(v ?? '')} clearable />
        <DatePicker label="Hasta" value={to} onChange={(v) => setTo(v ?? '')} clearable />
      </Card>

      {loading || !data ? (
        <Card className="p-10 text-center text-fg-subtle italic">Cargando…</Card>
      ) : (
        <>
          <VatBook title="IVA Repercutido (ventas)" rows={data.output} color="text-success-fg" />
          <VatBook title="IVA Soportado (compras)" rows={data.input} color="text-info-fg" />
          <Card className={`p-5 ${saldo >= 0 ? 'bg-danger-bg' : 'bg-success-bg'}`}>
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-black uppercase tracking-widest">
                {saldo >= 0 ? 'A ingresar a Hacienda' : 'A compensar / devolver'}
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
