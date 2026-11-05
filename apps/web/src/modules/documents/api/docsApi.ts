import { apiClient } from '@/shared/http';
import type {
  CreditNoteBody,
  CreditNotePreparation,
  InvoiceCreditNotes,
  InvoiceSide,
} from '../domain/creditNote';
import type {
  NoteReturnBody,
  NoteReturnPreparation,
  NoteReturnResult,
} from '../domain/deliveryReturn';

/**
 * Operaciones comunes del motor de documentos sobre su endpoint REST
 * (/api/sales, /api/sales/invoices, /api/purchases/orders, ...). Las seis
 * páginas legacy comparten flujo: list / get / create / post / cancel.
 */
export const docsApi = {
  list: <T = any>(endpoint: string) => apiClient.get<T[]>(endpoint),
  get: <T = any>(endpoint: string, id: string) => apiClient.get<T>(`${endpoint}/${id}`),
  create: <T = any>(endpoint: string, data: unknown) => apiClient.post<T>(endpoint, data),
  /** Asentar (post) el documento. */
  post: (endpoint: string, id: string) => apiClient.post<unknown>(`${endpoint}/${id}/post`),
  cancel: (endpoint: string, id: string) => apiClient.post<unknown>(`${endpoint}/${id}/cancel`),
};

export interface CreditBalance {
  total: number;
  notes: Array<{
    id: string;
    docNum: number;
    date: string;
    total: number;
    applied: number;
    available: number;
  }>;
}

export interface CreditTarget {
  id: string;
  docNum: number;
  date: string;
  total: string;
  amountPaid: string | null;
  seriesPrefix: string | null;
  periodCode: string | null;
  remaining: number;
}

const invoicesApi = (side: InvoiceSide) =>
  side === 'sales' ? '/api/sales/invoices' : '/api/purchases/invoices';

/** Abonos: corregir una factura emitida y usar lo que quede a favor. */
export const creditNoteApi = {
  ofInvoice: (side: InvoiceSide, id: string) =>
    apiClient.get<InvoiceCreditNotes>(`${invoicesApi(side)}/${id}/credit-notes`),
  prepare: (side: InvoiceSide, id: string) =>
    apiClient.get<CreditNotePreparation>(`${invoicesApi(side)}/${id}/credit-note`),
  create: (side: InvoiceSide, id: string, data: CreditNoteBody) =>
    apiClient.post<{ id: string; docNum: number }>(`${invoicesApi(side)}/${id}/credit-note`, data),
  balance: (side: InvoiceSide, partnerId: string) =>
    apiClient.get<CreditBalance>(
      `${invoicesApi(side)}/credit-balance?partnerId=${encodeURIComponent(partnerId)}`,
    ),
  targets: (side: InvoiceSide, id: string) =>
    apiClient.get<CreditTarget[]>(`${invoicesApi(side)}/${id}/credit-targets`),
  apply: (side: InvoiceSide, id: string, data: { targetInvoiceId: string; amount: number }) =>
    apiClient.post<unknown>(`${invoicesApi(side)}/${id}/apply-credit`, data),
};

/** Devolver mercancía desde un albarán sin facturar. */
export const deliveryReturnApi = {
  prepare: (noteId: string) =>
    apiClient.get<NoteReturnPreparation>(`/api/sales/delivery-notes/${noteId}/return`),
  create: (noteId: string, data: NoteReturnBody) =>
    apiClient.post<NoteReturnResult>(`/api/sales/delivery-notes/${noteId}/return`, data),
};

/** Envío de documentos por email. */
export const documentEmailApi = {
  sendOne: (data: Record<string, unknown>) =>
    apiClient.post<unknown>('/api/email/send-document', data),
  sendMany: (data: Record<string, unknown>) =>
    apiClient.post<unknown>('/api/email/send-documents', data),
};

export interface DocumentSeries {
  id: string;
  code: string;
  name?: string | null;
  [key: string]: unknown;
}

export const seriesApi = {
  list: () => apiClient.get<DocumentSeries[]>('/api/series'),
  create: (data: Record<string, unknown>) => apiClient.post<DocumentSeries>('/api/series', data),
  remove: (id: string) => apiClient.delete<void>(`/api/series/${id}`),
};

export interface PriceList {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface PriceListEntry {
  id: string;
  itemId: string;
  price: number | string;
  [key: string]: unknown;
}

export const priceListsApi = {
  list: () => apiClient.get<PriceList[]>('/api/pricelists'),
  create: (data: Record<string, unknown>) => apiClient.post<PriceList>('/api/pricelists', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<PriceList>(`/api/pricelists/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/pricelists/${id}`),
  prices: (listId: string) => apiClient.get<PriceListEntry[]>(`/api/pricelists/${listId}/prices`),
  setPrice: (listId: string, itemId: string, price: number) =>
    apiClient.post<PriceListEntry>(`/api/pricelists/${listId}/prices`, { itemId, price }),
};
