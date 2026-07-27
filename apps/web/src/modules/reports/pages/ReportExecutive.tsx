import React, { useEffect, useState } from 'react';
import { Card, Button, PageHeader, SearchableSelect } from '@openfactu/ui';
import {
  ArrowLeft,
  Download,
  RefreshCw,
  FileBarChart,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

export const ReportExecutive: React.FC = () => {
  const { user } = useAuth();
  const fmt = useFormat();
  const navigate = useNavigate();
  const [periods, setPeriods] = useState<any[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    reportsApi.get<any>('/api/periods').then((d) => {
      setPeriods(Array.isArray(d) ? d : []);
      const open = d.find?.((p: any) => p.status === 'O');
      setPeriodId(open?.id || d[0]?.id || '');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const load = () => {
    if (!periodId) return;
    setLoading(true);
    reportsApi
      .get<any>(`/api/reports/executive?periodId=${periodId}`)
      .then(setData)
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (periodId) load(); /* eslint-disable-next-line */
  }, [periodId]);

  const downloadPdf = async () => {
    await reportsApi.downloadPdf(
      `/api/reports/executive/pdf?periodId=${periodId}`,
      `ejecutivo.pdf`,
    );
  };

  return (
    <div className="p-6 w-full space-y-5">
      <PageHeader
        title="Informe ejecutivo"
        subtitle="Resumen del período para socios y dirección."
        icon={<FileBarChart size={18} />}
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
              <RefreshCw size={16} />
              Actualizar
            </Button>
            <Button type="button" onClick={downloadPdf} className="flex items-center gap-2">
              <Download size={16} />
              PDF
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
