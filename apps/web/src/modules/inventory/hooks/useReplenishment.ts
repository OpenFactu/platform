import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { notifyDocChange } from '@/utils/dataRefresh';
import { DocType } from '@openfactu/common';
import { replenishmentApi } from '../api/inventoryCountsApi';
import {
  initialDrafts,
  linesToOrder,
  ordersCount,
  type CreatedOrder,
  type OrderDraft,
  type ReplenishmentRow,
  type SupplierOption,
} from '../domain/replenishment';

/** Lo que queda por debajo del mínimo, lo que se decide pedir y los pedidos que salen. */
export function useReplenishment() {
  const { t } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<ReplenishmentRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [drafts, setDrafts] = useState<Record<string, OrderDraft>>({});
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedOrder[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [list, options] = await Promise.all([
        replenishmentApi.list(),
        replenishmentApi.suppliers(),
      ]);
      setRows(list);
      setSuppliers(options);
      setDrafts(initialDrafts(list));
      // De entrada, lo que hace falta y se puede pedir.
      setSelected(
        new Set(list.filter((row) => row.suggested > 0 && row.supplierId).map((row) => row.itemId)),
      );
    } catch (error) {
      toast.error(
        (error instanceof Error ? error.message : undefined) ||
          t('inventory.replenishment.loadError'),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setDraft = (itemId: string, patch: Partial<OrderDraft>) =>
    setDrafts((current) => ({ ...current, [itemId]: { ...current[itemId], ...patch } }));

  const lines = useMemo(() => linesToOrder(selected as Set<string>, drafts), [selected, drafts]);

  const createOrders = async () => {
    if (lines.length === 0) return;
    setSaving(true);
    try {
      const { orders } = await replenishmentApi.createOrders(lines);
      setCreated(orders);
      notifyDocChange(DocType.PurchaseOrder);
      toast.success(t('inventory.replenishment.created', { count: orders.length }));
      await load();
    } catch (error) {
      toast.error(
        (error instanceof Error ? error.message : undefined) ||
          t('inventory.replenishment.createError'),
      );
    } finally {
      setSaving(false);
    }
  };

  return {
    rows,
    suppliers,
    drafts,
    setDraft,
    selected,
    setSelected,
    loading,
    saving,
    created,
    lines,
    ordersToCreate: ordersCount(lines),
    createOrders,
  };
}
