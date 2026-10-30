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
  Modal,
} from '@openfactu/ui';
import type { BadgeProps, RowAction } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { AlertTriangle, Plus, UserCheck, Check, Ban } from 'lucide-react';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import { formatDateTime } from '@/i18n/format';

// Claves de i18n; se traducen al pintar.
const STATUS_LABEL: Record<string, string> = {
  pending: 'hr.incidentStatus.pending',
  approved: 'hr.incidentStatus.approved',
  rejected: 'hr.incidentStatus.rejected',
  covered: 'hr.incidentStatus.covered',
};
const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  pending: 'warning',
  approved: 'info',
  rejected: 'error',
  covered: 'success',
};

export const Incidents: React.FC = () => {
  const { t } = useI18n();
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
      toast.error(t('hr.incidents.required'));
      return;
    }
    try {
      await incidentsApi.create(form);
      toast.success(t('hr.incidents.created'));
      setCreating(false);
      setForm({ employeeId: '', incidentTypeId: '', startAt: '', endAt: '', notes: '' });
      fetchAll();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : t('hr.common.error'),
      );
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
      header: t('hr.common.employee'),
      cell: (r: Incident) =>
        empMap[r.employeeId]
          ? `${empMap[r.employeeId].firstName} ${empMap[r.employeeId].lastName}`
          : r.employeeId,
    },
    {
      header: t('hr.incidents.type'),
      cell: (r: Incident) => typeMap[r.incidentTypeId]?.name || r.incidentTypeId,
    },
    { header: t('hr.common.from'), cell: (r: Incident) => formatDateTime(r.startAt) },
    {
      header: t('hr.common.to'),
      cell: (r: Incident) => (r.endAt ? formatDateTime(r.endAt) : '—'),
    },
    {
      header: t('hr.common.status'),
      cell: (r: Incident) => (
        <Badge variant={STATUS_VARIANT[r.status]}>{t(STATUS_LABEL[r.status])}</Badge>
      ),
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que las condiciones de estado
  // (pendiente / aprobada) se declaran una vez en lugar de duplicarse.
  const rowActions = (r: Incident): RowAction[] => {
    const type = typeMap[r.incidentTypeId];
    return [
      ...(r.status === 'pending'
        ? [
            {
              label: t('hr.incidents.approve'),
              icon: <Check size={14} />,
              onClick: () => setStatus(r, 'approved'),
            },
            {
              label: t('hr.incidents.reject'),
              icon: <Ban size={14} />,
              destructive: true,
              onClick: () => setStatus(r, 'rejected'),
            },
          ]
        : []),
      ...(r.status === 'approved' && type?.requiresSubstitution
        ? [
            {
              label: t('hr.incidents.assignSub'),
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
        title={t('hr.incidents.title')}
        subtitle={t('hr.incidents.subtitle')}
        icon={<AlertTriangle size={18} />}
        size="lg"
        actions={
          <Button type="button" size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> {t('hr.incidents.new')}
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
                <label className="block text-sm mb-1">{t('hr.common.employee')}</label>
                <SearchableSelect
                  options={employeeOptions}
                  value={form.employeeId}
                  onChange={(v) => setForm({ ...form, employeeId: v })}
                  placeholder={t('hrTime.shiftPatterns.selectPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('hr.incidents.type')}</label>
                <SearchableSelect
                  options={typeOptions}
                  value={form.incidentTypeId}
                  onChange={(v) => setForm({ ...form, incidentTypeId: v })}
                  placeholder={t('hrTime.shiftPatterns.selectPlaceholder')}
                />
              </div>
              <Input
                label={t('hr.common.from')}
                type="datetime-local"
                value={form.startAt}
                onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                required
              />
              <Input
                label={t('hr.common.to')}
                type="datetime-local"
                value={form.endAt}
                onChange={(e) => setForm({ ...form, endAt: e.target.value })}
              />
              <div className="md:col-span-2">
                <Input
                  label={t('hr.common.notes')}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
                {t('hr.common.cancel')}
              </Button>
              <Button type="submit">{t('hr.common.create')}</Button>
            </div>
          </form>
        </Card>
      )}

      <Card noPadding>
        <Table
          className="max-md:p-3"
          columns={columns}
          data={rows}
          isLoading={loading}
          rowActions={rowActions}
        />
      </Card>

      <Modal
        isOpen={!!substituting}
        onClose={() => setSubstituting(null)}
        title={t('hr.incidents.suggestSub')}
        size="2xl"
        hideCancel
        footer={
          <Button type="button" variant="secondary" onClick={() => setSubstituting(null)}>
            {t('hr.common.close')}
          </Button>
        }
      >
        {substituteOptions.length === 0 ? (
          <EmptyState
            icon={<UserCheck size={18} />}
            title={t('hr.incidents.noCandidates')}
            hint={t('hr.incidents.noCandidatesHint')}
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
                <Button onClick={() => assignSubstitute(c.id)}>{t('hr.incidents.assign')}</Button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
};

export default Incidents;
