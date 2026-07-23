import { coreApi } from '@/shared/api';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { FieldSurface, PluginFieldDef } from './types';

// Caché compartida por tableName para que varios consumidores no dupliquen fetches.
const cache: Record<string, PluginFieldDef[]> = {};
const inflight: Set<string> = new Set();
const listeners: Set<() => void> = new Set();

function notify() {
  for (const l of listeners) l();
}

/** Invalida la caché de una tabla. Usar tras crear/borrar un campo. */
export function invalidatePluginFields(tableName?: string) {
  if (tableName) delete cache[tableName];
  else for (const k of Object.keys(cache)) delete cache[k];
  notify();
}

interface Options {
  /** Filtra por `visibleIn`. Si no se pasa, devuelve todos. */
  surface?: FieldSurface;
  /** Filtra por `readRoles` del usuario. Si no se pasa, devuelve todos. */
  role?: string;
  /** Si true, solo los marcados `showInList`. Combinable con surface. */
  onlyInList?: boolean;
}

/**
 * Hook único para cargar los campos de plugin/usuario registrados para
 * una tabla. Cachea por `tableName` y aplica ordenación y filtros.
 *
 *   const fields = usePluginFields('Item', { surface: 'form' });
 */
export function usePluginFields(
  tableName: string | undefined,
  opts: Options = {},
): PluginFieldDef[] {
  const { token, user } = useAuth();
  const [, bump] = useState(0);

  useEffect(() => {
    const l = () => bump((v) => v + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    if (!tableName || !token || !user?.tenantId) return;
    if (cache[tableName]) return;
    if (inflight.has(tableName)) return;
    inflight.add(tableName);
    coreApi.get(`/api/plugins/fields/${tableName}`)
      .then((data) => {
        cache[tableName] = Array.isArray(data) ? data : [];
        notify();
      })
      .catch(() => {
        cache[tableName] = [];
        notify();
      })
      .finally(() => inflight.delete(tableName));
  }, [tableName, token, user?.tenantId]);

  if (!tableName) return [];
  const raw = cache[tableName] ?? [];

  let out = raw;
  if (opts.surface) {
    out = out.filter((f) => {
      if (!f.visibleIn || f.visibleIn.length === 0) return true;
      return f.visibleIn.includes(opts.surface!);
    });
  }
  if (opts.role) {
    out = out.filter((f) => {
      const rr = f.readRoles;
      return !rr || rr.length === 0 || rr.includes(opts.role!);
    });
  }
  if (opts.onlyInList) {
    out = out.filter((f) => !!f.showInList);
  }
  return [...out].sort(
    (a, b) => (a.displayOrder || 0) - (b.displayOrder || 0) || a.label.localeCompare(b.label),
  );
}
