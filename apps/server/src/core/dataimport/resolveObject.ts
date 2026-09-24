/**
 * El catálogo tal y como lo ve UNA empresa.
 *
 * `ImportRegistry` guarda lo que es igual para todos los tenants. Encima de
 * eso, cada empresa añade cosas suyas:
 *
 *  - Los campos personalizados `p_*` de sus entidades (ver `pluginFields.ts`).
 *  - Las tablas propias que haya creado, y las que traigan sus plugins
 *    activos (ver `objects/userTables.ts`).
 *
 * Todo lo que exponga o consuma la lista de campos —el catálogo, la plantilla,
 * el automapeo y el motor— tiene que pasar por aquí. Si no, el usuario ve
 * columnas que no puede mapear, o mapea columnas que luego se tiran.
 */

import { ImportRegistry, type ImportObjectConfig } from './ImportRegistry';
import { withPluginFields } from './pluginFields';
import { userTableObjects, findUserTableObject } from './objects/userTables';

/** Todos los objetos importables de una empresa, sin filtrar por permisos. */
export async function listImportObjects(tenantId: string): Promise<ImportObjectConfig[]> {
  const [core, custom] = await Promise.all([
    Promise.all(ImportRegistry.all().map((c) => withPluginFields(c, tenantId))),
    userTableObjects(tenantId),
  ]);
  return [...core, ...custom];
}

/** Un objeto concreto, ya enriquecido. `undefined` si no existe para esta empresa. */
export async function resolveImportObject(
  objectId: string,
  tenantId: string,
): Promise<ImportObjectConfig | undefined> {
  const base = ImportRegistry.get(objectId);
  if (base) return withPluginFields(base, tenantId);
  // Las tablas propias ya se construyen con sus campos dentro.
  return findUserTableObject(tenantId, objectId);
}
