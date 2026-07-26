import React, { useEffect, useState } from 'react';
import { Card, Button, SearchableSelect } from '@openfactu/ui';
import { ArrowLeft, Download, RefreshCw, Landmark } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

export const ReportBalanceSheet: React.FC = () => {
  const { user } = useAuth();
  const fmt = useFormat();
  const navigate = useNavigate();
  const [periods, setPeriods] = useState<any[]>([]);
  const [periodId, setPeriodId] = useState<string>('');
  const [data, setData] = useState<any>(null);
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
      .get<any>(`/api/reports/balance-sheet?periodId=${periodId}`)
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (periodId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId]);

  const downloadPdf = async () => {
    await reportsApi.downloadPdf(
      `/api/reports/balance-sheet/pdf?periodId=${periodId}`,
      `balance-situacion-${periodId}.pdf`,
    );
  };

  const section = (title: string, rows: any[], total: number, color: string) => (
    <Card className="p-5 space-y-3">
      <h3 className={`text-xs font-black uppercase tracking-wider ${color}`}>{title}</h3>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className="border-b border-slate-100 dark:border-slate-800">
              <td className="py-1 font-mono text-xs text-slate-500">{r.code}</td>
              <td className="py-1">{r.name}</td>
              <td className="py-1 text-right tabular-nums">{fmt.money(r.amount)}</td>
            </tr>
          ))}
          <tr className="font-black">
            <td colSpan={2} className="py-2 text-right uppercase text-xs">
              Total
            </td>
            <td className={`py-2 text-right tabular-nums ${color}`}>{fmt.money(total)}</td>
          </tr>
        </tbody>
      </table>
    </Card>
  );

  return (
    <div className="p-6 w-full space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-2">
            <ArrowLeft size={12} className="mr-1" /> Volver
          </Button>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Landmark size={22} className="text-purple-600" />
            Balance de Situación
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
        <div className="max-w-sm">
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
            Período
          </label>
          {/* SearchableSelect: los períodos vienen del servidor y se acumulan
              ejercicio tras ejercicio, así que conviene el buscador. */}
          <SearchableSelect
            options={periods.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
            value={periodId}
            onChange={setPeriodId}
            placeholder="— seleccionar período —"
          />
        </div>
      </Card>

      {loading || !data ? (
        <Card className="p-10 text-center text-slate-400 italic">Cargando…</Card>
      ) : (
        <>
          {section('Activo', data.asset, data.totalAsset, 'text-emerald-600 dark:text-emerald-400')}
          {section(
            'Pasivo',
            data.liability,
            data.totalLiability,
            'text-amber-600 dark:text-amber-400',
          )}
          {section(
            'Patrimonio Neto',
            data.equity,
            data.totalEquity,
            'text-blue-600 dark:text-blue-400',
          )}
        </>
      )}
    </div>
  );
};

export default ReportBalanceSheet;
