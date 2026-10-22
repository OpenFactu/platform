import { DatePicker, Input, SearchableSelect, Select } from '@openfactu/ui';
import type { Employee } from '../domain/employee';
import { EMPLOYEE_STATUS_LABEL } from '../domain/employee';

export type EmployeeValues = Partial<Employee>;
export interface EmployeeFieldsProps {
  values: EmployeeValues;
  set: (key: keyof Employee, value: unknown) => void;
}
export function EmployeePersonalFields({ values: v, set }: EmployeeFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Input
          label="Nombre"
          value={v.firstName || ''}
          onChange={(e) => set('firstName', e.target.value)}
          required
        />
        <Input
          label="Apellidos"
          value={v.lastName || ''}
          onChange={(e) => set('lastName', e.target.value)}
          required
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Input label="DNI / NIE" value={v.dni || ''} onChange={(e) => set('dni', e.target.value)} />
        <DatePicker
          label="Fecha de nacimiento"
          value={v.birthDate?.slice(0, 10) || null}
          onChange={(value) => set('birthDate', value)}
        />
      </div>
      <Input
        label="Correo electrónico"
        type="email"
        value={v.email || ''}
        onChange={(e) => set('email', e.target.value)}
      />
      <Input
        label="Teléfono"
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
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Input
          label="Código de empleado"
          value={v.code || ''}
          placeholder="Se asignará automáticamente"
          onChange={(e) => set('code', e.target.value)}
        />
        <Select
          label="Estado"
          value={v.status || 'active'}
          onChange={(value) => set('status', value)}
          options={Object.entries(EMPLOYEE_STATUS_LABEL).map(([value, label]) => ({
            value,
            label,
          }))}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-fg-body mb-1">Departamento</label>
        <SearchableSelect
          options={departments.map((d) => ({ value: d.id, label: d.name, secondaryLabel: d.code }))}
          value={v.departmentId || ''}
          onChange={(value) => set('departmentId', value || null)}
          clearable
          placeholder="Sin asignar"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-fg-body mb-1">Centro de coste</label>
        <SearchableSelect
          options={costCenters.map((d) => ({ value: d.id, label: d.name, secondaryLabel: d.code }))}
          value={v.costCenterId || ''}
          onChange={(value) => set('costCenterId', value || null)}
          clearable
          placeholder="Sin asignar"
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <DatePicker
          label="Fecha de alta"
          value={v.hireDate?.slice(0, 10) || null}
          onChange={(value) => set('hireDate', value)}
        />
        <DatePicker
          label="Fecha de baja"
          value={v.terminationDate?.slice(0, 10) || null}
          onChange={(value) => set('terminationDate', value)}
        />
      </div>
    </div>
  );
}
