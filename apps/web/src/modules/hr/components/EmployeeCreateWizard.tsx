import { useState } from 'react';
import { Button, Modal, Stepper, useToast } from '@openfactu/ui';
import { Check } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
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
  const { t } = useI18n();
  const set = (key: keyof Employee, value: unknown) => setValues((v) => ({ ...v, [key]: value }));
  const ready = !!values.firstName?.trim() && !!values.lastName?.trim();
  const create = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      onCreated(await employeesApi.create(values));
      toast.success(t('hr.employeeWizard.created'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('hr.employeeWizard.createFailed'));
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
      title={t('hr.employeeWizard.title')}
      size="lg"
    >
      <div className="space-y-6">
        <Stepper
          className="border-b border-border-subtle pb-4"
          aria-label={t('hr.employeeWizard.stepsAria')}
          current={step - 1}
          allowForward={ready}
          steps={[
            { id: 'personal', label: t('hr.employeeWizard.stepPersonal') },
            { id: 'org', label: t('hr.employeeWizard.stepOrg') },
          ]}
          onStepClick={(_, i) => setStep(i + 1)}
        />
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
        <p className="text-sm text-fg-muted">{t('hr.employeeWizard.hint')}</p>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            {t('hr.common.cancel')}
          </Button>
          {step === 1 && (
            <Button
              type="button"
              variant="secondary"
              disabled={!ready || busy}
              onClick={() => setStep(2)}
            >
              {t('hr.employeeWizard.continue')}
            </Button>
          )}
          <Button type="button" disabled={!ready || busy} onClick={() => void create()}>
            <Check size={14} className="mr-2" />
            {busy ? t('hr.employeeWizard.creating') : t('hr.employeeWizard.createAndOpen')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
