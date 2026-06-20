import React, { useEffect, useState } from 'react';
import { Card, Button } from '@openfactu/ui';
import {
  ArrowLeft,
  Download,
  RefreshCw,
  FileBarChart,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useFormat } from '../../hooks/useFormat';

export const ReportExecutive: React.FC = () => {
  const { token, user } = useAuth();
  const fmt = useFormat();
  const navigate = useNavigate();
  const [periods, setPeriods] = useState<any[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const headers = { Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' };

  useEffect(() => {
    fetch('/api/periods', { headers })
      .then((r) => r.json())
      .then((d) => {
        setPeriods(Array.isArray(d) ? d : []);
        const open = d.find?.((p: any) => p.status === 'O');
        setPeriodId(open?.id || d[0]?.id || '');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const load = () => {
    if (!periodId) return;
    setLoading(true);
    fetch(`/api/reports/executive?periodId=${periodId}`, { headers })
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (periodId) load(); /* eslint-disable-next-line */
  }, [periodId]);

  const downloadPdf = async () => {
    const res = await fetch(`/api/reports/executive/pdf?periodId=${periodId}`, { headers });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ejecutivo.pdf`;
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
            <FileBarChart size={22} className="text-rose-600" />
            Informe ejecutivo
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Resumen del período para socios y dirección.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={load} className="flex items-center gap-2">
            <RefreshCw size={16} />
            Actualizar
          </Button>
          <Button onClick={downloadPdf} className="flex items-center gap-2">
            <Download size={16} />
            PDF
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-5 bg-emerald-50 dark:bg-emerald-500/10">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                  Facturación
                </span>
                <div className="text-3xl font-black text-emerald-900 dark:text-emerald-100 mt-2">
                  {fmt.money(data.sales?.total || 0)}
                </div>
                <span className="text-xs text-emerald-700 dark:text-emerald-400">
                  {data.sales?.count || 0} facturas
                </span>
              </div>
              <TrendingUp size={24} className="text-emerald-500" />
            </div>
          </Card>
          <Card className="p-5 bg-blue-50 dark:bg-blue-500/10">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-700 dark:text-blue-300">
                  Compras
                </span>
                <div className="text-3xl font-black text-blue-900 dark:text-blue-100 mt-2">
                  {fmt.money(data.purchases?.total || 0)}
                </div>
                <span className="text-xs text-blue-700 dark:text-blue-400">
                  {data.purchases?.count || 0} facturas
                </span>
              </div>
              <TrendingDown size={24} className="text-blue-500" />
            </div>
          </Card>
          <Card
            className={`p-5 md:col-span-2 ${Number(data.margin) >= 0 ? 'bg-purple-50 dark:bg-purple-500/10' : 'bg-rose-50 dark:bg-rose-500/10'}`}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-black uppercase tracking-widest">
                Margen bruto (ventas − compras)
              </span>
              <span className="text-3xl font-black tabular-nums">
                {fmt.money(data.margin || 0)}
              </span>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ReportExecutive;
