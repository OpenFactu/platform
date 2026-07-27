import React, { useEffect, useState } from 'react';
import { Card, Button, PageHeader, SearchableSelect } from '@openfactu/ui';
import { ArrowLeft, Download, FileText, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

interface PLData {
  incomeRows: { code: string; name: string; amount: number }[];
  expenseRows: { code: string; name: string; amount: number }[];
  totalIncome: number;
  totalExpense: number;
  result: number;
}

export const ReportPL: React.FC = () => {
  const { user } = useAuth();
  const fmt = useFormat();
  const navigate = useNavigate();
  const [periods, setPeriods] = useState<any[]>([]);
  const [periodId, setPeriodId] = useState<string>('');
  const [data, setData] = useState<PLData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    reportsApi.get<any>('/api/periods').then((d) => {
      if (Array.isArray(d)) {
        setPeriods(d);
        const open = d.find((p) => p.status === 'O');
        setPeriodId(open?.id || d[0]?.id || '');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const load = () => {
    if (!periodId) return;
    setLoading(true);
    reportsApi
      .get<any>(`/api/reports/pl?periodId=${periodId}`)
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (periodId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId]);

  const downloadPdf = async () => {
    await reportsApi.downloadPdf(`/api/reports/pl/pdf?periodId=${periodId}`, `pl-${periodId}.pdf`);
  };

  return (
    <div className="p-6 w-full space-y-5">
      <PageHeader
        title="Cuenta de Pérdidas y Ganancias"
        icon={<FileText size={18} />}
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
        toolbar={
          <div className="max-w-sm">
            <label className="block text-xs font-bold text-fg-body mb-1">Período</label>
            <SearchableSelect
              options={periods.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
              value={periodId}
              onChange={setPeriodId}
              placeholder="— seleccionar período —"
            />
          </div>
        }
      />

      {loading || !data ? (
        <Card className="p-10 text-center text-fg-subtle italic">Cargando…</Card>
      ) : (
        <>
          <Card className="p-5 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-fg-subtle">
              Ingresos (grupo 7)
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {data.incomeRows.map((r) => (
                  <tr key={r.code} className="border-b border-border-subtle">
                    <td className="py-1 font-mono text-xs text-fg-muted">{r.code}</td>
                    <td className="py-1">{r.name}</td>
                    <td className="py-1 text-right tabular-nums">{fmt.money(r.amount)}</td>
                  </tr>
                ))}
                <tr className="font-black">
                  <td colSpan={2} className="py-2 text-right uppercase text-xs">
                    Total ingresos
                  </td>
                  <td className="py-2 text-right tabular-nums text-success-fg">
                    {fmt.money(data.totalIncome)}
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-fg-subtle">
              Gastos (grupo 6)
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {data.expenseRows.map((r) => (
                  <tr key={r.code} className="border-b border-border-subtle">
                    <td className="py-1 font-mono text-xs text-fg-muted">{r.code}</td>
                    <td className="py-1">{r.name}</td>
                    <td className="py-1 text-right tabular-nums">{fmt.money(r.amount)}</td>
                  </tr>
                ))}
                <tr className="font-black">
                  <td colSpan={2} className="py-2 text-right uppercase text-xs">
                    Total gastos
                  </td>
                  <td className="py-2 text-right tabular-nums text-danger-fg">
                    {fmt.money(data.totalExpense)}
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>

          <Card className={`p-5 ${data.result >= 0 ? 'bg-success-bg' : 'bg-danger-bg'}`}>
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-black uppercase tracking-widest">
                {data.result >= 0 ? 'Beneficio del ejercicio' : 'Pérdida del ejercicio'}
              </span>
              <span
                className={`text-3xl font-black tracking-tight tabular-nums ${data.result >= 0 ? 'text-success-fg' : 'text-danger-fg'}`}
              >
                {fmt.money(data.result)}
              </span>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default ReportPL;
