import { useEffect, useState } from 'react';
import { coreApi } from '@/shared/api';

/** Un objeto del sistema al que se puede enlazar un campo de usuario. */
export interface LinkableObject {
  id: string;
  label: string;
  group: 'record' | 'document' | 'table';
}

/** Lo que se sabe de un registro enlazado. Sin permiso o borrado, no hay nombre. */
export interface LinkedValue {
  id: string;
  label?: string;
  route?: string;
  hidden?: boolean;
  missing?: boolean;
}

const path = (objectId: string) => `/api/linked-objects/${encodeURIComponent(objectId)}`;

export const linkedObjectsApi = {
  list: () => coreApi.get<LinkableObject[]>('/api/linked-objects'),
  search: (objectId: string, q: string) =>
    coreApi.get<Array<{ id: string; label: string }>>(
      `${path(objectId)}/search?q=${encodeURIComponent(q)}`,
    ),
};

const cache = new Map<string, Promise<LinkedValue>>();
const waiting = new Map<string, Map<string, (value: LinkedValue) => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** Un listado pide muchos nombres a la vez: se juntan en una petición por objeto. */
function flush() {
  timer = null;
  const batches = [...waiting.entries()];
  waiting.clear();
  for (const [objectId, requests] of batches) {
    const ids = [...requests.keys()];
    coreApi
      .post<LinkedValue[]>(`${path(objectId)}/resolve`, { ids })
      .then((rows) => {
        for (const id of ids) {
          requests.get(id)?.(rows.find((row) => row.id === id) ?? { id, missing: true });
        }
      })
      .catch(() => {
        for (const id of ids) requests.get(id)?.({ id, hidden: true });
      });
  }
}

function resolveLinked(objectId: string, id: string): Promise<LinkedValue> {
  const key = `${objectId}|${id}`;
  const known = cache.get(key);
  if (known) return known;
  const promise = new Promise<LinkedValue>((resolve) => {
    if (!waiting.has(objectId)) waiting.set(objectId, new Map());
    waiting.get(objectId)!.set(id, resolve);
    timer ??= setTimeout(flush, 30);
  });
  cache.set(key, promise);
  return promise;
}

/** El registro al que apunta un campo enlazado; `null` mientras se pregunta. */
export function useLinkedValue(objectId: string | null | undefined, id: unknown) {
  const [value, setValue] = useState<LinkedValue | null>(null);
  const text = id === null || id === undefined || id === '' ? '' : String(id);

  useEffect(() => {
    setValue(null);
    if (!objectId || !text) return;
    let alive = true;
    resolveLinked(objectId, text).then((resolved) => {
      if (alive) setValue(resolved);
    });
    return () => {
      alive = false;
    };
  }, [objectId, text]);

  return value;
}
