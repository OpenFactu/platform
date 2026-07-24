export interface Uom {
  id: string;
  code: string;
  name: string;
  symbol?: string | null;
  /** Conversión a otra unidad base (p.ej. 1 caja = 12 uds). */
  baseUomId?: string | null;
  baseValue?: number | string | null;
}

/** Unidad de un artículo devuelta por /api/items/:id/uoms (base + alternativas). */
export interface ItemUomAlternative {
  /** La unidad base no lleva id (no es una fila de ItemAlternativeUom). */
  id?: string;
  uomId: string;
  code?: string | null;
  name?: string | null;
  factor: number | string;
  isBase?: boolean;
}
