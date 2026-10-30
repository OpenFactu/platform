import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  Input,
  Loader,
  PageHeader,
  SearchableSelect,
  usePopup,
  useToast,
} from '@openfactu/ui';
import { ArrowLeft, Save, UserRound } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { PluginFieldsPanel } from '@/components/PluginFieldsPanel';
import { crudApi } from '@/shared/api';
import { costCentersApi } from '@/modules/analytics/api/internalOrdersApi';
import { validateIban, normalizeIban } from '@/utils/bankValidation';
import { employeesApi, departmentsApi } from '../api';
import type { Employee } from '../domain/employee';
import { EmployeeCredentials } from '../components/EmployeeCredentials';
import {
  EmployeePersonalFields,
  EmployeeWorkFields,
  type EmployeeValues,
} from '../components/EmployeeFields';
import { EMPLOYEE_STATUS_LABEL } from '../domain/employee';
import { useI18n } from '@/i18n/I18nContext';

export function EmployeeDetail() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { user } = useAuth();
  return <EmployeeDetailPage key={`${user?.tenantId}:${employeeId}`} />;
}
function EmployeeDetailPage() {
  const { t } = useI18n();
  const { employeeId } = useParams<{ employeeId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const popup = usePopup();
  const canWrite =
    user?.role === 'ADMIN' ||
    user?.role === 'SUPERUSER' ||
    !!user?.permissions?.['/hr/employees']?.write;
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [values, setValues] = useState<EmployeeValues>({});
  const [custom, setCustom] = useState<Record<string, unknown>>({});
  const [departments, setDepartments] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [costCenters, setCostCenters] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; username: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const set = (key: keyof Employee, value: unknown) => {
    setValues((v) => ({ ...v, [key]: value }));
    setDirty(true);
  };
  useEffect(() => {
    let active = true;
    if (!employeeId || !user?.tenantId) return;
    void Promise.all([
      employeesApi.get(employeeId),
      departmentsApi.list(),
      costCentersApi.list().catch(() => []),
      crudApi.list<{ id: string; username: string; email: string }>('/api/users').catch(() => []),
    ])
      .then(([person, dept, cost, accounts]) => {
        if (!active) return;
        setEmployee(person);
        setValues(person);
        setCustom({});
        setDepartments(dept);
        setCostCenters(cost);
        setUsers(accounts);
        setDirty(false);
      })
      .catch((e) => {
        if (active) {
          setEmployee(null);
          toast.error(e.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // Toast identity is not a data dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, user?.tenantId]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const save = async () => {
    if (!canWrite || !employeeId || saving) return;
    if (!values.firstName?.trim() || !values.lastName?.trim()) {
      toast.error(t('hr.employeeDetail.nameRequired'));
      return;
    }
    if (values.iban && !validateIban(values.iban).ok) {
      toast.error(
        t('hr.employeeDetail.invalidIban', { reason: validateIban(values.iban).reason ?? '' }),
      );
      return;
    }
    setSaving(true);
    try {
      const updated = await employeesApi.update(employeeId, {
        ...values,
        ...custom,
        iban: values.iban ? normalizeIban(values.iban) : null,
      });
      setEmployee(updated);
      setValues(updated);
      setCustom({});
      setDirty(false);
      toast.success(t('hr.employeeDetail.updated'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('hr.employeeDetail.saveFailed'));
    } finally {
      setSaving(false);
    }
  };
  const back = async () => {
    if (
      dirty &&
      !(await popup.confirm({
        title: t('hr.employeeDetail.unsaved'),
        message: t('hr.employeeDetail.discardMessage'),
        confirmLabel: t('hr.employeeDetail.discard'),
      }))
    )
      return;
    navigate('/hr/employees');
  };
  if (loading)
    return (
      <div className="p-12 flex justify-center">
        <Loader />
      </div>
    );
  if (!employee)
    return (
      <div className="p-12 text-center space-y-4">
        <p>{t('hr.employeeDetail.notFound')}</p>
        <Button variant="secondary" onClick={() => navigate('/hr/employees')}>
          {t('hr.employeeDetail.backToList')}
        </Button>
      </div>
    );
  return (
    <div className="p-4 space-y-6">
      <Card>
        <div className="flex flex-col md:flex-row gap-6">
          <div className="w-28 h-28 rounded-lg bg-bg-muted border border-border-default flex items-center justify-center text-fg-subtle shrink-0">
            <UserRound size={40} strokeWidth={1.5} />
          </div>
          <PageHeader
            className="flex-1 min-w-0"
            size="md"
            breadcrumbs={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void back()}
                className="w-fit gap-1"
              >
                <ArrowLeft size={12} />
                {t('hr.employees.title')}
              </Button>
            }
            title={
              <>
                {`${values.firstName || ''} ${values.lastName || ''}`}
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant={values.status === 'active' ? 'success' : 'neutral'}>
                    {t(EMPLOYEE_STATUS_LABEL[values.status || 'active'])}
                  </Badge>
                  {dirty && <Badge variant="warning">{t('hr.employeeDetail.unsaved')}</Badge>}
                </span>
              </>
            }
            subtitle={`${employee.code || ''}${values.departmentId ? ' · ' + (departments.find((d) => d.id === values.departmentId)?.name || '') : ''}`}
            actions={
              <Button
                type="button"
                onClick={() => void save()}
                disabled={!canWrite || saving || !dirty}
              >
                <Save size={14} className="mr-2" />
                {saving ? t('hr.common.saving') : t('hr.employeeDetail.saveChanges')}
              </Button>
            }
          />
        </div>
      </Card>
      <fieldset
        disabled={!canWrite || saving}
        className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start min-w-0"
      >
        <Card
          title={t('hr.employeeWizard.stepPersonal')}
          subtitle={t('hr.employeeDetail.personalSubtitle')}
        >
          <EmployeePersonalFields values={values} set={set} />
        </Card>
        <Card title={t('hr.employeeWizard.stepOrg')} subtitle={t('hr.employeeDetail.orgSubtitle')}>
          <EmployeeWorkFields
            values={values}
            set={set}
            departments={departments}
            costCenters={costCenters}
          />
        </Card>
        <Card
          title={t('hr.employeeDetail.accessTitle')}
          subtitle={t('hr.employeeDetail.accessSubtitle')}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-fg-body mb-1">
                {t('hr.employeeDetail.linkedUser')}
              </label>
              <SearchableSelect
                value={typeof values.userId === 'string' ? values.userId : ''}
                options={users.map((u) => ({
                  value: u.id,
                  label: u.username,
                  secondaryLabel: u.email,
                }))}
                onChange={(v) => set('userId', v || null)}
                clearable
                placeholder={t('hr.employeeDetail.noUser')}
              />
              <p className="mt-2 text-xs text-fg-muted">{t('hr.employeeDetail.userHint')}</p>
            </div>
            <div className="max-w-xs">
              <Input
                label={t('hr.employeeDetail.kioskPin')}
                value={values.kioskPin || ''}
                onChange={(e) =>
                  set('kioskPin', e.target.value.replace(/\D/g, '').slice(0, 8) || null)
                }
                inputMode="numeric"
                maxLength={8}
                placeholder={t('hr.employeeDetail.pinPlaceholder')}
              />
            </div>
            <p className="text-xs text-fg-muted">{t('hr.employeeDetail.pinHint')}</p>
          </div>
        </Card>
        <Card
          title={t('hr.employeeDetail.adminTitle')}
          subtitle={t('hr.employeeDetail.adminSubtitle')}
        >
          <div className="space-y-4">
            <Input
              label="IBAN"
              value={values.iban || ''}
              onChange={(e) => set('iban', e.target.value.toUpperCase())}
              placeholder="ES00 0000 0000 0000 0000 0000"
            />
            <Input
              label={t('hr.common.notes')}
              value={values.notes || ''}
              onChange={(e) => set('notes', e.target.value)}
            />
            <PluginFieldsPanel
              tableName="Employee"
              values={{ ...values, ...custom }}
              disabled={!canWrite || saving}
              onChange={(key, value) => {
                setCustom((c) => ({ ...c, [key]: value }));
                setDirty(true);
              }}
              layout="inline"
            />
          </div>
        </Card>
      </fieldset>
      <EmployeeCredentials
        key={`${user?.tenantId}:${employee.id}`}
        employeeId={employee.id}
        canWrite={canWrite}
      />
    </div>
  );
}
