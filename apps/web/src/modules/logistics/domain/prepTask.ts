export interface PickingTask {
  id: string;
  itemId: string | null;
  requestedQty: number;
  pickedQty: number;
  status: 'pending' | 'partial' | 'done' | 'missing';
  batchNumber: string | null;
  notes: string | null;
  warehouseId: string | null;
  zoneId: string | null;
}

export interface PrepResyncResult {
  added: number;
  deleted: number;
  preserved: number;
}

export interface PrepFromDocResult {
  shipmentId?: string;
  reused?: boolean;
  error?: string;
}
