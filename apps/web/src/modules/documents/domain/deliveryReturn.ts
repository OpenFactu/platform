/**
 * Devolver mercancía desde un albarán sin facturar: qué puede volver y qué le falta al formulario
 * para enviarlo. Las reglas de verdad están en el servidor
 * (`core/documents/deliveryNoteReturn.ts`); esto evita llegar hasta el error.
 */
import { t } from '@/i18n/i18n';
import type { FormStepId, FormStepProblem } from './formSteps';

/** Lo que puede volver de una línea del albarán; con lotes, una fila por lote. */
export interface ReturnableLine {
  lineId: string;
  lineNum: number;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  description: string | null;
  batchNum: string | null;
  /** En la unidad de la línea. */
  pending: number;
  uomName: string | null;
  zoneId: string | null;
}

export type NoteReturnBlock = 'cancelled' | 'invoiced' | 'shipment';

export interface NoteReturnPreparation {
  note: {
    id: string;
    code: string;
    status: string;
    partnerId: string;
    partnerName: string | null;
    warehouseId: string | null;
  };
  /** Por qué este albarán no admite la devolución. */
  problem: NoteReturnBlock | null;
  lines: ReturnableLine[];
}

export interface NoteReturnForm {
  reason: string;
  warehouseId: string;
  zoneId: string;
  /** Lo que vuelve de cada fila, por `returnKey`. */
  quantities: Record<string, number | null>;
}

export interface NoteReturnBody {
  reason: string;
  warehouseId: string;
  zoneId?: string;
  lines: Array<{ lineId: string; batchNum?: string; quantity: number }>;
}

export interface NoteReturnResult {
  receiptId: string;
  code: string;
  fullyReturned: boolean;
}

type ReturnProblem = 'noWarehouse' | 'noZone' | 'reason' | 'noLines' | 'tooMuch';

export const returnKey = (line: Pick<ReturnableLine, 'lineId' | 'batchNum'>) =>
  `${line.lineId}|${line.batchNum ?? ''}`;

const quantityOf = (form: NoteReturnForm, line: ReturnableLine) =>
  Number(form.quantities[returnKey(line)] ?? 0);

/** Las filas que vuelven: las que llevan cantidad. */
export const returningLines = (lines: ReturnableLine[], form: NoteReturnForm) =>
  lines.filter((line) => quantityOf(form, line) > 0);

/** Se parte de nada: entrar en el stock no se deshace, así que lo que vuelve se elige. */
export const initialReturnForm = (preparation: NoteReturnPreparation): NoteReturnForm => ({
  reason: '',
  warehouseId: preparation.note.warehouseId ?? '',
  zoneId: '',
  quantities: {},
});

export const withEverything = (form: NoteReturnForm, lines: ReturnableLine[]): NoteReturnForm => ({
  ...form,
  quantities: Object.fromEntries(lines.map((line) => [returnKey(line), line.pending])),
});

export const withNothing = (form: NoteReturnForm): NoteReturnForm => ({ ...form, quantities: {} });

/** La ubicación de la línea solo vale si vuelve al almacén del que salió. */
function lacksZone(preparation: NoteReturnPreparation, form: NoteReturnForm, line: ReturnableLine) {
  if (form.zoneId) return false;
  return form.warehouseId !== preparation.note.warehouseId || !line.zoneId;
}

function problemOf(
  preparation: NoteReturnPreparation,
  form: NoteReturnForm,
  needsZone: (warehouseId: string) => boolean,
): { problem: ReturnProblem; step: FormStepId } | null {
  if (!form.warehouseId) return { problem: 'noWarehouse', step: 'header' };
  if (!form.reason.trim()) return { problem: 'reason', step: 'header' };
  const picked = returningLines(preparation.lines, form);
  if (picked.length === 0) return { problem: 'noLines', step: 'lines' };
  if (picked.some((line) => quantityOf(form, line) > line.pending)) {
    return { problem: 'tooMuch', step: 'lines' };
  }
  if (needsZone(form.warehouseId) && picked.some((line) => lacksZone(preparation, form, line))) {
    return { problem: 'noZone', step: 'header' };
  }
  return null;
}

/** Qué pasos están completos y cuál es el primer problema, como el alta de cualquier documento. */
export function noteReturnStatus(
  preparation: NoteReturnPreparation,
  form: NoteReturnForm,
  needsZone: (warehouseId: string) => boolean = () => false,
): { complete: Record<FormStepId, boolean>; problem: FormStepProblem | null } {
  const first = problemOf(preparation, form, needsZone);
  return {
    complete: {
      header: first?.step !== 'header',
      lines: !returningLinesProblem(preparation, form),
      fiscal: true,
      review: !first,
    },
    problem: first
      ? { step: first.step, message: t(`doc.deliveryReturn.problems.${first.problem}`) }
      : null,
  };
}

const returningLinesProblem = (preparation: NoteReturnPreparation, form: NoteReturnForm) => {
  const picked = returningLines(preparation.lines, form);
  return picked.length === 0 || picked.some((line) => quantityOf(form, line) > line.pending);
};

export function noteReturnBody(lines: ReturnableLine[], form: NoteReturnForm): NoteReturnBody {
  return {
    reason: form.reason.trim(),
    warehouseId: form.warehouseId,
    ...(form.zoneId ? { zoneId: form.zoneId } : {}),
    lines: returningLines(lines, form).map((line) => ({
      lineId: line.lineId,
      ...(line.batchNum ? { batchNum: line.batchNum } : {}),
      quantity: quantityOf(form, line),
    })),
  };
}

/** Si una fila responde a lo buscado: artículo, código o lote. */
export function returnLineMatches(line: ReturnableLine, query: string): boolean {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return true;
  return [line.itemName, line.itemCode, line.description, line.batchNum].some((text) =>
    (text ?? '').toLowerCase().includes(wanted),
  );
}
