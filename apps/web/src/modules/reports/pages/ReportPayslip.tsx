import React, { useEffect, useState } from 'react';
import { Card, Button, Badge, PageHeader, Table, useToast } from '@openfactu/ui';
import type { RowAction, TableColumn } from '@openfactu/ui';
import { ArrowLeft, Download, Banknote } from 'lucide-react';
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
    Promise.all([reportsApi.get<any>('/api/hr/payrolls'), reportsApi.get<any>('/api/hr/employees')])
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

  /** Nombre del empleado de la nómina (o su id si no se ha cargado la ficha). */
  const nameOf = (p: any) => {
    const emp = employees[p.employeeId];
    return emp ? `${emp.firstName} ${emp.lastName}` : p.employeeId;
  };

  const download = (p: any) => downloadPdf(p.id, nameOf(p), p.periodYear, p.periodMonth);

  const columns: TableColumn<any>[] = [
    {
      header: 'Empleado',
      cell: (p) => nameOf(p),
      sortable: true,
      sortAccessor: (p) => nameOf(p),
      primary: true,
    },
    {
      header: 'Período',
      cell: (p) => `${p.periodYear}-${String(p.periodMonth).padStart(2, '0')}`,
      sortable: true,
      sortAccessor: (p) => `${p.periodYear}-${String(p.periodMonth).padStart(2, '0')}`,
      className: 'font-mono text-xs',
    },
    { header: 'Bruto', cell: (p) => fmt.money(p.gross), align: 'right' },
    {
      header: 'Neto',
      cell: (p) => fmt.money(p.netPay),
      align: 'right',
      className: 'font-bold',
    },
    {
      header: 'Estado',
      align: 'center',
      cell: (p) => (
        <Badge variant={p.status === 'approved' ? 'success' : 'neutral'}>{p.status}</Badge>
      ),
    },
  ];

  // La descarga era un botón por fila; ahora vive en el menú ⋯ (y en el click
  // derecho), además del click en la fila que ya prometía la cabecera.
  const rowActions = (p: any): RowAction[] => [
    { label: 'Descargar recibo', icon: <Download size={14} />, onClick: () => download(p) },
  ];

  return (
    <div className="p-6 w-full space-y-5">
      <PageHeader
        title="Recibo de nómina"
        subtitle="Selecciona una nómina aprobada para descargar el recibo."
        icon={<Banknote size={18} />}
        size="md"
        breadcrumbs={
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={12} className="mr-1" /> Volver
          </Button>
        }
      />

      <Card className="overflow-hidden" noPadding>
        <Table
          columns={columns}
          data={payrolls}
          isLoading={loading}
          emptyMessage="Sin nóminas"
          onRowClick={download}
          rowActions={rowActions}
        />
      </Card>
    </div>
  );
};

export default ReportPayslip;
