export interface Item {
  id: string;
  code: string;
  barcode?: string | null;
  name: string;
  uomId?: string | null;
  categoryId?: string | null;
  basePrice?: number | string;
  /** 'N' sin gestión · 'B' por lote · 'S' por número de serie. */
  manageBy?: string | null;
  kind?: 'product' | 'box' | string;
  boxLengthMm?: number | null;
  boxWidthMm?: number | null;
  boxHeightMm?: number | null;
  boxMaxWeightKg?: number | null;
  boxTareWeightKg?: number | null;
  defaultWarehouseId?: string | null;
  defaultZoneId?: string | null;
  stock?: number;
  committed?: number;
  ordered?: number;
  /** Campos personalizados de plugins (p_*) y demás columnas dinámicas. */
  [key: string]: unknown;
}

export interface BatchOrSerial {
  batchNum: string;
  quantity?: number;
  expiryDate?: string | null;
}

export interface ZoneStock {
  zoneId: string;
  stock: number;
}
