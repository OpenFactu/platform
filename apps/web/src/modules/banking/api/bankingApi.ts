import { apiClient } from '@/shared/http';
import type {
  BankAccount,
  BankAccountForm,
  BankAccountFormOptions,
  BankAccountOption,
  BatchCandidate,
  BatchExporterOption,
  BatchKind,
  LedgerAccount,
  LineStatus,
  LineSuggestions,
  PaymentBatchDetail,
  PaymentBatchRow,
  StatementFormat,
  StatementImportResult,
  StatementLine,
  StatementLineDetail,
  StatementMapping,
  StatementPreview,
} from '../domain/banking';

export const bankAccountsApi = {
  list: () => apiClient.get<BankAccount[]>('/api/bank-accounts'),
  options: () => apiClient.get<BankAccountOption[]>('/api/bank-account-options'),
  formOptions: () => apiClient.get<BankAccountFormOptions>('/api/bank-accounts/form-options'),
  create: (data: BankAccountForm) => apiClient.post<{ id: string }>('/api/bank-accounts', data),
  update: (id: string, data: Partial<BankAccountForm>) =>
    apiClient.patch<{ id: string }>(`/api/bank-accounts/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/bank-accounts/${id}`),
};

interface StatementFile {
  fileName: string;
  contentBase64: string;
  format: string;
  mapping?: StatementMapping;
}

export interface DifferenceBody {
  accountId: string;
  description?: string;
}

export const bankStatementsApi = {
  formats: () => apiClient.get<StatementFormat[]>('/api/bank-statements/formats'),
  ledgerAccounts: () => apiClient.get<LedgerAccount[]>('/api/bank-statements/ledger-accounts'),
  preview: (file: StatementFile) =>
    apiClient.post<StatementPreview>('/api/bank-statements/preview', file),
  import: (data: StatementFile & { bankAccountId: string }) =>
    apiClient.post<StatementImportResult>('/api/bank-statements/import', data),
  lines: (bankAccountId: string, status?: LineStatus) =>
    apiClient.get<{ lines: StatementLine[]; counts: Record<LineStatus, number> }>(
      '/api/bank-statements/lines',
      { query: { bankAccountId, status } },
    ),
  line: (id: string) => apiClient.get<StatementLineDetail>(`/api/bank-statements/lines/${id}`),
  suggestions: (id: string, q?: string) =>
    apiClient.get<LineSuggestions>(`/api/bank-statements/lines/${id}/suggestions`, {
      query: { q },
    }),
  match: (id: string, data: { paymentIds: string[]; difference?: DifferenceBody }) =>
    apiClient.post<unknown>(`/api/bank-statements/lines/${id}/match`, data),
  pay: (
    id: string,
    data: {
      invoices: Array<{ kind: string; id: string; amount: number }>;
      difference?: DifferenceBody;
    },
  ) => apiClient.post<unknown>(`/api/bank-statements/lines/${id}/pay`, data),
  entry: (id: string, data: DifferenceBody) =>
    apiClient.post<unknown>(`/api/bank-statements/lines/${id}/entry`, data),
  undo: (id: string) => apiClient.post<unknown>(`/api/bank-statements/lines/${id}/undo`),
  ignore: (id: string, ignored: boolean) =>
    apiClient.post<unknown>(`/api/bank-statements/lines/${id}/ignore`, { ignored }),
};

export const paymentBatchesApi = {
  list: () => apiClient.get<PaymentBatchRow[]>('/api/payment-batches'),
  get: (id: string) => apiClient.get<PaymentBatchDetail>(`/api/payment-batches/${id}`),
  candidates: (kind: BatchKind, until?: string) =>
    apiClient.get<BatchCandidate[]>('/api/payment-batches/candidates', {
      query: { kind, until },
    }),
  exporters: (kind: BatchKind) =>
    apiClient.get<BatchExporterOption[]>('/api/payment-batches/exporters', { query: { kind } }),
  create: (data: {
    kind: BatchKind;
    bankAccountId: string;
    chargeDate: string;
    lines: Array<{ invoiceId: string; dueDate: string; amount: number }>;
  }) => apiClient.post<{ id: string; code: string }>('/api/payment-batches', data),
  remove: (id: string) => apiClient.delete<unknown>(`/api/payment-batches/${id}`),
  generate: (id: string, exporterId: string) =>
    apiClient.post<{ fileName: string }>(`/api/payment-batches/${id}/generate`, { exporterId }),
  file: (id: string) => apiClient.getBlob(`/api/payment-batches/${id}/file`),
  close: (id: string) => apiClient.post<unknown>(`/api/payment-batches/${id}/close`),
  returnLine: (id: string, lineId: string, reason: string) =>
    apiClient.post<unknown>(`/api/payment-batches/${id}/lines/${lineId}/return`, { reason }),
};
