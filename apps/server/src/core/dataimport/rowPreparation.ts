/**
 * Convierte una fila del fichero en el body que espera el endpoint.
 *
 * Vive aparte del `ImportJobRunner` porque es donde está toda la decisión y
 * ninguna de la fontanería: aquí no se escribe nada ni se toca el estado del
 * trabajo, solo se convierte, se valida y se resuelve. Eso lo hace testeable
 * sin base de datos ni servidor, que es justo lo que hace falta para tener
 * confianza en un importador.
 *
 * Reglas que implementa, todas visibles en los tests:
 *  - Una celda vacía NO se envía: al crear deja que el endpoint aplique su
 *    valor por defecto, al actualizar deja el valor que ya hubiera.
 *  - "Obligatorio al crear" no lo es al actualizar.
 *  - Una referencia que no se encuentra es un error de fila, no un nulo
 *    silencioso: dejar `groupId` vacío crearía el registro mal colocado.
 */

import type { ImportObjectConfig, ImportFieldDef } from './ImportRegistry';
import { coerceValue } from './coerce';
import type { TenantLookup } from './TenantLookup';

export type ImportMode = 'insert' | 'update' | 'upsert';

export interface PreparedRow {
  ok: true;
  body: any;
  creating: boolean;
  existingId?: string;
  /** Código natural de la fila, para enseñarlo en el informe. */
  code?: string;
}

export interface RejectedRow {
  ok: false;
  message: string;
}

/**
 * El `tsconfig` del server va sin `strict`, y sin `strictNullChecks` el
 * estrechamiento por el discriminante `ok` no llega a aplicarse: un
 * `if (!prepared.ok)` sigue viendo la unión entera. Con el predicado
 * explícito el compilador sí distingue las dos formas.
 */
export function isRejected(row: PreparedRow | RejectedRow): row is RejectedRow {
  return row.ok === false;
}

export interface PrepareArgs {
  config: ImportObjectConfig;
  mapping: Record<string, string>;
  mode: ImportMode;
  matchBy?: string;
  row: Record<string, any>;
  lookup: Pick<TenantLookup, 'resolveRef' | 'findExisting'>;
  /** Líneas del documento agrupadas por su columna de enlace. */
  linesByKey?: Map<string, Array<Record<string, any>>> | null;
  /**
   * Valores de clave única ya vistos en ESTE fichero, por clave. Lo mantiene
   * el motor entre filas para detectar el duplicado dentro del propio Excel,
   * que la base de datos no puede ver hasta que se escribe la segunda.
   */
  seenKeys?: Map<string, Set<string>>;
}

/** Escribe 'address.street' como body.address.street. */
export function setPath(target: any, path: string, value: any): void {
  const parts = path.split('.');
  let node = target;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

export function isBlank(v: any): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function fieldIsRequired(field: ImportFieldDef, creating: boolean): boolean {
  if (field.required === true) return true;
  if (field.required === 'onInsert') return creating;
  return false;
}

export async function prepareRow(args: PrepareArgs): Promise<PreparedRow | RejectedRow> {
  const { config, mapping, mode, matchBy, row, lookup, linesByKey } = args;
  const fieldsByKey = new Map(config.fields.map((f) => [f.key, f]));

  // 1. Convertir cada celda mapeada al tipo de su campo.
  const values: Record<string, any> = {};
  const problems: string[] = [];

  for (const [column, fieldKey] of Object.entries(mapping)) {
    const field = fieldsByKey.get(fieldKey);
    if (!field) continue; // es un campo de líneas, o uno que ya no existe
    const { value, error } = coerceValue(field, row[column]);
    if (error) problems.push(`${field.label}: ${error}`);
    else if (!isBlank(value)) values[fieldKey] = value;
  }

  if (problems.length > 0) return { ok: false, message: problems.join('; ') };

  // 2. ¿Alta o actualización? Se decide antes de exigir obligatorios, porque
  //    "obligatorio al crear" no lo es al actualizar.
  let existingId: string | undefined;
  if (mode !== 'insert') {
    const key = config.naturalKeys.find((k) => k.key === matchBy);
    if (!key) return { ok: false, message: `Clave de búsqueda no válida: ${matchBy}` };

    const keyValue = values[key.key];
    if (isBlank(keyValue)) {
      return { ok: false, message: `Falta ${key.label}, que es la clave de búsqueda` };
    }

    const found = await lookup.findExisting(config.table, key.column, String(keyValue));
    if (found) existingId = found;
    else if (mode === 'update') {
      return { ok: false, message: `No existe ningún registro con ${key.label} = "${keyValue}"` };
    }
  }

  const creating = !existingId;

  // 3. Colisiones de clave única, ANTES de escribir.
  //
  // Sin esto, un código o un NIF repetido solo se descubre cuando Postgres
  // rechaza el INSERT — y entonces el simulacro habría dicho que todo iba
  // bien. En una migración es el error más habitual y el que más filas se
  // lleva por delante, así que merece detectarse por adelantado y con un
  // mensaje que diga qué campo y qué valor.
  if (creating) {
    for (const key of config.naturalKeys) {
      if (!key.unique) continue;
      const value = values[key.key];
      if (isBlank(value)) continue;

      const normalized = String(value).toLowerCase();
      const seen = args.seenKeys?.get(key.key);
      if (seen?.has(normalized)) {
        return { ok: false, message: `${key.label} "${value}" está repetido en el fichero` };
      }

      const clash = await lookup.findExisting(config.table, key.column, String(value));
      if (clash) {
        return { ok: false, message: `Ya existe un registro con ${key.label} = "${value}"` };
      }

      if (args.seenKeys) {
        if (!seen) args.seenKeys.set(key.key, new Set([normalized]));
        else seen.add(normalized);
      }
    }
  }

  // 4. Obligatorios.
  const missing = config.fields
    .filter((f) => fieldIsRequired(f, creating) && isBlank(values[f.key]))
    .map((f) => f.label);
  if (missing.length > 0) {
    return { ok: false, message: `Faltan campos obligatorios: ${missing.join(', ')}` };
  }

  // 5. Referencias y montaje del body.
  const body: any = {};
  for (const field of config.fields) {
    const value = values[field.key];
    if (isBlank(value)) continue;

    if (field.type === 'ref' && field.ref) {
      const id = await lookup.resolveRef(field.ref, String(value));
      if (!id) {
        return {
          ok: false,
          message: `No se encontró el ${field.ref.label} "${value}" (campo ${field.label})`,
        };
      }
      setPath(body, field.bodyKey || field.key, id);
      continue;
    }

    setPath(body, field.bodyKey || field.key, value);
  }

  // 6. Líneas, si el objeto las tiene.
  if (config.lines) {
    const groupValue = String(row[config.lines.groupBy] ?? '').trim();
    const lineRows = linesByKey?.get(groupValue) || [];
    if (lineRows.length === 0) {
      return { ok: false, message: 'El documento no tiene ninguna línea en el fichero de líneas' };
    }
    const built = await buildLines(config, mapping, lineRows, lookup);
    if ('error' in built) return { ok: false, message: built.error };
    body[config.lines.bodyKey] = built.lines;
  }

  const finalBody = config.transform
    ? config.transform(body, { mode: creating ? 'insert' : 'update', existingId })
    : body;

  return { ok: true, body: finalBody, creating, existingId, code: values.code };
}

async function buildLines(
  config: ImportObjectConfig,
  mapping: Record<string, string>,
  lineRows: Array<Record<string, any>>,
  lookup: PrepareArgs['lookup'],
): Promise<{ lines: any[] } | { error: string }> {
  const fieldsByKey = new Map((config.lines?.fields || []).map((f) => [f.key, f]));
  const lines: any[] = [];

  for (let i = 0; i < lineRows.length; i++) {
    const source = lineRows[i];
    const line: any = {};

    for (const [column, fieldKey] of Object.entries(mapping)) {
      const field = fieldsByKey.get(fieldKey);
      if (!field) continue;
      const { value, error } = coerceValue(field, source[column]);
      if (error) return { error: `Línea ${i + 1} · ${field.label}: ${error}` };
      if (isBlank(value)) continue;

      if (field.type === 'ref' && field.ref) {
        const id = await lookup.resolveRef(field.ref, String(value));
        if (!id)
          return { error: `Línea ${i + 1}: no se encontró el ${field.ref.label} "${value}"` };
        setPath(line, field.bodyKey || field.key, id);
        continue;
      }
      setPath(line, field.bodyKey || field.key, value);
    }

    const missing = (config.lines?.fields || [])
      .filter((f) => fieldIsRequired(f, true) && isBlank(line[f.bodyKey || f.key]))
      .map((f) => f.label);
    if (missing.length > 0) return { error: `Línea ${i + 1}: faltan ${missing.join(', ')}` };

    lines.push(line);
  }

  return { lines };
}
