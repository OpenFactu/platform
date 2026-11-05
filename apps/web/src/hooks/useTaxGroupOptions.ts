import { useEffect, useState } from 'react';
import { crudApi } from '@/shared/api';

interface TaxGroupRow {
  id: string;
  code: string;
  rate: string | number;
}

/**
 * Tipos de impuesto de la empresa, listos para un selector. Quien no tenga
 * permiso para leerlos ve la lista vacía, como en los demás catálogos de las fichas.
 */
export function useTaxGroupOptions(): Array<{ value: string; label: string }> {
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>([]);

  useEffect(() => {
    crudApi
      .list<TaxGroupRow>('/api/taxes')
      .then((rows) =>
        setOptions(
          (Array.isArray(rows) ? rows : []).map((r) => ({
            value: r.id,
            label: `${r.code} (${Number(r.rate)} %)`,
          })),
        ),
      )
      .catch(() => setOptions([]));
  }, []);

  return options;
}
