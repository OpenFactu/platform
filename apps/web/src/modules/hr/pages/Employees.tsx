import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Card, Button, Input, Badge, PageHeader, useToast, usePopup } from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import { UserRound, Plus, Trash2, ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { costCentersApi } from '@/modules/analytics/api/internalOrdersApi';
import { employeesApi, departmentsApi } from '../api';
import type { Employee } from '../domain/employee';
import { EmployeeCreateWizard } from '../components/EmployeeCreateWizard';
import { EMPLOYEE_STATUS_LABEL } from '../domain/employee';
import { useI18n } from '@/i18n/I18nContext';

export function Employees() {
  const { user } = useAuth();
  return <EmployeeList key={user?.tenantId} />;
}
function EmployeeList() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const popup = usePopup();
  const admin = user?.role === 'ADMIN' || user?.role === 'SUPERUSER';
  const canWrite = admin || !!user?.permissions?.['/hr/employees']?.write;
  const canDelete = admin || !!user?.permissions?.['/hr/employees']?.delete;
  const [rows, setRows] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [costCenters, setCostCenters] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    let active = true;
    void Promise.all([
      employeesApi.list(),
      departmentsApi.list(),
      costCentersApi.list().catch(() => []),
    ])
      .then(([people, dept, cost]) => {
        if (active) {
          setRows(people);
          setDepartments(dept);
          setCostCenters(cost);
        }
      })
      .catch(() => {
        if (active) toast.error(t('hr.employees.loadFailed'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);
  const departmentById = useMemo(
    () => Object.fromEntries(departments.map((d) => [d.id, d.name])),
    [departments],
  );
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es');
    return rows.filter((r) =>
      [r.code, r.firstName, r.lastName, r.email, r.departmentId && departmentById[r.departmentId]]
        .join(' ')
        .toLocaleLowerCase('es')
        .includes(term),
    );
  }, [rows, query, departmentById]);
  const open = (employee: Employee) => navigate(`/hr/employees/${employee.id}`);
  const remove = async (employee: Employee) => {
    if (
      !canDelete ||
      !(await popup.confirm({
        title: t('hr.employees.deleteTitle'),
        message: t('hr.employees.deleteMessage', {
          name: `${employee.firstName} ${employee.lastName}`,
        }),
        confirmLabel: t('hr.common.delete'),
      }))
    )
      return;
    try {
      await employeesApi.remove(employee.id);
      setRows((previous) => previous.filter((r) => r.id !== employee.id));
      toast.success(t('hr.employees.deleted'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('hr.employees.deleteFailed'));
    }
  };
  const rowActions = (employee: Employee): RowAction[] => [
    {
      label: t('hr.employees.open'),
      icon: <ArrowUpRight size={14} />,
      onClick: () => open(employee),
    },
    {
      label: t('hr.common.delete'),
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => void remove(employee),
    },
  ];
  return (
    <div className="p-4 w-full space-y-6">
      <PageHeader
        title={t('hr.employees.title')}
        subtitle={t('hr.employees.subtitle')}
        icon={<UserRound size={18} />}
        size="lg"
        actions={
          canWrite && (
            <Button onClick={() => setCreating(true)} className="gap-2">
              <Plus size={16} />
              {t('hr.employeeWizard.title')}
            </Button>
          )
        }
      />
      <Card noPadding>
        <div className="p-4 flex flex-wrap gap-4 items-center justify-between border-b border-border-subtle">
          <div className="w-full sm:max-w-sm">
            <Input
              aria-label={t('hr.employees.searchAria')}
              placeholder={t('hr.employees.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <span className="text-sm text-fg-muted">
            {t('hr.employees.count', { count: filtered.length })}
          </span>
        </div>
        <Table
          isLoading={loading}
          data={filtered}
          onRowClick={open}
          rowActions={rowActions}
          columns={[
            {
              header: t('hr.common.code'),
              accessor: 'code',
              sortable: true,
              primary: true,
              card: 'subtitle',
            },
            {
              header: t('hr.employees.fullName'),
              card: 'title',
              cell: (r: Employee) => (
                <span className="font-medium">
                  {r.firstName} {r.lastName}
                </span>
              ),
              sortable: true,
              sortAccessor: (r: Employee) => `${r.lastName} ${r.firstName}`,
            },
            {
              header: t('hr.common.department'),
              card: 'meta',
              cell: (r: Employee) => (r.departmentId ? departmentById[r.departmentId] || '—' : '—'),
            },
            { header: t('hr.employees.email'), accessor: 'email' },
            {
              header: t('hr.common.status'),
              card: 'status',
              cell: (r: Employee) => (
                <Badge
                  variant={
                    r.status === 'active' ? 'success' : r.status === 'leave' ? 'warning' : 'neutral'
                  }
                >
                  {t(EMPLOYEE_STATUS_LABEL[r.status])}
                </Badge>
              ),
            },
          ]}
        />
      </Card>
      {creating && (
        <EmployeeCreateWizard
          departments={departments}
          costCenters={costCenters}
          onClose={() => setCreating(false)}
          onCreated={open}
        />
      )}
    </div>
  );
}
export default Employees;
