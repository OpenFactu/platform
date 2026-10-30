/**
 * Pasos del alta de documentos y su estado, sin React.
 *
 * Todos los tipos (presupuesto, pedidos, albaranes, facturas y el genérico)
 * comparten los mismos pasos; lo que cambia por tipo son los campos
 * obligatorios de la cabecera y si hay paso fiscal. `DocumentFormLayout`
 * pinta el `Stepper` y, al registrar, salta al primer paso que falle.
 */
import { t } from '@/i18n/i18n';
import { findFirstIncompleteBatchLine } from '../components/documentLineCells';

export type FormStepId = 'header' | 'lines' | 'fiscal' | 'review';

export interface FormStepDef {
  id: FormStepId;
  label: string;
  /** Paso que se puede saltar (fiscal y pago en pedidos y albaranes). */
  optional?: boolean;
}

export function buildFormSteps(opts: { fiscal?: 'required' | 'optional' | 'none' }): FormStepDef[] {
  const steps: FormStepDef[] = [
    { id: 'header', label: t('doc.steps.header') },
    { id: 'lines', label: t('doc.steps.lines') },
  ];
  if (opts.fiscal && opts.fiscal !== 'none') {
    steps.push({
      id: 'fiscal',
      label: t('doc.steps.fiscal'),
      optional: opts.fiscal === 'optional',
    });
  }
  steps.push({ id: 'review', label: t('doc.steps.review') });
  return steps;
}

/** Lo que el paso de cabecera exige además de interlocutor, fecha, serie y periodo. */
export interface HeaderRequirements {
  /** Etiqueta del interlocutor para los mensajes: «el cliente», «el proveedor». */
  partnerLabel?: string;
  /** Almacén en cabecera (albaranes con `warehouseLocation === 'header'`). */
  warehouse?: boolean;
  /** Valor y nombre de un campo extra obligatorio (nº de factura del proveedor). */
  extra?: { value: string | null | undefined; message: string };
}

export interface FormStepState {
  partnerId?: string;
  date?: string;
  seriesId?: string;
  periodId?: string;
  seriesError?: string | null;
  isManualSeries?: boolean;
  manualNumber?: string | number;
  warehouseId?: string;
  lines: any[];
}

export interface FormStepProblem {
  step: FormStepId;
  message: string;
  /** Línea con lotes sin asignar, para abrir su asignación. */
  batchLine?: number;
}

/** Primer problema de la cabecera, o null si está completa. */
export function headerProblem(state: FormStepState, req: HeaderRequirements = {}): string | null {
  if (!state.partnerId) {
    return t('doc.steps.choosePartner', {
      partner: req.partnerLabel ?? t('doc.steps.thePartner'),
    });
  }
  if (!state.date) return t('doc.steps.enterDate');
  if (req.warehouse && !state.warehouseId) return t('doc.steps.chooseWarehouse');
  if (req.extra && !String(req.extra.value ?? '').trim()) return req.extra.message;
  if (!state.seriesId) return t('doc.steps.chooseSeries');
  if (state.seriesError) return state.seriesError;
  if (state.isManualSeries && !String(state.manualNumber ?? '').trim()) {
    return t('doc.steps.enterManualNumber');
  }
  if (!state.periodId) return t('doc.steps.choosePeriod');
  return null;
}

/** Primer problema de las líneas, o null si están completas. */
export function linesProblem(
  lines: any[],
  masters: { items: any[] },
  /** Exigir lotes asignados: sí en albaranes y facturas, no en pedidos ni presupuestos. */
  batches = true,
): { message: string; batchLine?: number } | null {
  const filled = lines.filter((l) => l.itemId);
  if (filled.length === 0) return { message: t('doc.steps.addLine') };
  const noQty = lines.findIndex((l) => l.itemId && !(Number(l.quantity) > 0));
  if (noQty !== -1) return { message: t('doc.steps.lineNoQty', { n: noQty + 1 }) };
  const batch = batches ? findFirstIncompleteBatchLine(lines, masters) : null;
  if (batch !== null) {
    return {
      message: t('doc.steps.pendingTrace'),
      batchLine: batch,
    };
  }
  return null;
}

/** Qué pasos están completos y cuál es el primer problema. */
export function formStepStatus(
  state: FormStepState,
  masters: { items: any[] },
  req: HeaderRequirements = {},
  opts: { batches?: boolean } = {},
): { complete: Record<FormStepId, boolean>; problem: FormStepProblem | null } {
  const header = headerProblem(state, req);
  const lines = linesProblem(state.lines ?? [], masters, opts.batches ?? true);
  const problem: FormStepProblem | null = header
    ? { step: 'header', message: header }
    : lines
      ? { step: 'lines', ...lines }
      : null;
  return {
    complete: {
      header: !header,
      lines: !lines,
      // Fiscal no bloquea: lo que pide ya lo valida el servidor.
      fiscal: !header && !lines,
      review: !problem,
    },
    problem,
  };
}
