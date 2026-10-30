/**
 * Comprobaciones del paso de mapeo. Puras: entran objeto + mapeo + modo y
 * sale la lista de avisos, sin tocar estado ni red. El paso 3 solo las pinta.
 *
 * Son avisos previos, no la validación de verdad — esa la hace el servidor
 * fila a fila. Lo que se busca aquí es que nadie llegue a la simulación con un
 * fichero al que le falta la columna del nombre y descubra 5.000 errores
 * idénticos.
 */

import { t } from '@/i18n/i18n';
import type { ImportField, ImportMode, ImportObject } from '../types';

export interface MappingIssue {
  level: 'error' | 'warning';
  message: string;
}

/** Campos que hay que rellenar sí o sí en el modo elegido. */
export function requiredFields(object: ImportObject, mode: ImportMode): ImportField[] {
  return object.fields.filter((f) => {
    if (f.required === true) return true;
    // "Obligatorio al crear" deja de serlo si el fichero solo actualiza.
    if (f.required === 'onInsert') return mode !== 'update';
    return false;
  });
}

/** Campos del catálogo que ninguna columna alimenta. */
export function unmappedRequired(
  object: ImportObject,
  mapping: Record<string, string>,
  mode: ImportMode,
): ImportField[] {
  const mapped = new Set(Object.values(mapping));
  return requiredFields(object, mode).filter((f) => !mapped.has(f.key));
}

/**
 * Columnas del fichero que no van a ninguna parte.
 *
 * La columna que empareja cabeceras con líneas no cuenta: no se mapea a
 * ningún campo a propósito, y avisar de que "no se va a importar" sería
 * mentir — sin ella no se importaría nada.
 */
export function unmappedColumns(
  headers: string[],
  mapping: Record<string, string>,
  groupBy?: string,
): string[] {
  return headers.filter((h) => !mapping[h] && h !== groupBy);
}

/** Dos columnas apuntando al mismo campo: una pisaría a la otra. */
export function duplicateTargets(mapping: Record<string, string>): string[] {
  const count = new Map<string, number>();
  for (const field of Object.values(mapping)) {
    count.set(field, (count.get(field) || 0) + 1);
  }
  return [...count.entries()].filter(([, n]) => n > 1).map(([field]) => field);
}

export function checkMapping(
  object: ImportObject,
  headers: string[],
  mapping: Record<string, string>,
  mode: ImportMode,
  matchBy?: string,
): MappingIssue[] {
  const issues: MappingIssue[] = [];
  const labelOf = (key: string) => object.fields.find((f) => f.key === key)?.label || key;

  if (Object.keys(mapping).length === 0) {
    issues.push({ level: 'error', message: t('dataImport.checks.noMapping') });
    return issues;
  }

  for (const field of unmappedRequired(object, mapping, mode)) {
    issues.push({
      level: 'error',
      message: t('dataImport.checks.requiredUnmapped', { field: field.label }),
    });
  }

  for (const field of duplicateTargets(mapping)) {
    issues.push({
      level: 'error',
      message: t('dataImport.checks.duplicateTarget', { field: labelOf(field) }),
    });
  }

  if (mode !== 'insert') {
    const key = object.naturalKeys.find((k) => k.key === matchBy);
    if (!key) {
      issues.push({
        level: 'error',
        message: t('dataImport.checks.chooseMatchBy'),
      });
    } else if (!Object.values(mapping).includes(key.key)) {
      issues.push({
        level: 'error',
        message: t('dataImport.checks.matchByUnmapped', { field: key.label }),
      });
    }
  }

  if (object.lines && !headers.includes(object.lines.groupBy)) {
    issues.push({
      level: 'error',
      message: t('dataImport.checks.missingGroupBy', {
        column: object.lines.groupBy,
        lines: object.lines.label.toLowerCase(),
      }),
    });
  }

  const ignored = unmappedColumns(headers, mapping, object.lines?.groupBy);
  if (ignored.length > 0) {
    issues.push({
      level: 'warning',
      message:
        ignored.length === 1
          ? t('dataImport.checks.columnIgnored', { column: ignored[0] })
          : t('dataImport.checks.columnsIgnored', {
              count: ignored.length,
              columns: `${ignored.slice(0, 4).join(', ')}${ignored.length > 4 ? '…' : ''}`,
            }),
    });
  }

  return issues;
}

/** ¿Se puede pasar del paso de mapeo? */
export function mappingIsValid(issues: MappingIssue[]): boolean {
  return !issues.some((i) => i.level === 'error');
}
