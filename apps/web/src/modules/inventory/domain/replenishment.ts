/** Reposición, sin React. Lo que se pide lo decide el servidor; aquí, lo que se elige en pantalla. */
export interface ReplenishmentRow {
  itemId: string;
  itemCode: string;
  itemName: string;
  uomCode: string | null;
  stock: number;
  committed: number;
  ordered: number;
  inDraft: number;
  projected: number;
  minStock: number;
  shortfall: number;
  suggested: number;
  reorderQty: number;
  leadTimeDays: number | null;
  supplierId: string | null;
  supplierName: string | null;
  lastPurchaseCost?: string | null;
}

export interface SupplierOption {
  id: string;
  name: string;
}

export interface CreatedOrder {
  id: string;
  docNum: number;
  supplierId: string;
  lines: number;
}

/** Lo que se va a pedir de un artículo, con lo que haya cambiado la persona. */
export interface OrderDraft {
  quantity: number | null;
  supplierId: string | null;
}

export function initialDrafts(rows: ReplenishmentRow[]): Record<string, OrderDraft> {
  return Object.fromEntries(
    rows.map((row) => [row.itemId, { quantity: row.suggested, supplierId: row.supplierId }]),
  );
}

/** Lo elegido, como lo pide la API. Lo que no tiene cantidad o proveedor no se puede pedir. */
export function linesToOrder(
  selected: Iterable<string>,
  drafts: Record<string, OrderDraft>,
): Array<{ itemId: string; quantity: number; supplierId: string }> {
  const lines: Array<{ itemId: string; quantity: number; supplierId: string }> = [];
  for (const itemId of selected) {
    const draft = drafts[itemId];
    if (draft && Number(draft.quantity) > 0 && draft.supplierId) {
      lines.push({ itemId, quantity: Number(draft.quantity), supplierId: draft.supplierId });
    }
  }
  return lines;
}

/** Cuántos pedidos saldrían: uno por proveedor. */
export function ordersCount(lines: Array<{ supplierId: string }>): number {
  return new Set(lines.map((line) => line.supplierId)).size;
}
