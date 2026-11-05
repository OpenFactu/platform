import { useEffect, useMemo, useState } from 'react';
import { warehousesApi, zonesApi } from '@/modules/inventory/api';
import { deliveryReturnApi } from '../api';
import {
  initialReturnForm,
  noteReturnBody,
  noteReturnStatus,
  returningLines,
  withEverything,
  withNothing,
  type NoteReturnForm,
  type NoteReturnPreparation,
} from '../domain/deliveryReturn';

interface Option {
  id: string;
  name: string;
  warehouseId?: string | null;
}

/** Devolver mercancía de un albarán: carga lo que puede volver y lo envía. */
export function useDeliveryReturn(noteId: string, enforceZones = false) {
  const [data, setData] = useState<NoteReturnPreparation | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warehouses, setWarehouses] = useState<Option[]>([]);
  const [zones, setZones] = useState<Option[]>([]);
  const [form, setForm] = useState<NoteReturnForm>({
    reason: '',
    warehouseId: '',
    zoneId: '',
    quantities: {},
  });

  useEffect(() => {
    let alive = true;
    deliveryReturnApi
      .prepare(noteId)
      .then((prepared) => {
        if (!alive) return;
        setData(prepared);
        setForm(initialReturnForm(prepared));
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [noteId]);

  useEffect(() => {
    let alive = true;
    Promise.all([warehousesApi.list(), zonesApi.list()])
      .then(([warehouseRows, zoneRows]) => {
        if (!alive) return;
        setWarehouses(warehouseRows as unknown as Option[]);
        setZones(zoneRows as unknown as Option[]);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const lines = useMemo(() => data?.lines ?? [], [data]);
  const zonesOf = (warehouseId: string) => zones.filter((zone) => zone.warehouseId === warehouseId);

  const status = useMemo(
    () =>
      data
        ? noteReturnStatus(
            data,
            form,
            (warehouseId) => enforceZones && zones.some((zone) => zone.warehouseId === warehouseId),
          )
        : null,
    [data, form, zones, enforceZones],
  );

  const set = (patch: Partial<NoteReturnForm>) => setForm((current) => ({ ...current, ...patch }));
  const setQuantity = (key: string, quantity: number | null) =>
    setForm((current) => ({
      ...current,
      quantities: { ...current.quantities, [key]: quantity },
    }));

  const submit = async () => {
    setSaving(true);
    try {
      return await deliveryReturnApi.create(noteId, noteReturnBody(lines, form));
    } finally {
      setSaving(false);
    }
  };

  return {
    data,
    failed,
    saving,
    form,
    lines,
    status,
    warehouses,
    zonesOf,
    picked: returningLines(lines, form).length,
    set,
    setQuantity,
    selectAll: () => setForm((current) => withEverything(current, lines)),
    selectNone: () => setForm(withNothing),
    submit,
  };
}
