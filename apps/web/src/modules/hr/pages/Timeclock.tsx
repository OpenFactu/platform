import { timeclockApi, employeesApi } from '../api';
import type { TimeclockEntry as Entry } from '../domain/timeclock';
import type { Employee } from '../domain/employee';
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Badge, useToast } from '@openfactu/ui';
import type { BadgeProps } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { Timer, LogIn, LogOut, Coffee, RotateCcw, Download } from 'lucide-react';
import { exportToXlsx } from '@/utils/exportXlsx';
import { ApiError } from '@/shared/http';

const KIND_LABEL: Record<string, string> = {
  in: 'Entrada',
  out: 'Salida',
  break_start: 'Inicio pausa',
  break_end: 'Fin pausa',
};
const KIND_VARIANT: Record<string, BadgeProps['variant']> = {
  in: 'success',
  out: 'info',
  break_start: 'warning',
  break_end: 'neutral',
};

export const Timeclock: React.FC = () => {
  const { token, user } = useAuth();
  const isAdmin = (user?.role || '').toLowerCase() === 'admin' || (user as any)?.isAdmin;
  const [tab, setTab] = useState<'me' | 'all'>('me');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [employee, setEmployee] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Vista admin: todos los fichajes con filtros.
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const [filters, setFilters] = useState({
    employeeId: '',
    from: monthStart,
    to: today.toISOString().slice(0, 10),
  });
  const toast = useToast();
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );

  // Descarga los fichajes como .xlsx con formato: pide el JSON al endpoint de
  // export y genera la hoja en cliente (utils/exportXlsx).
  const exportEntriesExcel = async (params: URLSearchParams, filename: string, title: string) => {
    let data;
    try {
      data = await timeclockApi.exportJson(Object.fromEntries(params));
    } catch {
      toast.error('No se pudo exportar');
      return;
    }
    await exportToXlsx({
      filename,
      sheetName: 'Fichajes',
      title,
      columns: [
        { key: 'fecha', label: 'Fecha', type: 'date', width: 12 },
        { key: 'hora', label: 'Hora', width: 10 },
        { key: 'empleadoCodigo', label: 'Código', width: 10 },
        { key: 'empleadoNombre', label: 'Nombre', width: 28 },
        { key: 'tipo', label: 'Tipo', width: 14, format: (v) => KIND_LABEL[v] || v },
        { key: 'origen', label: 'Origen', width: 10 },
        { key: 'notas', label: 'Notas', width: 40 },
      ],
      rows: data,
    });
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const d = await timeclockApi.me();
      setEmployee(d.employee);
      setEntries(Array.isArray(d.entries) ? d.entries : []);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? ((err.body as any)?.error ?? err.message)
          : 'No hay empleado vinculado',
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (user?.tenantId) fetchAll();
  }, [user?.tenantId]);

  const fetchAllAdmin = async () => {
    if (!isAdmin) return;
    const [e, en] = await Promise.all([
      employeesApi.list(),
      timeclockApi.entries({
        employeeId: filters.employeeId || undefined,
        from: filters.from || undefined,
        to: filters.to ? filters.to + 'T23:59:59' : undefined,
      }),
    ]);
    setAllEmployees(Array.isArray(e) ? e : []);
    setAllEntries(Array.isArray(en) ? en : []);
  };

  useEffect(() => {
    if (tab === 'all' && isAdmin && user?.tenantId) fetchAllAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filters.employeeId, filters.from, filters.to, user?.tenantId]);

  const punch = async (kind: Entry['kind']) => {
    let coords: { latitude?: number; longitude?: number } = {};
    if (navigator.geolocation) {
      try {
        coords = await new Promise<any>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
            reject,
            { timeout: 3000 },
          );
        });
      } catch {
        // sin geo
      }
    }
    try {
      await timeclockApi.punch({ kind, ...coords, device: navigator.userAgent });
      toast.success(`Fichaje "${KIND_LABEL[kind]}" registrado`);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error');
    }
  };

  const last = entries[0];

  return (
    <div className="p-4 w-full space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <Timer className="text-emerald-600" size={32} /> Fichajes
          </h1>
          {tab === 'me' && employee && (
            <p className="text-slate-500">
              {employee.firstName} {employee.lastName} ({employee.code})
            </p>
          )}
          {tab === 'all' && (
            <p className="text-slate-500">Vista de todos los empleados (administración)</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button
                onClick={() => setTab('me')}
                className={
                  'px-3 py-1.5 text-sm font-bold transition ' +
                  (tab === 'me'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800')
                }
              >
                Mis fichajes
              </button>
              <button
                onClick={() => setTab('all')}
                className={
                  'px-3 py-1.5 text-sm font-bold transition ' +
                  (tab === 'all'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800')
                }
              >
                Todos
              </button>
            </div>
          )}
          {tab === 'me' && employee && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                exportEntriesExcel(
                  new URLSearchParams({ employeeId: employee.id, from: monthStart }),
                  `mis_fichajes_${monthStart}`,
                  `Mis fichajes · desde ${monthStart}`,
                )
              }
            >
              <Download size={14} /> Exportar mes
            </Button>
          )}
          {tab === 'all' && isAdmin && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const params = new URLSearchParams();
                if (filters.employeeId) params.set('employeeId', filters.employeeId);
                if (filters.from) params.set('from', filters.from);
                if (filters.to) params.set('to', filters.to);
                exportEntriesExcel(
                  params,
                  `fichajes_${filters.from}_${filters.to}`,
                  `Fichajes · ${filters.from} a ${filters.to}`,
                );
              }}
            >
              <Download size={14} /> Exportar Excel
            </Button>
          )}
        </div>
      </div>

      {tab === 'me' && (
        <>
          <Card className="p-6" noPadding>
            <div className="p-6 space-y-4">
              <div className="text-sm text-slate-500">
                Último fichaje:{' '}
                {last ? (
                  <span>
                    <Badge variant={KIND_VARIANT[last.kind]}>{KIND_LABEL[last.kind]}</Badge>{' '}
                    <span className="font-mono">{new Date(last.at).toLocaleString('es-ES')}</span>
                  </span>
                ) : (
                  <span className="italic">aún no has fichado en los últimos 31 días</span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Button onClick={() => punch('in')} className="flex items-center gap-2">
                  <LogIn size={18} /> Entrada
                </Button>
                <Button onClick={() => punch('break_start')} variant="secondary">
                  <Coffee size={18} /> Inicio pausa
                </Button>
                <Button onClick={() => punch('break_end')} variant="secondary">
                  <RotateCcw size={18} /> Fin pausa
                </Button>
                <Button onClick={() => punch('out')} className="flex items-center gap-2">
                  <LogOut size={18} /> Salida
                </Button>
              </div>
            </div>
          </Card>

          <Card noPadding>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b">
                  <th className="p-3">Fecha y hora</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3">Origen</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-slate-400">
                      Cargando…
                    </td>
                  </tr>
                )}
                {!loading &&
                  entries.map((e) => (
                    <tr key={e.id} className="border-b">
                      <td className="p-3 font-mono">{new Date(e.at).toLocaleString('es-ES')}</td>
                      <td className="p-3">
                        <Badge variant={KIND_VARIANT[e.kind]}>{KIND_LABEL[e.kind]}</Badge>
                      </td>
                      <td className="p-3 text-xs text-slate-500">{e.source}</td>
                    </tr>
                  ))}
                {!loading && entries.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-slate-400 italic">
                      Sin fichajes
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab === 'all' && isAdmin && (
        <>
          <Card className="p-4" noPadding>
            <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Empleado
                </label>
                <select
                  value={filters.employeeId}
                  onChange={(e) => setFilters({ ...filters, employeeId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                >
                  <option value="">Todos</option>
                  {allEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.code} — {e.firstName} {e.lastName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Desde
                </label>
                <input
                  type="date"
                  value={filters.from}
                  onChange={(e) => setFilters({ ...filters, from: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Hasta
                </label>
                <input
                  type="date"
                  value={filters.to}
                  onChange={(e) => setFilters({ ...filters, to: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                />
              </div>
              <div className="text-xs text-slate-500">
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {allEntries.length}
                </span>{' '}
                fichajes en el rango
              </div>
            </div>
          </Card>

          <Card noPadding>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b">
                  <th className="p-3">Fecha y hora</th>
                  <th className="p-3">Empleado</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3">Origen</th>
                  <th className="p-3">Notas</th>
                </tr>
              </thead>
              <tbody>
                {allEntries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400 italic">
                      Sin fichajes en el rango
                    </td>
                  </tr>
                )}
                {allEntries.map((e: any) => {
                  const emp = allEmployees.find((x) => x.id === e.employeeId);
                  return (
                    <tr key={e.id} className="border-b">
                      <td className="p-3 font-mono">{new Date(e.at).toLocaleString('es-ES')}</td>
                      <td className="p-3">
                        {emp ? (
                          <span>
                            <span className="font-bold">
                              {emp.firstName} {emp.lastName}
                            </span>{' '}
                            <span className="text-xs text-slate-400">{emp.code}</span>
                          </span>
                        ) : (
                          e.employeeId
                        )}
                      </td>
                      <td className="p-3">
                        <Badge variant={KIND_VARIANT[e.kind]}>{KIND_LABEL[e.kind]}</Badge>
                      </td>
                      <td className="p-3 text-xs text-slate-500">{e.source}</td>
                      <td className="p-3 text-xs text-slate-500 truncate max-w-xs">{e.notes}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
};

export default Timeclock;
