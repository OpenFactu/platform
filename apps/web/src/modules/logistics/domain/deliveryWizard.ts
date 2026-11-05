/**
 * El asistente de entrega: qué pasos tiene según lo que pida la empresa y cuándo se
 * puede seguir. Es la misma regla que aplica el servidor al recibir la entrega
 * (`proofProblem`); aquí sirve para no dejar llegar hasta el error.
 */
import type { DeliveryFlow, Handover } from './deliveryFlow';

export type WizardStep = 'packages' | 'recipient' | 'signature' | 'photo' | 'confirm';

export interface WizardData {
  checked: string[];
  handover: Handover;
  recipientName: string;
  recipientDocument: string;
  signature: string | null;
  photo: string | null;
  notes: string;
}

export function wizardSteps(
  flow: DeliveryFlow,
  hasPackages: boolean,
  handover: Handover,
  customerName: string | null | undefined,
): WizardStep[] {
  const alone = handover === 'safePlace';
  const steps: WizardStep[] = [];
  if (hasPackages && flow.packageCheck !== 'off') steps.push('packages');
  if (flow.handover.length > 1 || !customerName) steps.push('recipient');
  if (flow.signature !== 'off' && !alone) steps.push('signature');
  if (flow.photo !== 'off' || alone) steps.push('photo');
  steps.push('confirm');
  return steps;
}

/** Al cambiar a quién se deja, el nombre y lo que ya no aplica se limpian. */
export function handoverPatch(
  handover: Handover,
  customerName: string | null | undefined,
): Partial<WizardData> {
  return {
    handover,
    recipientName: handover === 'customer' ? (customerName ?? '') : '',
    ...(handover === 'safePlace' ? { signature: null, recipientDocument: '' } : {}),
  };
}

export function initialWizardData(
  flow: DeliveryFlow,
  customerName: string | null | undefined,
): WizardData {
  const first: Handover =
    customerName && flow.handover.includes('customer') ? 'customer' : flow.handover[0];
  return {
    checked: [],
    handover: first,
    recipientName: first === 'customer' ? (customerName ?? '') : '',
    recipientDocument: '',
    signature: null,
    photo: null,
    notes: '',
  };
}

export function needsRecipientName(handover: Handover): boolean {
  return handover !== 'safePlace' && handover !== 'concierge';
}

export function canAdvance(
  step: WizardStep,
  data: WizardData,
  packageIds: string[],
  flow: DeliveryFlow,
): boolean {
  switch (step) {
    case 'packages':
      return packageIds.every((id) => data.checked.includes(id));
    case 'recipient':
      return !needsRecipientName(data.handover) || !!data.recipientName.trim();
    case 'signature':
      if (flow.signature !== 'required' || data.signature) return true;
      return flow.allowDocument && !!data.recipientDocument.trim();
    case 'photo':
      return flow.photo !== 'required' && data.handover !== 'safePlace' ? true : !!data.photo;
    default:
      return true;
  }
}

export function proofFrom(data: WizardData) {
  return {
    recipientName: data.recipientName.trim() || null,
    recipientDocument: data.recipientDocument.trim() || null,
    signatureImage: data.signature,
    photoImage: data.photo,
    podNotes: data.notes.trim() || null,
    handover: data.handover,
  };
}
