import React, { useMemo } from 'react';
import { Alert, KpiCard, Table, type TableColumn } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { useFormat } from '@/hooks/useFormat';
import { stockValue, type ItemCostMovement } from '../domain/itemCost';
import { useItemCostMovements } from '../hooks/useItemCostMovements';

interface Props {
  item: {
    id: string;
    stock?: unknown;
    averageCost?: unknown;
    lastPurchaseCost?: unknown;
  };
}

/** Coste de la ficha del artículo: solo lectura, lo mueven las entradas de stock. */
export const ItemCostPanel: React.FC<Props> = ({ item }) => {
  const { t } = useI18n();
  const fmt = useFormat();
  const movements = useItemCostMovements(item.id);
  const average = Number(item.averageCost || 0);

  const columns = useMemo<TableColumn<ItemCostMovement>[]>(
    () => [
      { header: t('inventory.itemCost.cols.date'), cell: (m) => fmt.date(m.createdAt) },
      {
        header: t('inventory.itemCost.cols.reason'),
        cell: (m) => t(`inventory.itemCost.kind.${m.kind}`),
      },
      {
        header: t('inventory.itemCost.cols.quantity'),
        align: 'right',
        cell: (m) => (Number(m.quantity) ? fmt.quantity(m.quantity) : '—'),
      },
      {
        header: t('inventory.itemCost.cols.unitCost'),
        align: 'right',
        cell: (m) => fmt.money(m.unitCost),
      },
      {
        header: t('inventory.itemCost.cols.after'),
        align: 'right',
        cell: (m) => <span className="font-semibold">{fmt.money(m.costAfter)}</span>,
      },
    ],
    [fmt, t],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard
          variant="soft"
          label={t('inventory.itemCost.average')}
          value={average > 0 ? fmt.money(average) : t('inventory.itemCost.noCost')}
        />
        <KpiCard
          variant="soft"
          label={t('inventory.itemCost.last')}
          value={item.lastPurchaseCost != null ? fmt.money(item.lastPurchaseCost as string) : '—'}
        />
        <KpiCard
          variant="soft"
          label={t('inventory.itemCost.stockValue')}
          value={fmt.money(stockValue(item.stock, average))}
        />
      </div>
      {average <= 0 && <Alert tone="warning">{t('inventory.itemCost.noCostNotice')}</Alert>}
      <Table columns={columns} data={movements} emptyMessage={t('inventory.itemCost.noHistory')} />
    </div>
  );
};
