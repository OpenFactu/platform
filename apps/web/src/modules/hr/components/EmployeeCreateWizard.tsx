import { useState } from 'react';
import { Button, Modal, useToast } from '@openfactu/ui';
import { ArrowRight, Check } from 'lucide-react';
import { employeesApi } from '../api/employeesApi';
import { EmployeePersonalFields, EmployeeWorkFields, type EmployeeValues } from './EmployeeFields';
import type { Employee } from '../domain/employee';
export function EmployeeCreateWizard({
  onClose,
  onCreated,
  departments,
  costCenters,
}: {
  onClose: () => void;
  onCreated: (employee: Employee) => void;
  departments: { id: string; name: string; code?: string }[];
  costCenters: { id: string; name: string; code?: string }[];
}) {
  const [values, setValues] = useState<EmployeeValues>({ status: 'active' });
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (key: keyof Employee, value: unknown) => setValues((v) => ({ ...v, [key]: value }));
  const ready = !!values.firstName?.trim() && !!values.lastName?.trim();
  const create = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      onCreated(await employeesApi.create(values));
      toast.success('Empleado creado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo crear el empleado.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      isOpen
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Nuevo empleado"
      size="lg"
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle pb-4">
          <Button
            type="button"
            variant={step === 1 ? 'primary' : 'ghost'}
            onClick={() => setStep(1)}
          >
            1 · Datos personales
          </Button>
          <ArrowRight size={14} className="text-fg-subtle" />
          <Button
            type="button"
            variant={step === 2 ? 'primary' : 'ghost'}
            disabled={!ready}
            onClick={() => setStep(2)}
          >
            2 · Organización
          </Button>
        </div>
        {step === 1 ? (
          <EmployeePersonalFields values={values} set={set} />
        ) : (
          <EmployeeWorkFields
            values={values}
            set={set}
            departments={departments}
            costCenters={costCenters}
          />
        )}
        <p className="text-sm text-fg-muted">
          Después podrás asignar el usuario, el PIN y las tarjetas desde su ficha.
        </p>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          {step === 1 && (
            <Button
              type="button"
              variant="secondary"
              disabled={!ready || busy}
              onClick={() => setStep(2)}
            >
              Continuar
            </Button>
          )}
          <Button type="button" disabled={!ready || busy} onClick={() => void create()}>
            <Check size={14} className="mr-2" />
            {busy ? 'Creando…' : 'Crear y abrir ficha'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
