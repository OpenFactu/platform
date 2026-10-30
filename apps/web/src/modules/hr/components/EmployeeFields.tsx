import { DatePicker, Input, SearchableSelect, Select } from '@openfactu/ui';
import type { Employee } from '../domain/employee';
import { EMPLOYEE_STATUS_LABEL } from '../domain/employee';
import { useI18n } from '@/i18n/I18nContext';

export type EmployeeValues = Partial<Employee>;
export interface EmployeeFieldsProps {
  values: EmployeeValues;
  set: (key: keyof Employee, value: unknown) => void;
}
export function EmployeePersonalFields({ values: v, set }: EmployeeFieldsProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Input
          label={t('hr.employeeFields.firstName')}
          value={v.firstName || ''}
          onChange={(e) => set('firstName', e.target.value)}
          required
        />
        <Input
          label={t('hr.employeeFields.lastName')}
          value={v.lastName || ''}
          onChange={(e) => set('lastName', e.target.value)}
          required
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Input
          label={t('hr.employeeFields.dni')}
          value={v.dni || ''}
          onChange={(e) => set('dni', e.target.value)}
        />
        <DatePicker
          label={t('hr.employeeFields.birthDate')}
          value={v.birthDate?.slice(0, 10) || null}
          onChange={(value) => set('birthDate', value)}
        />
      </div>
      <Input
        label={t('hr.employeeFields.email')}
        type="email"
        value={v.email || ''}
        onChange={(e) => set('email', e.target.value)}
      />
      <Input
        label={t('hr.employeeFields.phone')}
        value={v.phone || ''}
        onChange={(e) => set('phone', e.target.value)}
      />
    </div>
  );
}
export function EmployeeWorkFields({
  values: v,
  set,
  departments,
  costCenters,
}: {
  departments: { id: string; name: string; code?: string }[];
  costCenters: { id: string; name: string; code?: string }[];
} & EmployeeFieldsProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Input
          label={t('hr.employeeFields.code')}
          value={v.code || ''}
          placeholder={t('hr.employeeFields.codeAuto')}
          onChange={(e) => set('code', e.target.value)}
        />
        <Select
          label={t('hr.employeeFields.status')}
          value={v.status || 'active'}
          onChange={(value) => set('status', value)}
          options={Object.entries(EMPLOYEE_STATUS_LABEL).map(([value, label]) => ({
            value,
            label: t(label),
          }))}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-fg-body mb-1">
          {t('hr.employeeFields.department')}
        </label>
        <SearchableSelect
          options={departments.map((d) => ({ value: d.id, label: d.name, secondaryLabel: d.code }))}
          value={v.departmentId || ''}
          onChange={(value) => set('departmentId', value || null)}
          clearable
          placeholder={t('hr.common.unassigned')}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-fg-body mb-1">
          {t('hr.employeeFields.costCenter')}
        </label>
        <SearchableSelect
          options={costCenters.map((d) => ({ value: d.id, label: d.name, secondaryLabel: d.code }))}
          value={v.costCenterId || ''}
          onChange={(value) => set('costCenterId', value || null)}
          clearable
          placeholder={t('hr.common.unassigned')}
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <DatePicker
          label={t('hr.employeeFields.hireDate')}
          value={v.hireDate?.slice(0, 10) || null}
          onChange={(value) => set('hireDate', value)}
        />
        <DatePicker
          label={t('hr.employeeFields.terminationDate')}
          value={v.terminationDate?.slice(0, 10) || null}
          onChange={(value) => set('terminationDate', value)}
        />
      </div>
    </div>
  );
}
