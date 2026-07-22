export interface Warehouse {
  id: string;
  name: string;
  location?: string | null;
  isDefault?: boolean;
}

/** Ubicación/bin dentro de un almacén. */
export interface Zone {
  id: string;
  warehouseId: string;
  name: string;
  description?: string | null;
}
