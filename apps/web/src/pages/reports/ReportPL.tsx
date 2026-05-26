import React, { useEffect, useState } from 'react';
import { Card, Button } from '@openfactu/ui';
import { ArrowLeft, Download, FileText, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useFormat } from '../../hooks/useFormat';

interface PLData {
  incomeRows: { code: string; name: string; amount: number }[];
  expenseRows: { code: string; name: string; amount: number }[];
  totalIncome: number;
  totalExpense: number;
  result: number;
}

export const ReportPL: React.FC = () => {
  const { token, user } = useAuth();
  const fmt = useFormat();
  const navigate = useNavigate();
  const [periods, setPeriods] = useState<any[]>([]);
  const [periodId, setPeriodId] = useState<string>('');
  const [data, setData] = useState<PLData | null>(null);
  const [loading, setLoading] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' };

  useEffect(() => {
    fetch('/api/periods', { headers })
      .then((r) => r.json())
      .then((d) => {
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
    fetch(`/api/reports/pl?periodId=${periodId}`, { headers })
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (periodId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId]);

  const downloadPdf = async () => {
    const res = await fetch(`/api/reports/pl/pdf?periodId=${periodId}`, { headers });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pl-${periodId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 w-full space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="text-xs font-bold text-slate-400 hover:text-slate-700 flex items-center gap-1 mb-2"
          >
            <ArrowLeft size={12} /> Volver
          </button>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <FileText size={22} className="text-emerald-600" />
            Cuenta de Pérdidas y Ganancias
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={load} className="flex items-center gap-2">
            <RefreshCw size={16} /> Actualizar
          </Button>
          <Button onClick={downloadPdf} className="flex items-center gap-2">
            <Download size={16} /> PDF
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <label className="text-xs font-bold text-slate-600 dark:text-slate-300 mr-2">Período</label>
        <select
          value={periodId}
          onChange={(e) => setPeriodId(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
      </Card>

      {loading || !data ? (
        <Card className="p-10 text-center text-slate-400 italic">Cargando…</Card>
      ) : (
        <>
          <Card className="p-5 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
              Ingresos (grupo 7)
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {data.incomeRows.map((r) => (
                  <tr key={r.code} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-1 font-mono text-xs text-slate-500">{r.code}</td>
                    <td className="py-1">{r.name}</td>
                    <td className="py-1 text-right tabular-nums">{fmt.money(r.amount)}</td>
                  </tr>
                ))}
                <tr className="font-black">
                  <td colSpan={2} className="py-2 text-right uppercase text-xs">
                    Total ingresos
                  </td>
                  <td className="py-2 text-right tabular-nums text-emerald-600">
                    {fmt.money(data.totalIncome)}
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
              Gastos (grupo 6)
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {data.expenseRows.map((r) => (
                  <tr key={r.code} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-1 font-mono text-xs text-slate-500">{r.code}</td>
                    <td className="py-1">{r.name}</td>
                    <td className="py-1 text-right tabular-nums">{fmt.money(r.amount)}</td>
                  </tr>
                ))}
                <tr className="font-black">
                  <td colSpan={2} className="py-2 text-right uppercase text-xs">
                    Total gastos
                  </td>
                  <td className="py-2 text-right tabular-nums text-rose-600">
                    {fmt.money(data.totalExpense)}
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>

          <Card
            className={`p-5 ${data.result >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-rose-50 dark:bg-rose-500/10'}`}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-black uppercase tracking-widest">
                {data.result >= 0 ? 'Beneficio del ejercicio' : 'Pérdida del ejercicio'}
              </span>
              <span
                className={`text-3xl font-black tracking-tight tabular-nums ${data.result >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}
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
