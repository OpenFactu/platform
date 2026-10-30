/**
 * Catálogo de objetos importables. Mismo patrón que `DocumentRegistry`: un
 * registro que se puebla al arrancar (ver `registerImportObjects.ts`) y del
 * que salen tanto la lista que ve el usuario como las plantillas, la
 * validación y el destino de escritura.
 *
 * La idea de fondo: añadir una entidad nueva al importador debe ser UNA
 * entrada declarativa aquí, no tocar el motor. Por eso un objeto no trae
 * código de inserción: trae el router real al que hay que despachar la fila
 * (ver `RouterDispatcher.ts`), la lista de campos y cómo resolver sus
 * referencias.
 */

import type { Router } from 'express';

export type ImportFieldType = 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'ref';

/** Cómo se convierte una celda de 'ITM-001' al id que espera el endpoint. */
export interface ImportFieldRef {
  /** Tabla del tenant donde buscar (nombre físico, p.ej. 'Item'). */
  table: string;
  /** Columnas por las que se intenta casar, en orden. */
  matchBy: string[];
  /** Cómo se llama esto para el humano, en los mensajes de error. */
  label: string;
}

export interface ImportFieldDef {
  /** Cabecera de la columna en la plantilla. */
  key: string;
  label: string;
  type: ImportFieldType;
  /**
   * `true` siempre obligatorio; `'onInsert'` solo cuando se está creando
   * (en modo actualización puede venir vacío y se deja como está).
   */
  required?: boolean | 'onInsert';
  enumValues?: string[];
  /** Alimenta la fila de ejemplo de la plantilla. */
  example?: string;
  /** Se escribe en la hoja de instrucciones de la plantilla. */
  help?: string;
  /** Nombre en el body del endpoint, si difiere de `key`. */
  bodyKey?: string;
  /** Solo para `type: 'ref'`. */
  ref?: ImportFieldRef;
  /**
   * Campo anidado: 'address.street' se envía como `{ address: { street } }`.
   * El motor lo arma a partir del punto en `bodyKey`.
   */
  nested?: boolean;
}

export interface ImportObjectConfig {
  id: string;
  label: string;
  /** Frase corta bajo el nombre en el selector de objeto. */
  description?: string;
  group: 'maestros' | 'stock' | 'documentos' | 'contabilidad' | 'rrhh' | 'crm';
  /** Ruta de permiso del módulo, igual que en `RouteRegistry`/`PERMISSION_GROUPS`. */
  modulePath: string;
  /** Flag de `FlagsConfig` que tiene que estar activo para ofrecer el objeto. */
  featureFlag?: string;
  /** Tabla del tenant — se usa para buscar por clave natural y para contar. */
  table: string;

  /** El router real de `api/`, al que se despacha cada fila. */
  router: () => Router;
  /**
   * Ruta relativa al router para crear. Normalmente '/', pero admite función
   * porque hay endpoints cuyo padre va en la URL: el precio de un artículo se
   * crea en `/:priceListId/prices`, no en `/`.
   */
  createPath: string | ((body: any) => string);
  /** Ruta relativa para actualizar. Sin esto, el objeto es solo de alta. */
  updatePath?: (id: string) => string;
  updateMethod?: 'PATCH' | 'PUT';
  /** Ruta relativa para borrar. Sin esto, el objeto no se puede deshacer. */
  deletePath?: (id: string) => string;

  /**
   * Columnas por las que se puede casar una fila con un registro existente.
   *
   * `unique` marca las que la base de datos protege con un índice único. Solo
   * esas se comprueban por adelantado: así el simulacro puede avisar de un
   * código o un NIF repetido ANTES de escribir nada, en vez de dejar que
   * salte el error de Postgres a mitad del fichero. Un campo como el nombre
   * sirve para buscar pero no para eso — hay empresas que se llaman igual.
   */
  naturalKeys: Array<{ key: string; column: string; label: string; unique?: boolean }>;

  fields: ImportFieldDef[];

  /**
   * Objetos con líneas (documentos): un segundo fichero cuyas filas se
   * agrupan por `groupBy` y viajan dentro del body de la cabecera.
   */
  lines?: {
    label: string;
    /** Clave del body donde van: 'lines'. */
    bodyKey: string;
    /** Columna que empareja línea con cabecera (el "RecordKey" del DTW). */
    groupBy: string;
    fields: ImportFieldDef[];
  };

  /** Objetos que conviene importar antes. Solo informativo, para la UI. */
  dependsOn?: string[];

  /**
   * Retoque final del body justo antes de despachar, para lo que no se puede
   * expresar declarativamente. Debe ser la excepción, no la norma.
   */
  transform?: (body: any, ctx: { mode: 'insert' | 'update'; existingId?: string }) => any;
}

/**
 * Nombre de la columna que empareja una cabecera con sus líneas — el
 * "RecordKey" del DTW. La misma en todos los objetos con líneas: cambiarla por
 * objeto solo serviría para que el usuario tuviera que aprendérsela dos veces.
 */
export const GROUP_COLUMN = 'Referencia';

const registry = new Map<string, ImportObjectConfig>();

export const ImportRegistry = {
  register(config: ImportObjectConfig): void {
    if (registry.has(config.id)) {
      throw new Error(`[ImportRegistry] El objeto "${config.id}" ya estaba registrado`);
    }
    registry.set(config.id, config);
  },

  get(id: string): ImportObjectConfig | undefined {
    return registry.get(id);
  },

  /** Lanza si no existe — para las rutas, que deben responder 404 y no seguir. */
  require(id: string): ImportObjectConfig {
    const found = registry.get(id);
    if (!found) throw new Error(`Objeto de importación desconocido: ${id}`);
    return found;
  },

  all(): ImportObjectConfig[] {
    return [...registry.values()];
  },

  size(): number {
    return registry.size;
  },
};

/** Todos los campos de un objeto, incluidos los de líneas, con su origen. */
export function allFields(
  config: ImportObjectConfig,
): Array<ImportFieldDef & { scope: 'header' | 'line' }> {
  return [
    ...config.fields.map((f) => ({ ...f, scope: 'header' as const })),
    ...(config.lines?.fields || []).map((f) => ({ ...f, scope: 'line' as const })),
  ];
}
