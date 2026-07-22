import { apiClient } from '../../../shared/http';
import type { BatchOrSerial, Item, ZoneStock } from '../domain/item';
import type { StockDocKind, StockDocLine, StockDocument } from '../domain/stockMovement';

/** Consultas de stock auxiliares (escáner, lotes/series, zonas con stock). */
export const stockApi = {
  itemByBarcode: (code: string) =>
    apiClient.get<Item>(`/api/stock/items/by-barcode/${encodeURIComponent(code)}`),
  zonesWithStock: (itemId: string, warehouseId: string) =>
    apiClient.get<ZoneStock[]>(`/api/stock/items/${itemId}/zones-with-stock`, {
      query: { warehouseId },
    }),
  batches: (itemId: string) =>
    apiClient.get<BatchOrSerial[]>(`/api/stock/items/${itemId}/batches`),
  serials: (itemId: string) =>
    apiClient.get<BatchOrSerial[]>(`/api/stock/items/${itemId}/serials`),
};

const STOCK_DOC_ENDPOINTS: Record<StockDocKind, string> = {
  transfer: '/api/transfer-notes',
  receipt: '/api/goods-receipts',
  issue: '/api/goods-issues',
};

export interface StockDocInput {
  fromWarehouseId?: string;
  toWarehouseId?: string;
  warehouseId?: string;
  lines: StockDocLine[];
  [key: string]: unknown;
}

/** Documentos internos de stock: traspasos, entradas y salidas. */
export const stockDocsApi = {
  list: (kind: StockDocKind) => apiClient.get<StockDocument[]>(STOCK_DOC_ENDPOINTS[kind]),
  get: (kind: StockDocKind, id: string) =>
    apiClient.get<StockDocument>(`${STOCK_DOC_ENDPOINTS[kind]}/${id}`),
  create: (kind: StockDocKind, data: StockDocInput) =>
    apiClient.post<StockDocument>(STOCK_DOC_ENDPOINTS[kind], data),
  send: (kind: StockDocKind, id: string) =>
    apiClient.post<void>(`${STOCK_DOC_ENDPOINTS[kind]}/${id}/send`),
  receive: (kind: StockDocKind, id: string) =>
    apiClient.post<void>(`${STOCK_DOC_ENDPOINTS[kind]}/${id}/receive`),
  post: (kind: StockDocKind, id: string) =>
    apiClient.post<void>(`${STOCK_DOC_ENDPOINTS[kind]}/${id}/post`),
  remove: (kind: StockDocKind, id: string) =>
    apiClient.delete<void>(`${STOCK_DOC_ENDPOINTS[kind]}/${id}`),
};
