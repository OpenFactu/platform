/**
 * Tablas creadas desde la aplicación (Configuración → Tablas) y las que
 * declara un plugin con `migration.createTable`.
 *
 * No pueden estar en el catálogo estático porque no existen hasta que alguien
 * las crea, y son de cada empresa: se construyen al vuelo por tenant leyendo
 * `PluginTable` y sus columnas de `PluginField`, que es exactamente lo que
 * hace la pantalla de la tabla.
 *
 * Las filas se escriben por `POST /api/user-tables/:name/rows`, que ya pasa
 * por `PluginFieldManager.validateAndExtract`: los tipos, los obligatorios y
 * el gating por rol de cada columna se aplican igual que si se hubieran
 * tecleado en el formulario.
 */

import { ClientFactory } from '../../tenant/ClientFactory';
import { TenantPluginCache } from '../../plugins/TenantPluginCache';
import * as schema from '../../../db/schema';
import type { ImportObjectConfig } from '../ImportRegistry';
import { pluginImportFields } from '../pluginFields';
import userTablesRouter from '../../../api/userTables';

/** Nombre físico de la tabla: siempre con prefijo `pt_`. */
function physicalName(tableName: string): string {
  return tableName.startsWith('pt_') ? tableName : `pt_${tableName}`;
}

/** Nombre que espera la URL del endpoint (sin el prefijo). */
function routeName(tableName: string): string {
  return tableName.replace(/^pt_/, '');
}

/**
 * Objetos importables de las tablas propias de esta empresa. Devuelve [] si no
 * hay ninguna, que es el caso normal.
 */
export async function userTableObjects(tenantId: string): Promise<ImportObjectConfig[]> {
  let definitions: any[];
  try {
    const publicDb = ClientFactory.getClient('public');
    definitions = await publicDb.select().from(schema.pluginTables);
  } catch (e: any) {
    console.warn('[DataImport] No se pudieron leer las tablas propias:', e?.message);
    return [];
  }

  // Mismo criterio de visibilidad que el resto: las de la UI son del tenant
  // que las creó, las de plugin dependen de que el plugin esté activo.
  const visible = (definitions as any[]).filter((t) =>
    t.pluginId === '__user__'
      ? t.tenantId === tenantId
      : TenantPluginCache.isActive(tenantId, t.pluginId),
  );

  const objects: ImportObjectConfig[] = [];

  for (const def of visible) {
    const table = physicalName(def.tableName);
    const name = routeName(def.tableName);
    const fields = await pluginImportFields(table, tenantId);

    // Una tabla sin columnas propias no tiene nada que importar.
    if (fields.length === 0) continue;

    // El campo que la tabla usa como título es lo único que sirve para casar
    // una fila con un registro existente. No es único, así que vale para
    // buscar pero no para avisar de duplicados.
    const display =
      def.displayField && fields.some((f) => f.key === def.displayField)
        ? [
            {
              key: def.displayField as string,
              column: def.displayField as string,
              label: fields.find((f) => f.key === def.displayField)!.label,
            },
          ]
        : [];

    objects.push({
      id: `userTable:${name}`,
      label: def.label || name,
      description: def.description || 'Tabla propia de la empresa.',
      group: 'maestros',
      // La pantalla de estas tablas no tiene permiso granular propio: se
      // llega por /u/:name y el gate real es el rol admin del importador.
      modulePath: '/user-tables',
      table,
      router: () => userTablesRouter,
      createPath: `/${name}/rows`,
      updatePath: (id) => `/${name}/rows/${id}`,
      updateMethod: 'PATCH',
      deletePath: (id) => `/${name}/rows/${id}`,
      naturalKeys: display,
      fields,
    });
  }

  return objects;
}

/** Busca uno concreto. Devuelve undefined si el id no es de una tabla propia. */
export async function findUserTableObject(
  tenantId: string,
  objectId: string,
): Promise<ImportObjectConfig | undefined> {
  if (!objectId.startsWith('userTable:')) return undefined;
  const all = await userTableObjects(tenantId);
  return all.find((o) => o.id === objectId);
}
