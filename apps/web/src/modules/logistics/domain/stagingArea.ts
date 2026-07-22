export interface StagingArea {
  id: string;
  code: string;
  name: string;
  warehouseId: string | null;
  partnerId: string | null;
  platformId: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  [key: string]: unknown;
}

export interface StagingAreaItem {
  id: string;
  stagingAreaId: string;
  itemId: string;
  expectedQty: number | null;
  notes: string | null;
}

/** Payload consumido por el QR/packing-list/etiquetas (mismo endpoint para los tres). */
export interface StagingAreaPayload {
  staging?: { id: string; code: string; name: string } | null;
  packages?: Array<{
    id: string;
    code: string;
    status: string;
    weightKg: number | null;
    shipmentId: string | null;
    sealedAt?: string | null;
  }>;
  shipments?: Array<{
    id: string;
    code?: string | null;
    destinationAddress?: string | null;
  }>;
  routes?: Array<{
    id: string;
    code: string;
    name: string | null;
    driverName?: string | null;
    vehiclePlate?: string | null;
  }>;
}
