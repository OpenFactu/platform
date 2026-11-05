import React from 'react';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  NumberInput,
  PageHeader,
  SearchableSelect,
  Table,
} from '@openfactu/ui';
import type { TableColumn } from '@openfactu/ui';
import { PackagePlus, ShoppingCart } from 'lucide-react';
import { ResponsiveActions } from '@/components/common/ResponsiveActions';
import { useAuth } from '@/context/AuthContext';
import { useTabs } from '@/context/TabsContext';
import { useTheme } from '@/context/ThemeContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import { useI18n } from '@/i18n/I18nContext';
import type { ReplenishmentRow } from '../domain/replenishment';
import { useReplenishment } from '../hooks/useReplenishment';

const canCreateOrders = (user?: {
  role?: string;
  permissions?: Record<string, { write?: boolean } | undefined>;
}) =>
  user?.role === 'SUPERUSER' ||
  user?.role === 'ADMIN' ||
  !!user?.permissions?.['/purchase-orders']?.write;

/** Lo que queda por debajo del mínimo y los pedidos de compra que lo cubren. */
export const Replenishment: React.FC = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const { flags, format } = useTheme();
  const { openTab } = useTabs();
  const { canWrite } = usePagePermissions();
  const state = useReplenishment();
  const canOrder = canWrite && canCreateOrders(user ?? undefined) && flags.purchasesEnabled;

  const number = (value: number) => <span className="tabular-nums">{value}</span>;
  const columns: TableColumn<ReplenishmentRow>[] = [
    {
      header: t('inventory.replenishment.item'),
      card: 'title',
      cell: (row) => (
        <span className="block min-w-0">
          <span className="block truncate font-semibold text-fg-default">{row.itemName}</span>
          <span className="block font-mono text-xs text-fg-muted">{row.itemCode}</span>
        </span>
      ),
    },
    {
      header: t('inventory.replenishment.stock'),
      align: 'right',
      cell: (row) => number(row.stock),
    },
    {
      header: t('inventory.replenishment.committed'),
      align: 'right',
      cell: (row) => number(row.committed),
    },
    {
      header: t('inventory.replenishment.ordered'),
      align: 'right',
      cell: (row) => number(row.ordered),
    },
    {
      header: t('inventory.replenishment.projected'),
      align: 'right',
      cell: (row) => <span className="tabular-nums font-semibold">{row.projected}</span>,
    },
    {
      header: t('inventory.replenishment.minimum'),
      align: 'right',
      cell: (row) => number(row.minStock),
    },
    {
      header: t('inventory.replenishment.inDraft'),
      align: 'right',
      cell: (row) => (row.inDraft > 0 ? number(row.inDraft) : '—'),
    },
    {
      header: t('inventory.replenishment.supplier'),
      cell: (row) => (
        <div className="w-full md:min-w-[11rem]" onClick={(event) => event.stopPropagation()}>
          <SearchableSelect
            aria-label={t('inventory.replenishment.supplier')}
            value={state.drafts[row.itemId]?.supplierId ?? ''}
            onChange={(value) => state.setDraft(row.itemId, { supplierId: value || null })}
            placeholder={t('inventory.replenishment.chooseSupplier')}
            options={state.suppliers.map((supplier) => ({
              value: supplier.id,
              label: supplier.name,
            }))}
            disabled={!canOrder}
          />
        </div>
      ),
    },
    {
      header: t('inventory.replenishment.toOrder'),
      align: 'right',
      cell: (row) => (
        <div className="w-24" onClick={(event) => event.stopPropagation()}>
          <NumberInput
            aria-label={t('inventory.replenishment.toOrder')}
            value={state.drafts[row.itemId]?.quantity ?? null}
            onChange={(value) => state.setDraft(row.itemId, { quantity: value })}
            min={0}
            precision={format.quantityPrecision}
            thousandSeparator={false}
            inputMode="decimal"
            align="right"
            disabled={!canOrder}
          />
        </div>
      ),
    },
  ];

  const create = () => void state.createOrders();
  const createLabel = t('inventory.replenishment.createOrders', { count: state.ordersToCreate });

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title={t('inventory.replenishment.title')}
        subtitle={t('inventory.replenishment.subtitle')}
        icon={<PackagePlus size={18} />}
        actions={
          canOrder ? (
            <ResponsiveActions
              source="primary:create"
              actions={
                state.lines.length > 0
                  ? [
                      {
                        id: 'create',
                        label: createLabel,
                        icon: <ShoppingCart size={19} />,
                        onClick: create,
                      },
                    ]
                  : []
              }
            >
              <Button
                className="gap-2"
                onClick={create}
                disabled={state.lines.length === 0}
                isLoading={state.saving}
              >
                <ShoppingCart size={16} /> {createLabel}
              </Button>
            </ResponsiveActions>
          ) : undefined
        }
      />

      {!flags.purchasesEnabled && (
        <Alert tone="info">{t('inventory.replenishment.purchasesOff')}</Alert>
      )}

      {state.created.length > 0 && (
        <Alert tone="success" title={t('inventory.replenishment.createdTitle')}>
          <p className="mb-2 text-sm">{t('inventory.replenishment.createdHint')}</p>
          <div className="flex flex-wrap gap-2">
            {state.created.map((order) => (
              <Button
                key={order.id}
                size="sm"
                variant="secondary"
                onClick={() => openTab(`/purchase-orders/${order.id}`)}
              >
                {t('inventory.replenishment.openOrder', { num: order.docNum })}
              </Button>
            ))}
          </div>
        </Alert>
      )}

      <Card noPadding>
        {!state.loading && state.rows.length === 0 ? (
          <EmptyState
            icon={<PackagePlus size={24} />}
            title={t('inventory.replenishment.emptyTitle')}
            hint={t('inventory.replenishment.emptyHint')}
          />
        ) : (
          <Table
            className="max-md:p-3"
            columns={columns}
            data={state.rows}
            isLoading={state.loading}
            rowKey={(row) => row.itemId}
            selectable={canOrder}
            selectedKeys={state.selected}
            onSelectionChange={state.setSelected}
          />
        )}
      </Card>
    </div>
  );
};

export default Replenishment;
