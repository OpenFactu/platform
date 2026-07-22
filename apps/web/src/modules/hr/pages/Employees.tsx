import { employeesApi, departmentsApi } from '../api';
import type { Employee } from '../domain/employee';
import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Input, useToast, Badge, usePopup } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { UserRound, Plus, Trash2, Pencil } from 'lucide-react';
import { PluginFieldsPanel } from '@/components/PluginFieldsPanel';
import { validateIban, formatIban, normalizeIban } from '@/utils/bankValidation';
import { ContextMenu } from '@/components/common/ContextMenu';
import { withRowContextMenu } from '@/components/common/withRowContextMenu';
import { useContextMenu } from '@/hooks/useContextMenu';
import { ApiError } from '@/shared/http';
import { crudApi } from '@/shared/api';
import { costCentersApi } from '@/modules/analytics/api/internalOrdersApi';

const STATUS_VARIANTS: Record<string, any> = {
  active: 'success',
  leave: 'warning',
  terminated: 'neutral',
};
const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  leave: 'Baja',
  terminated: 'Baja definitiva',
};

export const Employees: React.FC = () => {
  const { token, user } = useAuth();
  const location = useLocation();
  const canWrite =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.write;
  const canDelete =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.delete;

  const [rows, setRows] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [usersAvailable, setUsersAvailable] = useState<
    Array<{ id: string; username: string; email: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<Partial<Employee>>({});
  const [pluginValues, setPluginValues] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  const popup = usePopup();


  const fetchAll = async () => {
    setLoading(true);
    try {
      const [e, d, c, u] = await Promise.all([
        employeesApi.list(),
        departmentsApi.list(),
        costCentersApi.list(),
        crudApi
          .list<{ id: string; username: string; email: string }>('/api/users')
          .catch(() => []),
      ]);
      setRows(Array.isArray(e) ? e : []);
      setDepartments(Array.isArray(d) ? d : []);
      setCostCenters(Array.isArray(c) ? c : []);
      setUsersAvailable(Array.isArray(u) ? u : []);
    } catch {
      toast.error('Error al cargar empleados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) fetchAll();
  }, [user?.tenantId]);

  const openCreate = () => {
    setEditing(null);
    setForm({ status: 'active' });
    setPluginValues({});
  };
  const openEdit = (r: Employee) => {
    setEditing(r);
    setForm(r);
    setPluginValues(r);
  };
  const closeForm = () => {
    setEditing(null);
    setForm({});
    setPluginValues({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName) {
      toast.error('Nombre y apellidos son obligatorios');
      return;
    }
    if (form.iban) {
      const check = validateIban(form.iban);
      if (!check.ok) {
        toast.error(`IBAN inválido: ${check.reason}`);
        return;
      }
    }
    setSubmitting(true);
    try {
      // `pluginValues` puede contener los mismos campos del core al cargar el
      // registro (ver openEdit → setPluginValues(r)). Si los spreads se ponen
      // como `{...form, ...pluginValues}` machaca los cambios del formulario
      // con los valores originales. Form tiene que ganar.
      const payload = { ...pluginValues, ...form };
      if (editing) {
        await employeesApi.update(editing.id, payload);
      } else {
        await employeesApi.create(payload);
      }
      toast.success(editing ? 'Empleado actualizado' : 'Empleado creado');
      closeForm();
      fetchAll();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error de red',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await popup.confirm({
      title: 'Eliminar empleado',
      message: 'Se eliminará el empleado y sus contratos asociados. No se puede deshacer.',
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await employeesApi.remove(id);
      toast.success('Empleado eliminado');
      fetchAll();
    } catch (e) {
      toast.error(
        e instanceof ApiError ? ((e.body as any)?.error ?? e.message) : 'Error al eliminar',
      );
    }
  };

  const deptMap = Object.fromEntries(departments.map((d) => [d.id, d]));

  const columns = [
    {
      header: 'Código',
      accessor: 'code',
      sortable: true,
      sortAccessor: (r: any) => r.code,
      primary: true,
    },
    {
      header: 'Nombre completo',
      cell: (r: Employee) => `${r.firstName} ${r.lastName}`,
      sortable: true,
      sortAccessor: (r: Employee) => `${r.lastName} ${r.firstName}`,
    },
    { header: 'Email', accessor: 'email' },
    {
      header: 'Departamento',
      cell: (r: Employee) => (r.departmentId ? deptMap[r.departmentId]?.name : '—'),
    },
    {
      header: 'Estado',
      cell: (r: Employee) => (
        <Badge variant={STATUS_VARIANTS[r.status]}>{STATUS_LABELS[r.status]}</Badge>
      ),
    },
    {
      header: 'Acciones',
      align: 'right' as const,
      cell: (r: Employee) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openEdit(r);
            }}
            disabled={!canWrite}
            className={`transition-colors ${canWrite ? 'text-slate-500 hover:text-blue-600' : 'text-slate-300 cursor-not-allowed'}`}
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (canDelete) handleDelete(r.id);
            }}
            disabled={!canDelete}
            className={`transition-colors ${canDelete ? 'text-slate-400 hover:text-red-500' : 'text-slate-200 cursor-not-allowed'}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  const ctxMenu = useContextMenu<Employee>();
  const ctxColumns = withRowContextMenu(columns, (e, item) => ctxMenu.open(e, item));
  const buildCtxItems = (r: Employee) => [
    { label: 'Editar', icon: <Pencil size={14} />, disabled: !canWrite, onClick: () => openEdit(r) },
    {
      label: 'Eliminar',
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => handleDelete(r.id),
    },
  ];

  const formOpen = editing !== null || Object.keys(form).length > 0;

  return (
    <div className="p-4 w-full space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-3 tracking-tight">
            <UserRound className="text-blue-600 dark:text-blue-300" size={32} />
            Empleados
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Maestro de personal. La nómina se imputa al centro de coste del empleado.
          </p>
        </div>
        {canWrite && (
          <Button onClick={openCreate} className="flex items-center gap-2">
            <Plus size={18} />
            Nuevo empleado
          </Button>
        )}
      </div>

      {formOpen && (
        <Card className="p-6 border-blue-50 shadow-lg" noPadding>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Código"
                placeholder={editing ? '' : 'Auto (EMP-00001)'}
                value={form.code || ''}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
              <Input
                label="Nombre"
                value={form.firstName || ''}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                required
              />
              <Input
                label="Apellidos"
                value={form.lastName || ''}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="DNI"
                value={form.dni || ''}
                onChange={(e) => setForm({ ...form, dni: e.target.value })}
              />
              <Input
                label="Email"
                type="email"
                value={form.email || ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <Input
                label="Teléfono"
                value={form.phone || ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                type="date"
                label="Fecha nacimiento"
                value={form.birthDate ? form.birthDate.substring(0, 10) : ''}
                onChange={(e) => setForm({ ...form, birthDate: e.target.value || null })}
              />
              <Input
                type="date"
                label="Fecha alta"
                value={form.hireDate ? form.hireDate.substring(0, 10) : ''}
                onChange={(e) => setForm({ ...form, hireDate: e.target.value || null })}
              />
              <Input
                type="date"
                label="Fecha baja"
                value={form.terminationDate ? form.terminationDate.substring(0, 10) : ''}
                onChange={(e) => setForm({ ...form, terminationDate: e.target.value || null })}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Departamento
                </label>
                <select
                  value={form.departmentId || ''}
                  onChange={(e) => setForm({ ...form, departmentId: e.target.value || null })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                >
                  <option value="">— sin asignar —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} — {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Centro de coste
                </label>
                <select
                  value={form.costCenterId || ''}
                  onChange={(e) => setForm({ ...form, costCenterId: e.target.value || null })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                >
                  <option value="">— sin asignar —</option>
                  {costCenters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Estado
                </label>
                <select
                  value={form.status || 'active'}
                  onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                >
                  <option value="active">Activo</option>
                  <option value="leave">Baja temporal</option>
                  <option value="terminated">Baja definitiva</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Usuario asociado
              </label>
              <select
                value={(form as any).userId || ''}
                onChange={(e) => setForm({ ...form, userId: e.target.value || null } as any)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              >
                <option value="">— sin vincular (no podrá iniciar sesión) —</option>
                {usersAvailable.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username} · {u.email}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Vincula este empleado a un usuario del sistema. Si el empleado es repartidor, crea
                primero el usuario con rol <b>DRIVER</b> en Usuarios y selecciónalo aquí.
              </p>
            </div>
            <div>
              <Input
                label="IBAN"
                placeholder="ES91 2100 0418 4502 0005 1332"
                value={form.iban || ''}
                onChange={(e) => setForm({ ...form, iban: e.target.value.toUpperCase() })}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (!v) return;
                  const check = validateIban(v);
                  if (check.ok) {
                    setForm((f) => ({ ...f, iban: formatIban(normalizeIban(v)) }));
                  } else {
                    toast.error(`IBAN inválido: ${check.reason}`);
                  }
                }}
              />
              {form.iban && !validateIban(form.iban).ok && (
                <p className="text-xs text-red-600 mt-1">{validateIban(form.iban).reason}</p>
              )}
            </div>
            <div>
              <Input
                label="PIN de fichaje (kiosko)"
                placeholder="4-8 dígitos"
                value={form.kioskPin || ''}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 8);
                  setForm({ ...form, kioskPin: v || null });
                }}
                inputMode="numeric"
                maxLength={8}
              />
              <p className="text-xs text-slate-500 mt-1">
                Lo usa el empleado para fichar en kioskos compartidos. Debe ser único por empresa.
              </p>
            </div>
            <Input
              label="Notas"
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />

            <PluginFieldsPanel
              tableName="Employee"
              values={pluginValues}
              onChange={(k, v) => setPluginValues((prev) => ({ ...prev, [k]: v }))}
              layout="inline"
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={closeForm}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {editing ? 'Guardar cambios' : 'Crear empleado'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden border-slate-100 dark:border-slate-800" noPadding>
        <Table
          columns={ctxColumns}
          data={rows}
          isLoading={loading}
          onRowClick={(r: any) => openEdit(r)}
        />
      </Card>
      {ctxMenu.state && (
        <ContextMenu
          x={ctxMenu.state.x}
          y={ctxMenu.state.y}
          items={buildCtxItems(ctxMenu.state.data)}
          onClose={ctxMenu.close}
        />
      )}
    </div>
  );
};

export default Employees;
