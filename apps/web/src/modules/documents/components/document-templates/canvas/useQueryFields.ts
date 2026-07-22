import { templatesApi } from '../../../api';
import { useEffect, useState } from 'react';
import type { FieldDef, FieldGroup } from './fieldRegistry';
import type { CanvasLayout } from './types';

/**
 * Construye el catálogo de campos para plantillas SIN documento ligado
 * (FREE / LABEL): no tienen `doc.*`/`lines`/`company.*`, solo lo que devuelvan
 * sus consultas SQL (`queries`) y los `params`.
 *
 * Para cada consulta definida ejecuta `/test-query` (admin) y deriva las
 * columnas del resultado, exponiéndolas como `queries.<nombre>.0.<columna>`
 * (acceso a la primera fila). Si una consulta devuelve 0 filas no se pueden
 * derivar columnas → se omite (el usuario siempre puede escribir la ruta a mano).
 *
 * Añade además un grupo "Parámetros" con las claves de `testParams`
 * (`params.<clave>`).
 */
export interface QueryFields {
  /** Grupos para el FieldPicker de un elemento `field` (paths absolutos). */
  fieldGroups: FieldGroup[];
  /** Columnas por consulta, para usarlas como paths RELATIVOS en una tabla de líneas. */
  queryColumns: Record<string, string[]>;
}

export function useQueryFields(
  queries: CanvasLayout['queries'],
  testParams: Record<string, unknown> | undefined,
  headers: Record<string, string>,
  enabled: boolean,
): QueryFields {
  const [queryGroups, setQueryGroups] = useState<FieldGroup[]>([]);
  const [queryColumns, setQueryColumns] = useState<Record<string, string[]>>({});

  // Firma estable de las consultas para no re-disparar el efecto en cada render.
  const sig = JSON.stringify((queries ?? []).map((q) => [q.name, q.sql]));

  useEffect(() => {
    if (!enabled || !queries || queries.length === 0) {
      setQueryGroups([]);
      setQueryColumns({});
      return;
    }
    let cancelled = false;
    (async () => {
      const groups: FieldGroup[] = [];
      const colsByQuery: Record<string, string[]> = {};
      for (const q of queries) {
        try {
          const body: any = await templatesApi.testQuery({ name: q.name, sql: q.sql });
          if (body?.ok === false) continue;
          const rows = (body.rows ?? []) as Record<string, unknown>[];
          const cols = rows[0] ? Object.keys(rows[0]) : [];
          if (cols.length === 0) continue;
          colsByQuery[q.name] = cols;
          groups.push({
            group: 'doc',
            label: `Consulta: ${q.name}`,
            icon: 'ListOrdered',
            fields: cols.map(
              (c): FieldDef => ({
                path: `queries.${q.name}.0.${c}`,
                type: 'string',
                description: `Columna "${c}" de la consulta ${q.name}`,
              }),
            ),
          });
        } catch {
          /* silencio: el catálogo sigue funcionando sin esta consulta */
        }
      }
      if (!cancelled) {
        setQueryGroups(groups);
        setQueryColumns(colsByQuery);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sig]);

  const paramKeys = Object.keys(testParams ?? {});
  const paramsGroup: FieldGroup | null =
    enabled && paramKeys.length > 0
      ? {
          group: 'doc',
          label: 'Parámetros',
          icon: 'FileText',
          fields: paramKeys.map(
            (k): FieldDef => ({
              path: `params.${k}`,
              type: 'string',
              description: `Parámetro ${k}`,
            }),
          ),
        }
      : null;

  return {
    fieldGroups: paramsGroup ? [...queryGroups, paramsGroup] : queryGroups,
    queryColumns,
  };
}
