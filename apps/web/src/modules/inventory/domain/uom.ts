export interface Uom {
  id: string;
  code: string;
  name: string;
  symbol?: string | null;
  /** Conversión a otra unidad base (p.ej. 1 caja = 12 uds). */
  baseUomId?: string | null;
  baseValue?: number | string | null;
}

/** Unidad alternativa de un artículo (factor de conversión sobre la base). */
export interface ItemUomAlternative {
  id: string;
  uomId: string;
  uomCode?: string | null;
  factor: number;
}
