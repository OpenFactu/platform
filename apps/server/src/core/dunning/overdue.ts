/**
 * Las cuentas de la reclamación, sin base de datos: qué parte de una factura está vencida,
 * desde cuándo y qué nivel de reclamación le toca.
 */
import type { DunningLevel } from './settings';

const DAY_MS = 86_400_000;

const cents = (n: number) => Math.round(n * 100);

export const toIsoDate = (value: Date | string): string =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export interface InvoiceForDunning {
  total: unknown;
  amountPaid?: unknown;
  date: Date | string;
  dueDate?: string | null;
  paymentDueLines?: Array<{ date: string; amount: number }> | null;
  /** Cuándo se emitió. El retraso no cuenta antes: nadie debe lo que aún no le han facturado. */
  lockedAt?: Date | string | null;
}

export interface OverdueAmount {
  amount: number;
  /** El primer vencimiento sin pagar. */
  dueDate: string;
  days: number;
}

/**
 * Lo vencido de una factura hoy. Lo cobrado cubre los plazos por orden. Sin plazos vence
 * entera en su fecha de vencimiento y, si no tiene, el día de la factura. `null` si no hay
 * nada vencido: lo que vence hoy aún no lo está.
 */
export function overdueOf(invoice: InvoiceForDunning, today: string): OverdueAmount | null {
  const dues =
    Array.isArray(invoice.paymentDueLines) && invoice.paymentDueLines.length > 0
      ? [...invoice.paymentDueLines].sort((a, b) => a.date.localeCompare(b.date))
      : [
          {
            date: toIsoDate(invoice.dueDate || invoice.date),
            amount: Number(invoice.total),
          },
        ];

  let paid = cents(Number(invoice.amountPaid ?? 0));
  let overdue = 0;
  let first: string | null = null;
  for (const due of dues) {
    const amount = cents(Number(due.amount));
    const covered = Math.min(paid, amount);
    paid -= covered;
    const unpaid = amount - covered;
    if (unpaid > 0 && toIsoDate(due.date) < today) {
      overdue += unpaid;
      first ??= toIsoDate(due.date);
    }
  }
  if (overdue <= 0 || !first) return null;
  const issued = invoice.lockedAt ? toIsoDate(invoice.lockedAt) : null;
  const countsFrom = issued && issued > first ? issued : first;
  return {
    amount: overdue / 100,
    dueDate: first,
    days: Math.max(0, daysBetween(countsFrom, today)),
  };
}

/** El nivel más alto al que llega por sus días, empezando en 1. 0 si aún no llega a ninguno. */
export function reachedLevel(days: number, levels: DunningLevel[]): number {
  let reached = 0;
  levels.forEach((level, index) => {
    if (days >= level.days) reached = index + 1;
  });
  return reached;
}

/**
 * El siguiente nivel que le toca, de uno en uno: nadie recibe el último aviso sin haber
 * recibido antes el primero, por vieja que sea la factura. `null` si no hay ninguno más.
 */
export function nextLevelOf(
  days: number,
  sentLevel: number,
  levels: DunningLevel[],
): number | null {
  const next = sentLevel + 1;
  return next <= reachedLevel(days, levels) ? next : null;
}
