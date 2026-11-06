import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm';

/**
 * Operadores que reciben los plugins en `context.db.ops`. Tienen que ser los
 * del servidor: los de otra copia de `drizzle-orm` instalada en el plugin no
 * los reconoce el cliente.
 */
export const pluginDbOperators = {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
};
