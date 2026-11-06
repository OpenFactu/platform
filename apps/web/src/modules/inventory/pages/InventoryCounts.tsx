import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Progress,
  Table,
  useToast,
} from '@openfactu/ui';
import type { TableColumn } from '@openfactu/ui';
import { ClipboardList, Plus } from 'lucide-react';
import { ResponsiveActions } from '@/components/common/ResponsiveActions';
import { useFormat } from '@/hooks/useFormat';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import { useI18n } from '@/i18n/I18nContext';
import { inventoryCountsApi } from '../api/inventoryCountsApi';
import { InventoryCountCreateModal } from '../components/InventoryCountCreateModal';
import { COUNT_STATUS_VARIANT, countPercentOf, type CountRow } from '../domain/inventoryCount';

/** Los recuentos de inventario, los abiertos y los que ya se cerraron. */
export const InventoryCounts: React.FC = () => {
  const { t } = useI18n();
  const fmt = useFormat();
  const toast = useToast();
  const navigate = useNavigate();
  const { canWrite } = usePagePermissions();
  const [rows, setRows] = useState<CountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    inventoryCountsApi
      .list()
      .then(setRows)
      .catch(() => toast.error(t('inventory.counts.loadError')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: TableColumn<CountRow>[] = [
    {
      header: t('inventory.counts.code'),
      card: 'title',
      cell: (row) => <span className="font-mono font-semibold">{row.code}</span>,
    },
    {
      header: t('inventory.counts.scope'),
      card: 'subtitle',
      cell: (row) =>
        [row.warehouseName, row.zoneName, row.categoryName].filter(Boolean).join(' · '),
    },
    {
      header: t('inventory.counts.date'),
      card: 'meta',
      cell: (row) => <span className="tabular-nums">{fmt.date(row.createdAt)}</span>,
    },
    {
      header: t('inventory.counts.counted'),
      card: 'meta',
      cell: (row) => (
        <div className="flex min-w-[8rem] items-center gap-2">
          <Progress value={countPercentOf(row)} size="sm" className="flex-1" />
          <span className="text-xs tabular-nums text-fg-muted">
            {row.countedLines}/{row.totalLines}
          </span>
        </div>
      ),
    },
    {
      header: t('inventory.counts.statusLabel'),
      card: 'status',
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-1">
          <Badge variant={COUNT_STATUS_VARIANT[row.status]}>
            {t(`inventory.counts.status.${row.status}`)}
          </Badge>
          {row.blind && <Badge variant="neutral">{t('inventory.counts.blindBadge')}</Badge>}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title={t('inventory.counts.title')}
        subtitle={t('inventory.counts.subtitle')}
        icon={<ClipboardList size={18} />}
        actions={
          canWrite ? (
            <ResponsiveActions
              source="primary:create"
              actions={[
                {
                  id: 'create',
                  label: t('inventory.counts.new'),
                  icon: <Plus size={19} />,
                  onClick: () => setCreating(true),
                },
              ]}
            >
              <Button className="gap-2" onClick={() => setCreating(true)}>
                <Plus size={16} /> {t('inventory.counts.new')}
              </Button>
            </ResponsiveActions>
          ) : undefined
        }
      />
      <Card noPadding>
        {!loading && rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={24} />}
            title={t('inventory.counts.listEmptyTitle')}
            hint={t('inventory.counts.listEmptyHint')}
          />
        ) : (
          <Table
            className="max-md:p-3"
            columns={columns}
            data={rows}
            isLoading={loading}
            rowKey={(row) => row.id}
            onRowClick={(row) => navigate(`/inventory/counts/${row.id}`)}
          />
        )}
      </Card>
      <InventoryCountCreateModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          navigate(`/inventory/counts/${id}`);
        }}
      />
    </div>
  );
};

export default InventoryCounts;
