import { incidentsApi, employeesApi, incidentTypesApi } from '../api';
import type { Incident } from '../domain/incident';
import type { Employee } from '../domain/employee';
import type { IncidentType } from '../domain/incident';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Table,
  Card,
  Button,
  Input,
  useToast,
  Badge,
  SearchableSelect,
  EmptyState,
  PageHeader,
} from '@openfactu/ui';
import type { BadgeProps, RowAction } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { AlertTriangle, Plus, UserCheck, X, Check, Ban } from 'lucide-react';
import { ApiError } from '@/shared/http';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  covered: 'Cubierta',
};
const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  pending: 'warning',
  approved: 'info',
  rejected: 'error',
  covered: 'success',
};

export const Incidents: React.FC = () => {
  const { token, user } = useAuth();
  const [rows, setRows] = useState<Incident[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [types, setTypes] = useState<IncidentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [substituting, setSubstituting] = useState<Incident | null>(null);
  const [substituteOptions, setSubstituteOptions] = useState<any[]>([]);
  const [form, setForm] = useState<any>({
    employeeId: '',
    incidentTypeId: '',
    startAt: '',
    endAt: '',
    notes: '',
  });
  const toast = useToast();
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [i, e, t] = await Promise.all([
        incidentsApi.list(),
        employeesApi.list(),
        incidentTypesApi.list(),
      ]);
      setRows(Array.isArray(i) ? i : []);
      setEmployees(Array.isArray(e) ? e : []);
      setTypes(Array.isArray(t) ? t : []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (user?.tenantId) fetchAll();
  }, [user?.tenantId]);

  const empMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const typeMap = useMemo(() => Object.fromEntries(types.map((t) => [t.id, t])), [types]);

  // Opciones de los desplegables del formulario (maestros del servidor).
  const employeeOptions = useMemo(
    () =>
      employees
        .filter((e) => e.status === 'active')
        .map((e) => ({
          value: e.id,
          label: `${e.firstName} ${e.lastName}`,
          secondaryLabel: e.code,
        })),
    [employees],
  );
  const typeOptions = useMemo(
    () =>
      types
        .filter((t) => t.isActive)
        .map((t) => ({ value: t.id, label: t.name, secondaryLabel: t.code })),
    [types],
  );

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeeId || !form.incidentTypeId || !form.startAt) {
      toast.error('Empleado, tipo y fecha de inicio son obligatorios');
      return;
    }
    try {
      await incidentsApi.create(form);
      toast.success('Incidencia registrada');
      setCreating(false);
      setForm({ employeeId: '', incidentTypeId: '', startAt: '', endAt: '', notes: '' });
      fetchAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error');
    }
  };

  const setStatus = async (i: Incident, status: 'approved' | 'rejected') => {
    await incidentsApi.update(i.id, { status });
    fetchAll();
  };

  const openSubstitute = async (i: Incident) => {
    setSubstituting(i);
    const d = await incidentsApi.suggestSubstitutes(i.id);
    setSubstituteOptions(Array.isArray(d) ? d : []);
  };

  const assignSubstitute = async (substituteEmployeeId: string) => {
    if (!substituting) return;
    await incidentsApi.assignSubstitute(substituting.id, substituteEmployeeId);
    setSubstituting(null);
    setSubstituteOptions([]);
    fetchAll();
  };

  const columns = [
    {
      header: 'Empleado',
      cell: (r: Incident) =>
        empMap[r.employeeId]
          ? `${empMap[r.employeeId].firstName} ${empMap[r.employeeId].lastName}`
          : r.employeeId,
    },
    { header: 'Tipo', cell: (r: Incident) => typeMap[r.incidentTypeId]?.name || r.incidentTypeId },
    { header: 'Desde', cell: (r: Incident) => new Date(r.startAt).toLocaleString('es-ES') },
    {
      header: 'Hasta',
      cell: (r: Incident) => (r.endAt ? new Date(r.endAt).toLocaleString('es-ES') : '—'),
    },
    {
      header: 'Estado',
      cell: (r: Incident) => (
        <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
      ),
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que las condiciones de estado
  // (pendiente / aprobada) se declaran una vez en lugar de duplicarse.
  const rowActions = (r: Incident): RowAction[] => {
    const t = typeMap[r.incidentTypeId];
    return [
      ...(r.status === 'pending'
        ? [
            {
              label: 'Aprobar',
              icon: <Check size={14} />,
              onClick: () => setStatus(r, 'approved'),
            },
            {
              label: 'Rechazar',
              icon: <Ban size={14} />,
              destructive: true,
              onClick: () => setStatus(r, 'rejected'),
            },
          ]
        : []),
      ...(r.status === 'approved' && t?.requiresSubstitution
        ? [
            {
              label: 'Asignar sustituto',
              icon: <UserCheck size={14} />,
              onClick: () => openSubstitute(r),
            },
          ]
        : []),
    ];
  };

  return (
    <div className="p-4 w-full space-y-6">
      <PageHeader
        title="Incidencias"
        subtitle="Ausencias, retrasos, bajas, sustituciones."
        icon={<AlertTriangle size={18} />}
        size="lg"
        actions={
          <Button type="button" size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> Nueva incidencia
          </Button>
        }
      />

      {creating && (
        <Card noPadding>
          <form onSubmit={create} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                {/* SearchableSelect no tiene prop `label` → se conserva el
                    <label> suelto. El `required` del <select> nativo se pierde,
                    pero `create` ya avisa si falta empleado o tipo. */}
                <label className="block text-sm mb-1">Empleado</label>
                <SearchableSelect
                  options={employeeOptions}
                  value={form.employeeId}
                  onChange={(v) => setForm({ ...form, employeeId: v })}
                  placeholder="— seleccionar —"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Tipo</label>
                <SearchableSelect
                  options={typeOptions}
                  value={form.incidentTypeId}
                  onChange={(v) => setForm({ ...form, incidentTypeId: v })}
                  placeholder="— seleccionar —"
                />
              </div>
              <Input
                label="Desde"
                type="datetime-local"
                value={form.startAt}
                onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                required
              />
              <Input
                label="Hasta"
                type="datetime-local"
                value={form.endAt}
                onChange={(e) => setForm({ ...form, endAt: e.target.value })}
              />
              <div className="md:col-span-2">
                <Input
                  label="Notas"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
                Cancelar
              </Button>
              <Button type="submit">Crear</Button>
            </div>
          </form>
        </Card>
      )}

      <Card noPadding>
        <Table columns={columns} data={rows} isLoading={loading} rowActions={rowActions} />
      </Card>

      {substituting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-w-2xl w-full p-6" noPadding>
            <div className="p-6 space-y-3">
              <div className="flex items-start justify-between">
                <h2 className="text-xl font-bold">Sugerir sustituto</h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSubstituting(null)}
                  title="Cerrar"
                >
                  <X size={20} />
                </Button>
              </div>
              {substituteOptions.length === 0 ? (
                <EmptyState
                  icon={<UserCheck size={18} />}
                  title="No hay candidatos elegibles"
                  hint="Filtros: mismo departamento, sin turno solapado, sin incidencia propia activa."
                />
              ) : (
                <ul className="divide-y">
                  {substituteOptions.map((c) => (
                    <li key={c.id} className="flex items-center justify-between py-2">
                      <div>
                        <div className="font-medium">
                          {c.firstName} {c.lastName}
                        </div>
                        <div className="text-xs text-slate-400">{c.code}</div>
                      </div>
                      <Button onClick={() => assignSubstitute(c.id)}>Asignar</Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Incidents;
