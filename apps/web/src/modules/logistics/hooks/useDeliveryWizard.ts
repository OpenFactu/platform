import { useCallback, useState } from 'react';
import type { DeliveryFlow } from '../domain/deliveryFlow';
import {
  canAdvance,
  initialWizardData,
  proofFrom,
  wizardSteps,
  type WizardData,
} from '../domain/deliveryWizard';

interface Options {
  flow: DeliveryFlow;
  packageIds: string[];
  customerName?: string | null;
  onSubmit: (proof: ReturnType<typeof proofFrom>) => Promise<boolean>;
}

/**
 * El paso en el que va el asistente y lo que lleva rellenado. Los pasos dependen de lo
 * elegido (en un sitio seguro no hay firma), pero solo cambian los que aún no se han dado.
 */
export function useDeliveryWizard({ flow, packageIds, customerName, onSubmit }: Options) {
  const [index, setIndex] = useState(0);
  const [data, setData] = useState<WizardData>(() => initialWizardData(flow, customerName));
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const set = useCallback(
    (patch: Partial<WizardData>) => setData((current) => ({ ...current, ...patch })),
    [],
  );

  const steps = wizardSteps(flow, packageIds.length > 0, data.handover, customerName);
  const step = steps[index];
  const submit = async () => {
    if (sending) return;
    setSending(true);
    try {
      if (await onSubmit(proofFrom(data))) setDone(true);
    } finally {
      setSending(false);
    }
  };

  return {
    steps,
    step,
    index,
    data,
    set,
    sending,
    done,
    isFirst: index === 0,
    isLast: index === steps.length - 1,
    canGoOn: canAdvance(step, data, packageIds, flow),
    /** Hay algo que se perdería al salir. */
    dirty: !!data.signature || !!data.photo || data.checked.length > 0 || !!data.notes.trim(),
    next: () => setIndex((i) => Math.min(i + 1, steps.length - 1)),
    back: () => setIndex((i) => Math.max(i - 1, 0)),
    submit,
  };
}
