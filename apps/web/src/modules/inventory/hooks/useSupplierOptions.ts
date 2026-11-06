import { useEffect, useState } from 'react';
import { partnersApi } from '@/modules/partners/api';

/** A quién se le puede pedir, para elegir el proveedor habitual. Sin permiso, nadie: no estorba. */
export function useSupplierOptions() {
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    let alive = true;
    partnersApi
      .list()
      .then((rows) => {
        if (alive) setSuppliers(rows.map((row) => ({ id: row.id, name: row.name })));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return suppliers;
}
