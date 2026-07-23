/**
 * Registro runtime de tipos de documento — consume GET /api/documents/types
 * (proyección pública del DocumentRegistry del servidor).
 *
 * Los mapas estáticos de la web (docTypeConfig.ts, @openfactu/common) solo
 * conocen los 6 tipos core; los tipos nuevos (SQ, tipos de plugins) llegan
 * por aquí en runtime sin recompilar la web. Al cargar, siembra además el
 * meta-registro de @openfactu/common para que decomposeDocType /
 * getDocTypeLabel / isSaleDoc funcionen también con esos códigos.
 */
import { useEffect, useState } from 'react';
import { registerDocTypeMeta } from '@openfactu/common';
import { apiClient } from '@/shared/http';

export interface ServerDocType {
  docType: string;
  side: 'sales' | 'purchase';
  category: string;
  label: string;
  labelPlural: string;
  apiPath: string;
  uiRoute: string;
  initialStatus: string;
  statusLabels: Record<string, string>;
  statusOptions: { value: string; label: string }[];
  partnerLabel: string;
  partnerPlaceholder: string;
  hasFiscalFields: boolean;
  hasWarehouse: boolean;
  hasInternalOrder: boolean;
  hasSalesAgent: boolean;
  stockAction: 'IN' | 'OUT' | 'NONE';
  baseDocType: string | null;
  manualStatusTransitions: Record<string, string[]> | null;
}

let cache: ServerDocType[] | null = null;
let inflight: Promise<ServerDocType[]> | null = null;

function seedCommonMeta(types: ServerDocType[]): void {
  for (const t of types) {
    registerDocTypeMeta({
      docType: t.docType,
      kind:
        t.category === 'delivery_note'
          ? 'deliveryNote'
          : t.category === 'invoice'
            ? 'invoice'
            : 'order',
      side: t.side === 'sales' ? 'sale' : 'purchase',
      label: t.label,
      labelPlural: t.labelPlural,
      apiEndpoint: t.apiPath,
      route: t.uiRoute,
      stockAction: t.stockAction,
    });
  }
}

export async function fetchDocTypes(): Promise<ServerDocType[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = apiClient
      .get<ServerDocType[]>('/api/documents/types')
      .then((list) => {
        cache = Array.isArray(list) ? list : [];
        seedCommonMeta(cache);
        return cache;
      })
      .catch(() => {
        // Sin caché en error: el siguiente consumidor reintenta.
        inflight = null;
        return [] as ServerDocType[];
      });
  }
  return inflight;
}

/** Lectura síncrona de la caché (null si aún no se ha fetcheado). */
export function getCachedDocTypes(): ServerDocType[] | null {
  return cache;
}

export function getCachedDocType(docType: string): ServerDocType | undefined {
  return cache?.find((t) => t.docType === docType);
}

/** Hook: lista de tipos registrados en el servidor, con estado de carga. */
export function useDocTypes(): { types: ServerDocType[]; loading: boolean } {
  const [types, setTypes] = useState<ServerDocType[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);
  useEffect(() => {
    let alive = true;
    fetchDocTypes().then((t) => {
      if (!alive) return;
      setTypes(t);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { types, loading };
}
