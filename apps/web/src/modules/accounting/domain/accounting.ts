export interface Account {
  id: string;
  code: string;
  name: string;
  type?: string;
  parentId?: string | null;
  isActive?: boolean;
  [key: string]: unknown;
}

export interface AccountingPeriod {
  id: string;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  status?: string;
  [key: string]: unknown;
}

export interface JournalEntryLine {
  id?: string;
  accountId: string;
  debit: number | string;
  credit: number | string;
  description?: string | null;
  [key: string]: unknown;
}

export interface JournalEntry {
  id: string;
  number?: number | string | null;
  date: string;
  periodId?: string | null;
  description?: string | null;
  source?: string | null;
  status?: string;
  lines?: JournalEntryLine[];
  [key: string]: unknown;
}

export interface LedgerRow {
  id: string;
  date: string;
  debit: number | string;
  credit: number | string;
  [key: string]: unknown;
}

export interface Tax {
  id: string;
  code: string;
  rate: number | string;
  [key: string]: unknown;
}

export interface PaymentTermLine {
  days: number;
  percentage: number;
}

export interface PaymentTerm {
  id: string;
  name: string;
  lines: PaymentTermLine[];
  isActive: boolean;
  [key: string]: unknown;
}

export interface PaymentMethod {
  id: string;
  code: string;
  name: string;
  [key: string]: unknown;
}

export interface Payment {
  id: string;
  date: string;
  amount: string | number;
  paymentMethodId?: string | null;
  reference?: string | null;
  notes?: string | null;
  source?: string;
  createdAt?: string;
  salesInvoiceId?: string;
  purchaseInvoiceId?: string;
  /** Solo en la respuesta de creación: estado resultante de la factura. */
  paymentStatus?: string;
  [key: string]: unknown;
}
