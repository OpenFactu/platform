/** Tipo de documento interno de stock: traspaso, entrada o salida. */
export type StockDocKind = 'transfer' | 'receipt' | 'issue';

export interface StockDocLine {
  id?: string;
  itemId: string;
  quantity: number;
  fromZoneId?: string | null;
  toZoneId?: string | null;
  zoneId?: string | null;
  batchNum?: string | null;
  uomId?: string | null;
}

export interface StockDocument {
  id: string;
  code: string;
  status: string;
  fromWarehouseId?: string | null;
  toWarehouseId?: string | null;
  warehouseId?: string | null;
  lines?: StockDocLine[];
  [key: string]: unknown;
}
