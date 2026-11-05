import { useEffect, useMemo, useState } from 'react';
import { zonesApi } from '@/modules/inventory/api';
import { creditNoteApi } from '../api';
import {
  commonValue,
  creditNoteBody,
  creditNoteStatus,
  creditNoteTotals,
  initialDrafts,
  pickedCount,
  withAllQuantities,
  withAllReturned,
  withAllWarehouse,
  withAllZone,
  withNoQuantities,
  type CreditLineDraft,
  type CreditNoteForm,
  type CreditNotePreparation,
  type InvoiceSide,
} from '../domain/creditNote';

interface WarehouseZone {
  id: string;
  name: string;
  warehouseId: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);

/** El documento de un abono: carga lo que se puede abonar y lo envía. */
export function useCreditNote(
  side: InvoiceSide,
  invoiceId: string,
  enforceZones = false,
  /** Viene de una devolución de logística: con lo devuelto ya puesto y su motivo. */
  fromReturn?: { reason: string },
) {
  const [zones, setZones] = useState<WarehouseZone[]>([]);
  const [data, setData] = useState<CreditNotePreparation | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreditNoteForm>({
    drafts: [],
    reason: '',
    documentTypeId: '',
    date: today(),
    externalRef: '',
  });

  useEffect(() => {
    let alive = true;
    creditNoteApi
      .prepare(side, invoiceId)
      .then((prepared) => {
        if (!alive) return;
        setData(prepared);
        setForm({
          drafts: initialDrafts(prepared.lines, !!fromReturn),
          reason: fromReturn?.reason ?? '',
          documentTypeId: prepared.documentTypes[0]?.id ?? '',
          date: today(),
          externalRef: '',
        });
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, invoiceId]);

  useEffect(() => {
    let alive = true;
    zonesApi
      .list()
      .then((rows: unknown) => {
        if (alive) setZones(Array.isArray(rows) ? (rows as WarehouseZone[]) : []);
      })
      .catch(() => {
        if (alive) setZones([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const zonesOf = (warehouseId: string | null) =>
    zones.filter((zone) => zone.warehouseId === warehouseId);

  const setDraft = (lineId: string, patch: Partial<CreditLineDraft>) =>
    setForm((current) => ({
      ...current,
      drafts: current.drafts.map((draft) =>
        draft.lineId === lineId ? { ...draft, ...patch } : draft,
      ),
    }));

  const set = (patch: Partial<CreditNoteForm>) => setForm((current) => ({ ...current, ...patch }));

  const setDrafts = (change: (drafts: CreditLineDraft[]) => CreditLineDraft[]) =>
    setForm((current) => ({ ...current, drafts: change(current.drafts) }));

  const lines = useMemo(() => data?.lines ?? [], [data]);

  const status = useMemo(
    () =>
      creditNoteStatus(
        side,
        lines,
        form,
        (warehouseId) => enforceZones && zones.some((zone) => zone.warehouseId === warehouseId),
      ),
    [lines, form, side, zones, enforceZones],
  );

  const totals = useMemo(() => creditNoteTotals(lines, form.drafts), [lines, form.drafts]);

  const returned = form.drafts.filter((draft) => draft.returnStock);
  const bulk = {
    picked: pickedCount(form.drafts),
    allReturned: form.drafts.length > 0 && returned.length === form.drafts.length,
    anyReturned: returned.length > 0,
    warehouseId: commonValue(returned.map((draft) => draft.warehouseId)),
    zoneId: commonValue(returned.map((draft) => draft.zoneId)),
    selectAll: () => setDrafts((drafts) => withAllQuantities(drafts, lines)),
    selectNone: () => setDrafts(withNoQuantities),
    setAllReturned: (value: boolean) =>
      setDrafts((drafts) => withAllReturned(drafts, value, lines)),
    setAllWarehouse: (warehouseId: string) =>
      setDrafts((drafts) => withAllWarehouse(drafts, warehouseId)),
    setAllZone: (zoneId: string) => setDrafts((drafts) => withAllZone(drafts, zoneId)),
  };

  const submit = async () => {
    setSaving(true);
    try {
      return await creditNoteApi.create(side, invoiceId, creditNoteBody(side, form));
    } finally {
      setSaving(false);
    }
  };

  return {
    data,
    failed,
    saving,
    form,
    status,
    totals,
    bulk,
    set,
    setDraft,
    zonesOf,
    submit,
  };
}
