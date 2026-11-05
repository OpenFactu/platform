import type { FieldElement } from '../components/canvas/types';

/**
 * Campo arrastrable del panel "Campos" (estilo Crystal Reports). Al soltarlo en
 * el lienzo crea un elemento `field` enlazado a `canvasPath`; al soltarlo sobre
 * una tabla de líneas añade una columna con `linePath` (y engancha la tabla a
 * `lineSource` si la columna viene de una query).
 */
export interface FieldDescriptor {
  key: string;
  label: string;
  group: string;
  /** Ruta absoluta para un elemento Campo en el lienzo (ej. `doc.docCode`, `queries.q.0.col`). */
  canvasPath: string;
  /** Ruta relativa cuando se usa como columna de tabla (ej. `itemName`, `col`). */
  linePath?: string;
  /** `query:<nombre>` si la columna proviene de una consulta SQL. */
  lineSource?: string;
  format?: FieldElement['format'];
}

/** Objetivo del menú contextual: canvas vacío, una banda o un elemento. */
export type CtxTarget =
  | { scope: 'canvas'; x: number; y: number }
  | { scope: 'band'; x: number; y: number; bandId: string; xMm: number; yMm: number }
  | { scope: 'element'; x: number; y: number; bandId: string; elementId: string };
