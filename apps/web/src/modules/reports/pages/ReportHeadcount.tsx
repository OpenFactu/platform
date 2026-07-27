import React, { useEffect, useMemo, useState } from 'react';
import { ReportPage } from '../components/ReportPage';
import { useAuth } from '@/context/AuthContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

export const ReportHeadcount: React.FC = () => {
  const { user } = useAuth();
  const fmt = useFormat();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    reportsApi
      .get<any>('/api/reports/headcount')
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user?.tenantId]);

  const columns = useMemo(
    () => [
      { key: 'code', label: 'Código' },
      { key: 'firstName', label: 'Nombre' },
      { key: 'lastName', label: 'Apellidos' },
      { key: 'departmentName', label: 'Departamento' },
      { key: 'hireDate', label: 'Fecha alta', format: (v: any) => (v ? fmt.date(v) : '—') },
      { key: 'terminationDate', label: 'Fecha baja', format: (v: any) => (v ? fmt.date(v) : '—') },
      { key: 'status', label: 'Estado' },
    ],
    [fmt],
  );

  return (
    <ReportPage
      title="Plantilla"
      subtitle="Listado de empleados con fechas, departamento y estado."
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename="plantilla"
    />
  );
};

export default ReportHeadcount;
