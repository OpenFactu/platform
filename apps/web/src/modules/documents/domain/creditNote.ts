/**
 * Preparar un abono: qué se puede abonar y qué le falta al formulario para enviarlo.
 * Las reglas de verdad están en el servidor (`core/documents/creditNotes.ts`); esto
 * evita llegar hasta el error.
 */
import { t } from '@/i18n/i18n';
import type { FormStepId, FormStepProblem } from './formSteps';

export type InvoiceSide = 'sales' | 'purchase';

export interface CreditableBatch {
  batchNum: string;
  available: number;
}

export interface CreditableLine {
  lineId: string;
  lineNum: number;
  itemId: string;
  itemName: string | null;
  description: string | null;
  price: number;
  invoiced: number;
  credited: number;
  available: number;
  /** Lo que ya ha vuelto por una devolución de logística, en la unidad de la línea. */
  returnedByLogistics: number;
  /** Lo que todavía puede volver con un abono. */
  returnable: number;
  /** Lo que ha vuelto con una entrada y sigue facturado: falta su abono. */
  returnedUncredited: number;
  /** Lo que vale cada unidad facturada, con su descuento. */
  unitNet: number;
  unitTax: number;
  unitWithholding: number;
  itemCode: string | null;
  taxGroupId: string | null;
  uomId: string | null;
  uomFactor: number;
  internalOrderId: string | null;
  customFields: Record<string, unknown>;
  warehouseId: string | null;
  tracked: boolean;
  batches: CreditableBatch[];
}

export interface RectifyType {
  id: string;
  code: string;
  name: string;
}

export interface CreditNoteInvoice {
  id: string;
  code: string;
  partnerId: string;
  partnerName: string | null;
  total: number;
}

export interface CreditNotePreparation {
  invoice: CreditNoteInvoice;
  lines: CreditableLine[];
  documentTypes: RectifyType[];
}

export interface CreditLineDraft {
  lineId: string;
  quantity: number | null;
  returnStock: boolean;
  warehouseId: string | null;
  zoneId: string | null;
}

export interface CreditNoteForm {
  drafts: CreditLineDraft[];
  reason: string;
  documentTypeId: string;
  date: string;
  externalRef: string;
}

export interface CreditNoteBody {
  lines: Array<{
    lineId: string;
    quantity: number;
    returnStock: boolean;
    warehouseId?: string;
    zoneId?: string;
  }>;
  reason: string;
  documentTypeId: string;
  date: string;
  externalRef?: string;
}

export type CreditNoteProblem =
  | 'noType'
  | 'noLines'
  | 'tooMuch'
  | 'tooMuchReturned'
  | 'reason'
  | 'noWarehouse'
  | 'noZone'
  | 'externalRef';

/**
 * Por defecto, abonar todo lo que queda y sin devolver la mercancía. Después de una devolución
 * de logística, justo lo que ha vuelto: la mercancía ya viene con su entrada.
 */
export const initialDrafts = (lines: CreditableLine[], fromReturn = false): CreditLineDraft[] =>
  lines
    .filter((line) => line.available > 0)
    .map((line) => ({
      lineId: line.lineId,
      quantity: fromReturn ? line.returnedUncredited : line.available,
      returnStock: false,
      warehouseId: line.warehouseId,
      zoneId: null,
    }));

const chosen = (drafts: CreditLineDraft[]) => drafts.filter((draft) => Number(draft.quantity) > 0);

function headerProblem(side: InvoiceSide, form: CreditNoteForm): CreditNoteProblem | null {
  if (!form.documentTypeId) return 'noType';
  if (!form.reason.trim()) return 'reason';
  if (side === 'purchase' && !form.externalRef.trim()) return 'externalRef';
  return null;
}

function linesProblem(
  side: InvoiceSide,
  lines: CreditableLine[],
  form: CreditNoteForm,
  /** Si en ese almacén una entrada tiene que llevar ubicación. */
  needsZone: (warehouseId: string | null) => boolean,
): CreditNoteProblem | null {
  const picked = chosen(form.drafts);
  if (picked.length === 0) return 'noLines';
  for (const draft of picked) {
    const line = lines.find((candidate) => candidate.lineId === draft.lineId);
    if (!line || Number(draft.quantity) > line.available) return 'tooMuch';
    if (draft.returnStock && Number(draft.quantity) > line.returnable) return 'tooMuchReturned';
    if (draft.returnStock && !draft.warehouseId) return 'noWarehouse';
    // Vender no pide ubicación, pero lo que vuelve es una entrada: como un albarán de compra.
    if (side === 'sales' && draft.returnStock && !draft.zoneId && needsZone(draft.warehouseId)) {
      return 'noZone';
    }
  }
  return null;
}

/** Qué pasos están completos y cuál es el primer problema, como el alta de cualquier documento. */
export function creditNoteStatus(
  side: InvoiceSide,
  lines: CreditableLine[],
  form: CreditNoteForm,
  needsZone: (warehouseId: string | null) => boolean = () => false,
): { complete: Record<FormStepId, boolean>; problem: FormStepProblem | null } {
  const header = headerProblem(side, form);
  const inLines = linesProblem(side, lines, form, needsZone);
  const first = header ?? inLines;
  return {
    complete: { header: !header, lines: !inLines, fiscal: true, review: !first },
    problem: first
      ? { step: header ? 'header' : 'lines', message: t(`doc.creditNote.problems.${first}`) }
      : null,
  };
}

/** Lo que se abona, en positivo. Lo definitivo lo calcula el servidor al crearlo. */
export function creditNoteTotals(lines: CreditableLine[], drafts: CreditLineDraft[]) {
  const totals = { subtotal: 0, tax: 0, withholding: 0, total: 0 };
  for (const draft of chosen(drafts)) {
    const line = lines.find((candidate) => candidate.lineId === draft.lineId);
    if (!line) continue;
    const quantity = Number(draft.quantity);
    totals.subtotal += quantity * line.unitNet;
    totals.tax += quantity * line.unitTax;
    totals.withholding += quantity * line.unitWithholding;
  }
  totals.total = totals.subtotal + totals.tax - totals.withholding;
  return totals;
}

export const pickedCount = (drafts: CreditLineDraft[]) => chosen(drafts).length;

/**
 * Una línea del abono con la forma de una línea de documento, para pintarla igual. Lleva
 * `baseId`, como toda línea que viene de otro documento, y el precio ya con su descuento.
 */
export interface CreditNoteRow extends Record<string, unknown> {
  id: string;
  itemId: string;
  quantity: number | null;
  price: number;
  baseId: string;
  draft: CreditLineDraft;
  line: CreditableLine;
}

export function creditNoteRows(
  lines: CreditableLine[],
  drafts: CreditLineDraft[],
  invoiceId: string,
): CreditNoteRow[] {
  return drafts.flatMap((draft) => {
    const line = lines.find((candidate) => candidate.lineId === draft.lineId);
    if (!line) return [];
    return [
      {
        ...line.customFields,
        id: line.lineId,
        itemId: line.itemId,
        quantity: draft.quantity,
        price: line.unitNet,
        taxGroupId: line.taxGroupId,
        uomId: line.uomId,
        uomFactor: line.uomFactor,
        internalOrderId: line.internalOrderId,
        description: line.description,
        baseId: invoiceId,
        draft,
        line,
      },
    ];
  });
}

/** Si una línea responde a lo buscado: nombre, código o código de barras del artículo. */
export function lineMatches(
  line: CreditableLine,
  query: string,
  items: Array<{ id: string; barcode?: string | null }> = [],
): boolean {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return true;
  const barcode = items.find((item) => item.id === line.itemId)?.barcode;
  return [line.itemName, line.itemCode, line.description, barcode].some((text) =>
    (text ?? '').toLowerCase().includes(wanted),
  );
}

/** Abonar todo lo que queda de cada línea. */
export const withAllQuantities = (drafts: CreditLineDraft[], lines: CreditableLine[]) =>
  drafts.map((draft) => ({
    ...draft,
    quantity: lines.find((line) => line.lineId === draft.lineId)?.available ?? draft.quantity,
  }));

/** Para abonar pocas de muchas: se parte de ninguna. */
export const withNoQuantities = (drafts: CreditLineDraft[]) =>
  drafts.map((draft) => ({ ...draft, quantity: 0 }));

/** Lo que ya no puede volver se queda sin marcar: su mercancía ya ha vuelto. */
export const withAllReturned = (
  drafts: CreditLineDraft[],
  returnStock: boolean,
  lines: CreditableLine[],
) =>
  drafts.map((draft) => {
    const line = lines.find((candidate) => candidate.lineId === draft.lineId);
    return { ...draft, returnStock: returnStock && (line?.returnable ?? 0) > 0 };
  });

/** Solo a lo que vuelve: el resto no va a ningún almacén. */
export const withAllWarehouse = (drafts: CreditLineDraft[], warehouseId: string) =>
  drafts.map((draft) => (draft.returnStock ? { ...draft, warehouseId, zoneId: null } : draft));

export const withAllZone = (drafts: CreditLineDraft[], zoneId: string) =>
  drafts.map((draft) => (draft.returnStock ? { ...draft, zoneId } : draft));

/** El valor si todas coinciden; vacío si hay varios o ninguno. */
export function commonValue(values: Array<string | null>): string {
  const [first] = values;
  return first && values.every((value) => value === first) ? first : '';
}

export function creditNoteBody(side: InvoiceSide, form: CreditNoteForm): CreditNoteBody {
  return {
    lines: chosen(form.drafts).map((draft) => ({
      lineId: draft.lineId,
      quantity: Number(draft.quantity),
      returnStock: draft.returnStock,
      ...(draft.returnStock && draft.warehouseId ? { warehouseId: draft.warehouseId } : {}),
      ...(draft.returnStock && draft.zoneId ? { zoneId: draft.zoneId } : {}),
    })),
    reason: form.reason.trim(),
    documentTypeId: form.documentTypeId,
    date: form.date,
    ...(side === 'purchase' ? { externalRef: form.externalRef.trim() } : {}),
  };
}

const toCents = (n: number) => Math.round(n * 100) / 100;

/** Lo que queda sin aplicar en un abono, en positivo. */
export const creditNoteRemaining = (invoice: { total?: unknown; amountPaid?: unknown }) =>
  Math.max(
    0,
    toCents(Math.abs(Number(invoice.total || 0)) - Math.abs(Number(invoice.amountPaid || 0))),
  );

/**
 * Lo que queda por cobrar o pagar de una factura. En céntimos, como el servidor: el total
 * guarda más decimales de los que se pueden cobrar.
 */
export const invoiceRemaining = (invoice: { total?: unknown; amountPaid?: unknown }) =>
  Math.max(0, toCents(Number(invoice.total || 0) - Number(invoice.amountPaid || 0)));

/** Un abono de una factura, tal como lo enseña su ficha. */
export interface InvoiceCreditNote {
  id: string;
  code: string;
  documentTypeName?: string | null;
  date: string;
  status: string;
  total: number;
  /** Lo que tiene a favor del interlocutor. */
  available: number;
}

export interface InvoiceCreditNotes {
  notes: InvoiceCreditNote[];
  /** Si queda algo por abonar. */
  creditable: boolean;
  /** Lo que ha vuelto por logística y sigue sin abonar. */
  pendingReturn: number;
}

export const invoicesRoute = (side: InvoiceSide) =>
  side === 'sales' ? '/sales/invoices' : '/purchases/invoices';
