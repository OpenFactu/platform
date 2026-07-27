import { timeclockApi, employeesApi } from '../api';
import type { TimeclockEntry as Entry } from '../domain/timeclock';
import type { Employee } from '../domain/employee';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Button,
  Badge,
  useToast,
  PageHeader,
  Tabs,
  DatePicker,
  SearchableSelect,
  Table,
} from '@openfactu/ui';
import type { BadgeProps, TableColumn } from '@openfactu/ui';
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

// Vistas de la página (sólo visibles para admin).
const TABS = [
  { key: 'me', label: 'Mis fichajes' },
  { key: 'all', label: 'Todos' },
];

export const Timeclock: React.FC = () => {
  const { token, user } = useAuth();
  // La pestaña "todos" enseña los fichajes del resto de la plantilla, así que
  // va por rol y no por permiso de ruta. Antes comparaba contra 'admin' en
  // minúsculas, lo que dejaba fuera a SUPERUSER, y caía en un `user.isAdmin`
  // que no existe en el tipo `User`.
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERUSER';
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

  // Opciones del desplegable de empleados (maestro del servidor).
  const employeeOptions = useMemo(
    () =>
      allEmployees.map((e) => ({
        value: e.id,
        label: `${e.firstName} ${e.lastName}`,
        secondaryLabel: e.code,
      })),
    [allEmployees],
  );

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

  // Índice de empleados para resolver el nombre en la vista de administración
  // sin recorrer la lista por fila.
  const employeeById = useMemo(
    () => Object.fromEntries(allEmployees.map((e) => [e.id, e])),
    [allEmployees],
  );

  const whenColumn: TableColumn<Entry> = {
    header: 'Fecha y hora',
    sortable: true,
    sortAccessor: (e) => e.at,
    cell: (e) => <span className="font-mono">{new Date(e.at).toLocaleString('es-ES')}</span>,
    primary: true,
  };
  const kindColumn: TableColumn<Entry> = {
    header: 'Tipo',
    sortable: true,
    sortAccessor: (e) => e.kind,
    cell: (e) => <Badge variant={KIND_VARIANT[e.kind]}>{KIND_LABEL[e.kind]}</Badge>,
  };
  const sourceColumn: TableColumn<Entry> = {
    header: 'Origen',
    sortable: true,
    sortAccessor: (e) => e.source || '',
    cell: (e) => <span className="text-xs text-fg-muted">{e.source}</span>,
  };

  const myColumns: TableColumn<Entry>[] = [whenColumn, kindColumn, sourceColumn];

  const allColumns: TableColumn<Entry>[] = [
    whenColumn,
    {
      header: 'Empleado',
      sortable: true,
      sortAccessor: (e) => {
        const emp = employeeById[e.employeeId ?? ''];
        return emp ? `${emp.firstName} ${emp.lastName}` : (e.employeeId ?? '');
      },
      cell: (e) => {
        const emp = employeeById[e.employeeId ?? ''];
        return emp ? (
          <span>
            <span className="font-bold">
              {emp.firstName} {emp.lastName}
            </span>{' '}
            <span className="text-xs text-fg-subtle">{emp.code}</span>
          </span>
        ) : (
          e.employeeId
        );
      },
    },
    kindColumn,
    sourceColumn,
    {
      header: 'Notas',
      cell: (e) => <span className="text-xs text-fg-muted truncate max-w-xs block">{e.notes}</span>,
    },
  ];

  return (
    <div className="p-4 w-full space-y-5">
      <PageHeader
        title="Fichajes"
        subtitle={
          tab === 'me' && employee
            ? `${employee.firstName} ${employee.lastName} (${employee.code})`
            : tab === 'all'
              ? 'Vista de todos los empleados (administración)'
              : undefined
        }
        icon={<Timer size={18} />}
        size="lg"
        actions={
          <div className="flex items-center gap-2">
            {/* Lo que cambia es la vista completa, no un filtro → Tabs. */}
            {isAdmin && (
              <Tabs
                items={TABS}
                value={tab}
                onChange={(k) => setTab(k as 'me' | 'all')}
                variant="segmented"
                size="sm"
              />
            )}
            {tab === 'me' && employee && (
              <Button
                type="button"
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
                type="button"
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
        }
      />

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

          <Card className="overflow-hidden" noPadding>
            <Table
              columns={myColumns}
              data={entries}
              isLoading={loading}
              emptyMessage="Sin fichajes"
            />
          </Card>
        </>
      )}

      {tab === 'all' && isAdmin && (
        <>
          <Card className="p-4" noPadding>
            <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div>
                {/* SearchableSelect no tiene prop `label` → se conserva el
                    <label> suelto. El vacío es válido («Todos») → clearable. */}
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Empleado
                </label>
                <SearchableSelect
                  options={employeeOptions}
                  value={filters.employeeId}
                  onChange={(v) => setFilters({ ...filters, employeeId: v })}
                  placeholder="Todos"
                  clearable
                />
              </div>
              {/* El rango se guarda como '' cuando se vacía, igual que hacía el
                  <input type="date">. */}
              <DatePicker
                label="Desde"
                value={filters.from || null}
                onChange={(v) => setFilters({ ...filters, from: v ?? '' })}
              />
              <DatePicker
                label="Hasta"
                value={filters.to || null}
                onChange={(v) => setFilters({ ...filters, to: v ?? '' })}
              />
              <div className="text-xs text-slate-500">
                <span className="font-bold text-fg-body">{allEntries.length}</span> fichajes en el
                rango
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden" noPadding>
            <Table columns={allColumns} data={allEntries} emptyMessage="Sin fichajes en el rango" />
          </Card>
        </>
      )}
    </div>
  );
};

export default Timeclock;
