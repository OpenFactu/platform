/**
 * Bancos, sin React: los tipos de la API y las cuentas de las pantallas. Las reglas de verdad están
 * en el servidor (`core/banking`); esto evita llegar hasta el error.
 */
export interface BankAccount {
  id: string;
  name: string;
  iban: string | null;
  swift: string | null;
  bankName: string | null;
  currencyId: string | null;
  currencyCode: string | null;
  accountId: string | null;
  accountCode: string | null;
  accountName: string | null;
  creditorId: string | null;
  isDefault: boolean;
  isActive: boolean;
  openLines: number;
}

export interface BankAccountOption {
  id: string;
  name: string;
  iban: string | null;
  isDefault: boolean;
}

export interface LedgerAccount {
  id: string;
  code: string;
  name: string;
}

export interface BankAccountFormOptions {
  accounts: LedgerAccount[];
  currencies: Array<{ id: string; code: string; name: string }>;
}

export interface BankAccountForm {
  name: string;
  iban: string;
  swift: string;
  bankName: string;
  currencyId: string;
  accountId: string;
  creditorId: string;
  isDefault: boolean;
  isActive: boolean;
}

export const emptyAccountForm = (): BankAccountForm => ({
  name: '',
  iban: '',
  swift: '',
  bankName: '',
  currencyId: '',
  accountId: '',
  creditorId: '',
  isDefault: false,
  isActive: true,
});

export const accountFormOf = (account: BankAccount): BankAccountForm => ({
  name: account.name,
  iban: formatIban(account.iban),
  swift: account.swift ?? '',
  bankName: account.bankName ?? '',
  currencyId: account.currencyId ?? '',
  accountId: account.accountId ?? '',
  creditorId: account.creditorId ?? '',
  isDefault: account.isDefault,
  isActive: account.isActive,
});

/** De cuatro en cuatro, como se lee. */
export const formatIban = (iban: string | null | undefined) =>
  (iban ?? '').replace(/(.{4})(?=.)/g, '$1 ');

export interface StatementFormat {
  id: string;
  label: string;
  extensions: string[];
}

export const STATEMENT_FIELDS = [
  'date',
  'valueDate',
  'amount',
  'debit',
  'credit',
  'description',
  'reference',
  'counterparty',
  'balance',
] as const;

export type StatementField = (typeof STATEMENT_FIELDS)[number];
export type StatementMapping = Partial<Record<StatementField, string>>;

export type StatementPreview =
  | {
      kind: 'table';
      headers: string[];
      total: number;
      rows: Array<Record<string, unknown>>;
      mapping: StatementMapping;
    }
  | {
      kind: 'parsed';
      total: number;
      lines: Array<{ date: string; amount: number; description?: string | null }>;
    };

export interface StatementImportResult {
  importId: string;
  added: number;
  skipped: number;
  rejected: Array<{ row: number; reason: string }>;
}

/** Lo que le falta al mapeo para poder importar. */
export const mappingProblem = (mapping: StatementMapping): 'date' | 'amount' | null => {
  if (!mapping.date) return 'date';
  if (!mapping.amount && !mapping.debit && !mapping.credit) return 'amount';
  return null;
};

export type LineStatus = 'open' | 'matched' | 'ignored';

export interface StatementLine {
  id: string;
  bankAccountId: string;
  date: string;
  valueDate: string | null;
  amount: string;
  description: string | null;
  reference: string | null;
  counterparty: string | null;
  balance: string | null;
  status: LineStatus;
}

export interface LineMatch {
  id: string;
  paymentId: string | null;
  journalEntryId: string | null;
  amount: string;
  createdFromLine: boolean;
  reference: string | null;
  invoiceCode: string | null;
}

export interface StatementLineDetail extends StatementLine {
  matches: LineMatch[];
}

export type MatchReason = 'amount' | 'reference' | 'partner' | 'date';

export interface SuggestedPayment {
  id: string;
  date: string;
  /** Con su signo: positivo si entra en la cuenta. */
  amount: number;
  reference: string | null;
  invoiceCode: string | null;
  partnerName: string | null;
  score: number;
  reasons: MatchReason[];
}

export interface SuggestedInvoice {
  id: string;
  kind: 'sales' | 'purchase';
  isCreditNote: boolean;
  code: string;
  partnerName: string;
  date: string;
  dueDate: string | null;
  remaining: number;
  score: number;
  reasons: MatchReason[];
}

export interface LineSuggestions {
  payments: SuggestedPayment[];
  invoices: SuggestedInvoice[];
}

const toCents = (amount: number) => Math.round(amount * 100);

/** Lo que falta por explicar del movimiento, en céntimos y con su signo. */
export const gapCents = (lineAmount: number, explainedCents: number) =>
  toCents(lineAmount) - explainedCents;

export const paymentsCents = (payments: SuggestedPayment[], ids: Set<string>) =>
  payments
    .filter((payment) => ids.has(payment.id))
    .reduce((sum, payment) => sum + toCents(payment.amount), 0);

/** Las facturas que se ofrecen van en el sentido del movimiento: suman con su signo. */
export const invoicesCents = (lineAmount: number, amounts: Record<string, number | null>) =>
  Object.values(amounts).reduce(
    (sum: number, amount) => sum + Math.sign(lineAmount) * toCents(Number(amount ?? 0)),
    0,
  );

/** Lo que se propone al marcar una factura: lo que queda de ella, sin pasarse del movimiento. */
export const proposedAmount = (remaining: number, lineAmount: number, explainedCents: number) => {
  const left = Math.abs(toCents(lineAmount) - explainedCents);
  return Math.min(toCents(remaining), left) / 100;
};

export type BatchKind = 'collection' | 'payment';
export type BatchStatus = 'draft' | 'generated' | 'closed';

export const BATCH_STATUS_VARIANT: Record<BatchStatus, 'neutral' | 'info' | 'success'> = {
  draft: 'neutral',
  generated: 'info',
  closed: 'success',
};

export interface BatchCandidate {
  invoiceId: string;
  code: string;
  partnerId: string;
  partnerName: string;
  dueDate: string;
  amount: number;
  iban: string | null;
  mandateRef: string | null;
  problems: Array<'noIban' | 'noMandate'>;
}

export const candidateKey = (candidate: Pick<BatchCandidate, 'invoiceId' | 'dueDate'>) =>
  `${candidate.invoiceId}|${candidate.dueDate}`;

export const candidatesTotal = (candidates: BatchCandidate[], picked: Set<string>) =>
  candidates
    .filter((candidate) => picked.has(candidateKey(candidate)))
    .reduce((sum, candidate) => sum + toCents(candidate.amount), 0) / 100;

export interface PaymentBatchRow {
  id: string;
  code: string;
  kind: BatchKind;
  status: BatchStatus;
  chargeDate: string;
  total: string;
  accountName: string | null;
  lineCount: number;
  fileName: string | null;
}

export interface PaymentBatchLine {
  id: string;
  partnerName: string;
  invoiceCode: string | null;
  dueDate: string;
  amount: string;
  iban: string | null;
  mandateRef: string | null;
  paymentId: string | null;
  status: 'open' | 'returned';
  returnReason: string | null;
  returnedAt: string | null;
}

export interface PaymentBatchDetail extends PaymentBatchRow {
  exporterId: string | null;
  lines: PaymentBatchLine[];
}

export interface BatchExporterOption {
  id: string;
  label: string;
}

/** Una remesa recién elegida se cobra pronto, pero nunca en el pasado. */
export const defaultChargeDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return date.toISOString().slice(0, 10);
};

export const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });
