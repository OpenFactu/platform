import React, { useEffect, useState } from 'react';
import { Card, Button, Input } from '@openfactu/ui';
import { ArrowLeft, Download, RefreshCw, Receipt } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useFormat } from '../../hooks/useFormat';

export const ReportVAT: React.FC = () => {
  const { token, user } = useAuth();
  const fmt = useFormat();
  const navigate = useNavigate();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<{ output: any[]; input: any[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' };

  const load = () => {
    const qs = new URLSearchParams();
    if (from) qs.append('from', from);
    if (to) qs.append('to', to);
    setLoading(true);
    fetch(`/api/reports/vat?${qs.toString()}`, { headers })
      .then((r) => r.json())
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
    const res = await fetch(`/api/reports/vat/pdf?${qs.toString()}`, { headers });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `libro-iva.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sum = (arr: any[], k: string) =>
    arr.reduce((s: number, r: any) => s + Number(r[k] || 0), 0);

  const Table: React.FC<{ title: string; rows: any[]; color: string }> = ({
    title,
    rows,
    color,
  }) => (
    <Card className="p-5 space-y-3">
      <h3 className={`text-xs font-black uppercase tracking-wider ${color}`}>{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[640px]">
          <thead className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            <tr>
              <th className="text-left py-1">Fecha</th>
              <th className="text-left py-1">Nº Factura</th>
              <th className="text-left py-1">NIF</th>
              <th className="text-left py-1">Nombre</th>
              <th className="text-right py-1">Base</th>
              <th className="text-right py-1">IVA</th>
              <th className="text-right py-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1">{fmt.date(r.date)}</td>
                <td className="py-1 font-mono">{r.code}</td>
                <td className="py-1 font-mono">{r.partnerNif}</td>
                <td className="py-1 truncate max-w-[180px]">{r.partnerName}</td>
                <td className="py-1 text-right tabular-nums">{fmt.money(r.base)}</td>
                <td className="py-1 text-right tabular-nums">{fmt.money(r.tax)}</td>
                <td className="py-1 text-right tabular-nums">{fmt.money(r.total)}</td>
              </tr>
            ))}
            <tr className="font-black border-t-2 border-slate-300">
              <td colSpan={4} className="py-2 text-right uppercase text-xs">
                Total
              </td>
              <td className="py-2 text-right tabular-nums">{fmt.money(sum(rows, 'base'))}</td>
              <td className={`py-2 text-right tabular-nums ${color}`}>
                {fmt.money(sum(rows, 'tax'))}
              </td>
              <td className="py-2 text-right tabular-nums">{fmt.money(sum(rows, 'total'))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );

  const saldo = data ? sum(data.output, 'tax') - sum(data.input, 'tax') : 0;

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
            <Receipt size={22} className="text-amber-600" />
            Libro de IVA
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">IVA repercutido y soportado (modelo 303).</p>
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

      <Card className="p-4 flex items-end gap-3 flex-wrap">
        <Input type="date" label="Desde" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" label="Hasta" value={to} onChange={(e) => setTo(e.target.value)} />
      </Card>

      {loading || !data ? (
        <Card className="p-10 text-center text-slate-400 italic">Cargando…</Card>
      ) : (
        <>
          <Table
            title="IVA Repercutido (ventas)"
            rows={data.output}
            color="text-emerald-600 dark:text-emerald-400"
          />
          <Table
            title="IVA Soportado (compras)"
            rows={data.input}
            color="text-blue-600 dark:text-blue-400"
          />
          <Card
            className={`p-5 ${saldo >= 0 ? 'bg-rose-50 dark:bg-rose-500/10' : 'bg-emerald-50 dark:bg-emerald-500/10'}`}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-black uppercase tracking-widest">
                {saldo >= 0 ? 'A ingresar a Hacienda' : 'A compensar / devolver'}
              </span>
              <span
                className={`text-3xl font-black tabular-nums ${saldo >= 0 ? 'text-rose-700' : 'text-emerald-700'}`}
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
