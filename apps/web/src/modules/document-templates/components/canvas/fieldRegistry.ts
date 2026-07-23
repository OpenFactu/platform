/**
 * Registro de campos navegable para el FieldPicker del diseñador de plantillas.
 *
 * Reutiliza FIELD_SCHEMA de @openfactu/pdf/browser como única fuente de verdad
 * sobre qué campos puede ligar una plantilla (doc, partner, company, lines,
 * generatedAt). Añade reglas de contexto:
 *
 * - Los campos del grupo `lines` son relativos a cada iteración y solo tienen
 *   sentido como columnas dentro de un `linesTable`. Un FieldElement suelto en
 *   cualquier banda (incluida `detail`) usa el resto de grupos.
 * - Los campos `generatedAt` están disponibles en cualquier banda.
 */

import { FIELD_SCHEMA, type FieldDef, type FieldGroup } from '@openfactu/pdf/browser';
import type { BandKind, FieldElement } from './types';

export type { FieldDef, FieldGroup };

/** Grupos disponibles para vincular un FieldElement libre, dependiendo de la banda. */
export function getFieldGroupsForFieldElement(_band: BandKind): FieldGroup[] {
  // Los FieldElements sueltos nunca iteran sobre líneas; excluimos el grupo
  // `lines` independientemente de la banda. El parámetro se mantiene por si
  // en el futuro alguna banda restringe más (p.ej. pageFooter).
  return FIELD_SCHEMA.filter((g) => g.group !== 'lines');
}

/** Único grupo usable para las columnas de un linesTable (las líneas en sí). */
export function getLineFieldGroup(): FieldGroup | undefined {
  return FIELD_SCHEMA.find((g) => g.group === 'lines');
}

/** Todos los grupos, útil para búsqueda global. */
export function getAllFieldGroups(): FieldGroup[] {
  return FIELD_SCHEMA;
}

/** Aplana todos los campos en una lista plana (para filtrado rápido). */
export function flattenFields(groups: FieldGroup[] = FIELD_SCHEMA): FieldDef[] {
  return groups.flatMap((g) => g.fields);
}

/**
 * Resuelve un formato razonable por defecto según el tipo del campo. El usuario
 * puede sobrescribirlo en el Inspector.
 */
export function inferDefaultFormat(field: FieldDef): FieldElement['format'] | undefined {
  if (field.type === 'date') return 'date';
  // Los campos marcados como objeto en el schema (direcciones estructuradas)
  // se formatean con el helper `formatAddress` por defecto para evitar
  // imprimir "[object Object]".
  if (field.type === 'object') return 'address';
  if (field.type !== 'number') return undefined;
  // Heurística por nombre: totales y precios → currency; el resto de números → number.
  const p = field.path.toLowerCase();
  if (/(total|subtotal|price|amount|importe)/.test(p)) return 'currency';
  return 'number';
}

/** Busca un FieldDef por path exacto (respetando el grupo). */
export function findFieldByPath(path: string): FieldDef | undefined {
  for (const g of FIELD_SCHEMA) {
    const found = g.fields.find((f) => f.path === path);
    if (found) return found;
  }
  return undefined;
}
