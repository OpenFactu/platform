import { hrApi } from '../api';
import React, { useEffect, useMemo, useState } from 'react';
import { Table, Card, Button, Input, useToast, Badge } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { AlertTriangle, Plus, UserCheck, X, Check, Ban } from 'lucide-react';
import { ContextMenu } from '@/components/common/ContextMenu';
import { withRowContextMenu } from '@/components/common/withRowContextMenu';
import { useContextMenu } from '@/hooks/useContextMenu';

interface Incident {
  id: string;
  employeeId: string;
  incidentTypeId: string;
  startAt: string;
  endAt: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'covered';
  notes: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  covered: 'Cubierta',
};
const STATUS_VARIANT: Record<string, any> = {
  pending: 'warning',
  approved: 'info',
  rejected: 'danger',
  covered: 'success',
};

export const Incidents: React.FC = () => {
  const { token, user } = useAuth();
  const [rows, setRows] = useState<Incident[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
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
        hrApi.get<any>('/api/hr/incidents'),
        hrApi.get<any>('/api/hr/employees'),
        hrApi.get<any>('/api/hr/incident-types'),
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

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeeId || !form.incidentTypeId || !form.startAt) {
      toast.error('Empleado, tipo y fecha de inicio son obligatorios');
      return;
    }
    const r = await hrApi.raw('POST', '/api/hr/incidents', form);
    if (!r.ok) {
      const d = r.data;
      toast.error(d.error);
      return;
    }
    toast.success('Incidencia registrada');
    setCreating(false);
    setForm({ employeeId: '', incidentTypeId: '', startAt: '', endAt: '', notes: '' });
    fetchAll();
  };

  const setStatus = async (i: Incident, status: 'approved' | 'rejected') => {
    await hrApi.raw('PATCH', `/api/hr/incidents/${i.id}`, { status });
    fetchAll();
  };

  const openSubstitute = async (i: Incident) => {
    setSubstituting(i);
    const r = await hrApi.raw('POST', `/api/hr/incidents/${i.id}/suggest-substitutes`);
    const d = r.data;
    setSubstituteOptions(Array.isArray(d) ? d : []);
  };

  const assignSubstitute = async (substituteEmployeeId: string) => {
    if (!substituting) return;
    await hrApi.raw('POST', `/api/hr/incidents/${substituting.id}/assign-substitute`, { substituteEmployeeId });
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
    {
      header: 'Acciones',
      align: 'right' as const,
      cell: (r: Incident) => {
        const t = typeMap[r.incidentTypeId];
        return (
          <div className="flex items-center justify-end gap-2">
            {r.status === 'pending' && (
              <>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setStatus(r, 'approved')}
                  title="Aprobar"
                >
                  <Check size={14} /> Aprobar
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setStatus(r, 'rejected')}
                  title="Rechazar"
                >
                  <Ban size={14} /> Rechazar
                </Button>
              </>
            )}
            {r.status === 'approved' && t?.requiresSubstitution && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => openSubstitute(r)}
                title="Asignar sustituto"
              >
                <UserCheck size={14} /> Sustituto
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const ctxMenu = useContextMenu<Incident>();
  const ctxColumns = withRowContextMenu(columns, (e, item) => ctxMenu.open(e, item));
  const buildCtxItems = (r: Incident) => {
    const t = typeMap[r.incidentTypeId];
    return [
      ...(r.status === 'pending'
        ? [
            { label: 'Aprobar', icon: <Check size={14} />, onClick: () => setStatus(r, 'approved') },
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <AlertTriangle className="text-amber-500" size={32} /> Incidencias
          </h1>
          <p className="text-slate-500">Ausencias, retrasos, bajas, sustituciones.</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus size={14} /> Nueva incidencia
        </Button>
      </div>

      {creating && (
        <Card noPadding>
          <form onSubmit={create} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1">Empleado</label>
                <select
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-900"
                  required
                >
                  <option value="">— seleccionar —</option>
                  {employees
                    .filter((e: any) => e.status === 'active')
                    .map((e: any) => (
                      <option key={e.id} value={e.id}>
                        {e.code} — {e.firstName} {e.lastName}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Tipo</label>
                <select
                  value={form.incidentTypeId}
                  onChange={(e) => setForm({ ...form, incidentTypeId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-900"
                  required
                >
                  <option value="">— seleccionar —</option>
                  {types
                    .filter((t: any) => t.isActive)
                    .map((t: any) => (
                      <option key={t.id} value={t.id}>
                        {t.code} — {t.name}
                      </option>
                    ))}
                </select>
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
        <Table columns={ctxColumns} data={rows} isLoading={loading} />
      </Card>
      {ctxMenu.state && (
        <ContextMenu
          x={ctxMenu.state.x}
          y={ctxMenu.state.y}
          items={buildCtxItems(ctxMenu.state.data)}
          onClose={ctxMenu.close}
        />
      )}

      {substituting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-w-2xl w-full p-6" noPadding>
            <div className="p-6 space-y-3">
              <div className="flex items-start justify-between">
                <h2 className="text-xl font-bold">Sugerir sustituto</h2>
                <button onClick={() => setSubstituting(null)}>
                  <X size={20} />
                </button>
              </div>
              {substituteOptions.length === 0 ? (
                <p className="text-sm text-slate-500 italic py-4">
                  No hay candidatos elegibles. Filtros: mismo departamento, sin turno solapado, sin
                  incidencia propia activa.
                </p>
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
