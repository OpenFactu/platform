/**
 * Campos personalizados (`p_*`) como columnas importables.
 *
 * Escribirlos ya funcionaba solo: como cada fila se despacha contra el router
 * real, `PluginFieldManager.validateAndExtract` corre igual que en un alta
 * desde la pantalla. Lo que faltaba era ofrecerlos — un catálogo con la lista
 * de campos escrita a mano deja fuera todo lo que la empresa haya añadido, y
 * el usuario ve que su columna "Nº de póliza" no tiene dónde ir.
 *
 * La lista se resuelve por tenant, no una vez al arrancar: cada empresa tiene
 * sus campos y sus plugins activos. Mismo criterio de "activo" que usa
 * `partners.ts` — los de plugin dependen de que el plugin esté activado en el
 * tenant, y los creados desde la UI (`pluginId = '__user__'`) de que sean de
 * ese tenant.
 */

import { eq } from 'drizzle-orm';
import { ClientFactory } from '../tenant/ClientFactory';
import { TenantPluginCache } from '../plugins/TenantPluginCache';
import * as schema from '../../db/schema';
import type { ImportFieldDef, ImportFieldType, ImportObjectConfig } from './ImportRegistry';

/** Solo se importan columnas con este patrón — el mismo filtro que los routers. */
const PLUGIN_COL_RE = /^p_[A-Za-z0-9_]+$/;

const TYPE_MAP: Record<string, ImportFieldType> = {
  TEXT: 'string',
  INTEGER: 'number',
  DECIMAL: 'number',
  BOOLEAN: 'boolean',
  DATE: 'date',
  ENUM: 'enum',
  MULTISELECT: 'string',
  JSONB: 'string',
  REFERENCE: 'ref',
};

function toImportField(def: any): ImportFieldDef | null {
  if (!PLUGIN_COL_RE.test(def.fieldName)) return null;

  const type = TYPE_MAP[def.fieldType] || 'string';
  const field: ImportFieldDef = {
    key: def.fieldName,
    label: def.label || def.fieldName,
    type,
    required: def.required ? 'onInsert' : false,
    help: def.helpText || undefined,
  };

  if (type === 'enum') {
    const options: any[] = Array.isArray(def.options) ? def.options : [];
    field.enumValues = options
      .map((o) => (typeof o === 'string' ? o : o?.value))
      .filter((v): v is string => typeof v === 'string');
  }

  if (type === 'ref' && def.refTable) {
    const display = def.refDisplayField || 'name';
    field.ref = {
      table: def.refTable,
      // Se busca por lo que se enseña y, además, por código: en un fichero de
      // migración lo normal es que venga el código, no el nombre bonito.
      matchBy: [...new Set([display, 'code', 'name'])],
      label: def.label || def.refTable,
    };
  }

  // Un campo de solo lectura no se puede escribir desde el formulario; que se
  // pudiera desde un Excel sería una puerta trasera.
  return def.readOnly ? null : field;
}

/** Campos personalizados activos de una tabla, ya como columnas importables. */
export async function pluginImportFields(
  tableName: string,
  tenantId: string,
): Promise<ImportFieldDef[]> {
  try {
    const publicDb = ClientFactory.getClient('public');
    const defs = await publicDb
      .select()
      .from(schema.pluginFields)
      .where(eq(schema.pluginFields.tableName, tableName));

    return (defs as any[])
      .filter((def) => {
        if (def.pluginId === '__user__') return def.tenantId === tenantId;
        return TenantPluginCache.isActive(tenantId, def.pluginId);
      })
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map(toImportField)
      .filter((f): f is ImportFieldDef => f !== null);
  } catch (e: any) {
    // Un fallo leyendo los campos personalizados no debe tumbar el catálogo
    // entero: se importa sin ellos y se deja constancia.
    console.warn(`[DataImport] No se pudieron leer los campos p_* de ${tableName}:`, e?.message);
    return [];
  }
}

/**
 * El objeto con sus campos personalizados añadidos al final. Devuelve una
 * COPIA: el registro global es compartido por todos los tenants y no puede
 * quedarse con los campos de uno.
 */
export async function withPluginFields(
  config: ImportObjectConfig,
  tenantId: string,
): Promise<ImportObjectConfig> {
  const extra = await pluginImportFields(config.table, tenantId);
  if (extra.length === 0) return config;
  return { ...config, fields: [...config.fields, ...extra] };
}
