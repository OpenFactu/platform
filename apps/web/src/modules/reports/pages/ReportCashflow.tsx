import React, { useEffect, useState } from 'react';
import { Card, Button, PageHeader, Select } from '@openfactu/ui';
import { ArrowLeft, RefreshCw, LineChart as LineChartIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useAuth } from '@/context/AuthContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

/** Rangos del selector. `value` es texto porque `Select` trabaja con strings;
 *  el estado sigue siendo numérico. */
const RANGE_OPTIONS = [
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
];

export const ReportCashflow: React.FC = () => {
  const { user } = useAuth();
  const fmt = useFormat();
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    reportsApi
      .get<any>(`/api/reports/cashflow?days=${days}`)
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [days, user?.tenantId]);

  const totalIn = rows.reduce((s, r) => s + Number(r.inflow || 0), 0);
  const totalOut = rows.reduce((s, r) => s + Number(r.outflow || 0), 0);
  const net = totalIn - totalOut;

  return (
    <div className="p-6 w-full space-y-5">
      <PageHeader
        title="Cash-flow"
        subtitle={`Cobros vs pagos reales últimos ${days} días.`}
        icon={<LineChartIcon size={18} />}
        size="md"
        breadcrumbs={
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={12} className="mr-1" /> Volver
          </Button>
        }
        actions={
          <div className="flex items-center gap-2">
            <Select
              options={RANGE_OPTIONS}
              value={String(days)}
              onChange={(v) => setDays(Number(v))}
              ariaLabel="Rango de días"
              containerClassName="w-48"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={load}
              className="flex items-center gap-2"
            >
              <RefreshCw size={16} />
              Actualizar
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 bg-emerald-50 dark:bg-emerald-500/10">
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
            Entradas
          </span>
          <div className="text-2xl font-black mt-1">{fmt.money(totalIn)}</div>
        </Card>
        <Card className="p-5 bg-rose-50 dark:bg-rose-500/10">
          <span className="text-[10px] font-black uppercase tracking-widest text-rose-700 dark:text-rose-300">
            Salidas
          </span>
          <div className="text-2xl font-black mt-1">{fmt.money(totalOut)}</div>
        </Card>
        <Card
          className={`p-5 ${net >= 0 ? 'bg-blue-50 dark:bg-blue-500/10' : 'bg-amber-50 dark:bg-amber-500/10'}`}
        >
          <span className="text-[10px] font-black uppercase tracking-widest">Neto</span>
          <div
            className={`text-2xl font-black mt-1 ${net >= 0 ? 'text-blue-700 dark:text-blue-300' : 'text-amber-700 dark:text-amber-300'}`}
          >
            {fmt.money(net)}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="h-80">
          {loading ? (
            <div className="h-full flex items-center justify-center text-slate-400 italic">
              Cargando…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip formatter={(v: any) => fmt.money(v)} />
                <Legend />
                <Line type="monotone" dataKey="inflow" stroke="#10b981" name="Entradas" />
                <Line type="monotone" dataKey="outflow" stroke="#f43f5e" name="Salidas" />
                <Line type="monotone" dataKey="net" stroke="#3b82f6" name="Neto" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </div>
  );
};

export default ReportCashflow;
