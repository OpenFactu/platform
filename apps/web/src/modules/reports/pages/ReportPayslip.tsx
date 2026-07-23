import React, { useEffect, useState } from 'react';
import { Card, Button, useToast } from '@openfactu/ui';
import { ArrowLeft, Download, Banknote, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

/**
 * Lista de nóminas aprobadas — click → descarga recibo en PDF.
 */
export const ReportPayslip: React.FC = () => {
  const { user } = useAuth();
  const fmt = useFormat();
  const navigate = useNavigate();
  const toast = useToast();
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      reportsApi.get<any>('/api/hr/payrolls'),
      reportsApi.get<any>('/api/hr/employees'),
    ])
      .then(([p, e]) => {
        setPayrolls(Array.isArray(p) ? p : []);
        const map: Record<string, any> = {};
        (Array.isArray(e) ? e : []).forEach((emp: any) => (map[emp.id] = emp));
        setEmployees(map);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const downloadPdf = async (payrollId: string, empName: string, year: number, month: number) => {
    try {
      await reportsApi.downloadPdf(
        `/api/reports/payslip/${payrollId}/pdf`,
        `recibo-${empName.replace(/\s/g, '_')}-${year}-${String(month).padStart(2, '0')}.pdf`,
      );
      toast.success('Recibo descargado');
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || 'Error');
    }
  };

  return (
    <div className="p-6 w-full space-y-5">
      <div>
        <button
          onClick={() => navigate(-1)}
          className="text-xs font-bold text-slate-400 hover:text-slate-700 flex items-center gap-1 mb-2"
        >
          <ArrowLeft size={12} /> Volver
        </button>
        <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
          <Banknote size={22} className="text-emerald-600" />
          Recibo de nómina
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Selecciona una nómina aprobada para descargar el recibo.
        </p>
      </div>

      <Card className="overflow-hidden" noPadding>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/60 text-[10px] font-black uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left p-3">Empleado</th>
              <th className="text-left p-3">Período</th>
              <th className="text-right p-3">Bruto</th>
              <th className="text-right p-3">Neto</th>
              <th className="text-center p-3">Estado</th>
              <th className="text-right p-3">PDF</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-slate-400 italic">
                  Cargando…
                </td>
              </tr>
            ) : payrolls.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-slate-400 italic">
                  Sin nóminas
                </td>
              </tr>
            ) : (
              payrolls.map((p) => {
                const emp = employees[p.employeeId];
                const name = emp ? `${emp.firstName} ${emp.lastName}` : p.employeeId;
                return (
                  <tr
                    key={p.id}
                    className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                  >
                    <td className="p-3">{name}</td>
                    <td className="p-3 font-mono text-xs">
                      {p.periodYear}-{String(p.periodMonth).padStart(2, '0')}
                    </td>
                    <td className="p-3 text-right tabular-nums">{fmt.money(p.gross)}</td>
                    <td className="p-3 text-right tabular-nums font-bold">{fmt.money(p.netPay)}</td>
                    <td className="p-3 text-center text-xs">
                      <span
                        className={`px-2 py-0.5 rounded ${p.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => downloadPdf(p.id, name, p.periodYear, p.periodMonth)}
                      >
                        <Download size={14} />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

export default ReportPayslip;
