/**
 * Crédito, impagos y recurrentes, sin React. Los tipos repiten lo que devuelve el servidor;
 * las reglas de verdad están allí, y lo de aquí solo decide qué enseñar.
 */
export type CreditMode = 'off' | 'warn' | 'block';

export interface CreditStatus {
  mode: CreditMode;
  limit: number | null;
  invoices: number;
  deliveryNotes: number;
  orders: number;
  creditBalance: number;
  used: number;
  available: number | null;
  wouldExceed: boolean;
  canOverride: boolean;
}

export interface CreditWarning {
  limit: number;
  used: number;
  added: number;
  over: number;
}

/** Porcentaje del límite usado, para la barra. */
export function creditUsedPercent(status: Pick<CreditStatus, 'limit' | 'used'>): number {
  if (status.limit === null) return 0;
  if (status.limit <= 0) return status.used > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, (status.used / status.limit) * 100));
}

export type CreditTone = 'accent' | 'warning' | 'danger';

export function creditTone(status: Pick<CreditStatus, 'limit' | 'used'>): CreditTone {
  if (status.limit === null) return 'accent';
  if (status.used > status.limit) return 'danger';
  return creditUsedPercent(status) >= 80 ? 'warning' : 'accent';
}

interface LineForExposure {
  baseId?: string | null;
  baseLine?: number | null;
  quantity?: unknown;
  price?: unknown;
}

const lineNet = (line: LineForExposure) => Number(line.quantity) * Number(line.price) || 0;

/**
 * Lo que un documento añadiría a la deuda: lo que viene de otro documento ya estaba
 * contado. Es una previsión para avisar antes; quien decide es el servidor.
 */
export function newExposure(lines: LineForExposure[], total: number): number {
  const all = lines.reduce((sum, line) => sum + lineNet(line), 0);
  if (all <= 0) return 0;
  const fresh = lines
    .filter((line) => !line.baseId && !line.baseLine)
    .reduce((sum, line) => sum + lineNet(line), 0);
  return Math.round((total * fresh * 100) / all) / 100;
}

export interface DunningLevel {
  days: number;
  subject: string;
  body: string;
}

export interface DunningSettings {
  levels: DunningLevel[];
  minDaysBetween: number;
  autoSend: boolean;
}

export interface SalesSettings {
  creditMode: CreditMode;
  dunning: DunningSettings;
}

export interface OverdueInvoice {
  id: string;
  code: string;
  date: string;
  dueDate: string;
  total: number;
  overdue: number;
  days: number;
  sentLevel: number;
  reachedLevel: number;
  nextLevel: number | null;
}

export interface OverdueCustomer {
  partnerId: string;
  name: string;
  email: string | null;
  excluded: boolean;
  total: number;
  claimable: number;
  oldestDays: number;
  level: number;
  needsLetter: boolean;
  lastLetterAt: string | null;
  daysSinceLetter: number | null;
  invoices: OverdueInvoice[];
}

export interface LetterPreview {
  partnerId: string;
  name: string;
  to: string | null;
  level: number;
  total: number;
  subject: string;
  html: string;
  text: string;
  invoices: OverdueInvoice[];
  excluded: boolean;
  lastLetterAt: string | null;
  daysSinceLetter: number | null;
  needsLetter: boolean;
  mailProblem: string | null;
}

export type LetterStatus = 'sending' | 'sent' | 'failed';

export interface DunningLetter {
  id: string;
  partnerId: string;
  name: string;
  level: number;
  status: LetterStatus;
  toAddress: string;
  subject: string;
  total: string | number;
  auto: boolean;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface DunningLetterDetail extends Omit<DunningLetter, 'name'> {
  html: string;
  lines: Array<{ id: string; code: string; level: number; amount: string; daysOverdue: number }>;
}

/** Totales de la pantalla de impagos. Los excluidos se ven, pero no están por reclamar. */
export function dunningTotals(customers: OverdueCustomer[]) {
  return customers.reduce(
    (totals, customer) => ({
      overdue: totals.overdue + customer.total,
      customers: totals.customers + 1,
      toClaim: totals.toClaim + (!customer.excluded && customer.needsLetter ? 1 : 0),
    }),
    { overdue: 0, customers: 0, toClaim: 0 },
  );
}

export const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'semiannual', 'yearly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export type RecurringStatus = 'active' | 'paused' | 'finished';

export const RECURRING_STATUS_VARIANT: Record<RecurringStatus, 'success' | 'warning' | 'neutral'> =
  {
    active: 'success',
    paused: 'warning',
    finished: 'neutral',
  };

export interface RecurringDocument {
  id: string;
  name: string;
  partnerId: string;
  partnerName: string;
  seriesId: string | null;
  warehouseId: string | null;
  header: Record<string, unknown>;
  lines: Array<Record<string, unknown>>;
  frequency: Frequency;
  startDate: string;
  nextDate: string | null;
  endDate: string | null;
  status: RecurringStatus;
  autoPost: boolean;
  autoSend: boolean;
  lastError: string | null;
  lastErrorAt: string | null;
  net: number;
  runCount?: number;
}

export interface RecurringRun {
  id: string;
  periodDate: string;
  documentId: string;
  docNum: number | null;
  note: string | null;
  createdAt: string;
}

export interface RecurringDetail extends RecurringDocument {
  runs: RecurringRun[];
}

/** Los campos de `useDocument` que se guardan en una recurrente. */
export const RECURRING_HEADER_FIELDS = [
  'documentTypeId',
  'paymentMethodId',
  'paymentTermId',
  'withholdingRate',
] as const;

const FISCAL_PREFIX = '__fiscal_';

/** La cabecera que se guarda, sacada de lo que el panel fiscal deja en `pluginData`. */
export function recurringHeaderFrom(pluginData: Record<string, unknown> | undefined) {
  const header: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(pluginData ?? {})) {
    if (key.startsWith(FISCAL_PREFIX) && value !== '' && value != null) {
      header[key.slice(FISCAL_PREFIX.length)] = value;
    }
  }
  return header;
}

/** Y al revés: lo guardado, tal como lo espera el panel fiscal. */
export function pluginDataFromHeader(header: Record<string, unknown> | undefined) {
  return Object.fromEntries(
    Object.entries(header ?? {}).map(([key, value]) => [`${FISCAL_PREFIX}${key}`, value]),
  );
}
