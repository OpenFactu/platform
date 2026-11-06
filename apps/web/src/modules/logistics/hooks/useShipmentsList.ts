import { useCallback, useEffect, useState } from 'react';
import { useDebouncedValue } from '@openfactu/ui';
import { shipmentsApi } from '../api';
import type { Shipment } from '../domain/shipment';

export const SHIPMENTS_PAGE_SIZE = 25;

export interface ShipmentFilters {
  status?: string;
  direction?: string;
  routeId?: string;
  fromDate?: string;
  toDate?: string;
  archived?: string;
}

/** El listado de envíos: búsqueda, filtros y paginación en el servidor. */
export function useShipmentsList() {
  const [rows, setRows] = useState<Shipment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<ShipmentFilters>({});
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await shipmentsApi.list({
        q: debouncedSearch || undefined,
        status: filters.status || undefined,
        direction: filters.direction || undefined,
        routeId: filters.routeId || undefined,
        fromDate: filters.fromDate || undefined,
        toDate: filters.toDate || undefined,
        includeArchived: filters.archived === 'yes' ? 'true' : undefined,
        page,
        pageSize: SHIPMENTS_PAGE_SIZE,
      });
      if (Array.isArray(result)) {
        setRows(result);
        setTotal(result.length);
      } else {
        setRows(Array.isArray(result.rows) ? result.rows : []);
        setTotal(Number(result.total) || 0);
      }
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  const setSearch = (value: string) => {
    setPage(1);
    setSearchTerm(value);
  };
  const setFilter = (key: keyof ShipmentFilters, value: string | null | undefined) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value || undefined }));
  };
  const clear = () => {
    setPage(1);
    setSearchTerm('');
    setFilters({});
  };
  const hasFilters = !!search || Object.values(filters).some(Boolean);

  return { rows, total, loading, page, setPage, search, setSearch, filters, setFilter, clear, hasFilters, load };
}
