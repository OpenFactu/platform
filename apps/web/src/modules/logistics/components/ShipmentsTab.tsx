import React, { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FilterBar,
  Table,
  usePopup,
  useToast,
} from '@openfactu/ui';
import type { RowAction, TableColumn } from '@openfactu/ui';
import { Mail, MapPin, Plus, RotateCcw, Trash2, Truck } from 'lucide-react';
import { useTabs } from '@/context/TabsContext';
import { useFormat } from '@/hooks/useFormat';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import { routesApi, shipmentsApi } from '../api';
import type { Route } from '../domain/route';
import type { Shipment } from '../domain/shipment';
import {
  SHIPMENT_FILTER_STATES,
  shipmentCode,
  stateLabelKey,
  stateOfShipment,
  stateTone,
} from '../domain/shipmentStatus';
import { SHIPMENTS_PAGE_SIZE, useShipmentsList } from '../hooks/useShipmentsList';
import { ShipmentCreateModal } from './ShipmentCreateModal';

const LIVE_WINDOW_MS = 5 * 60 * 1000;

const isLive = (iso?: string | null) =>
  !!iso && Date.now() - new Date(iso).getTime() < LIVE_WINDOW_MS;

export const ShipmentsTab: React.FC = () => {
  const { openTab } = useTabs();
  const fmt = useFormat();
  const toast = useToast();
  const popup = usePopup();
  const { t } = useI18n();
  const list = useShipmentsList();
  const [creating, setCreating] = useState(false);
  const [routes, setRoutes] = useState<Route[]>([]);

  useEffect(() => {
    routesApi
      .list()
      .then((d) => setRoutes(Array.isArray(d) ? d : []))
      .catch(() => setRoutes([]));
  }, []);

  const failed = (err: unknown) => {
    const message = err instanceof ApiError ? (err.body as any)?.error : undefined;
    toast.error(message || t('logistics.common.error'));
  };

  const remove = async (id: string) => {
    const ok = await popup.confirm({
      title: t('logistics.shipments.deleteTitle'),
      message: t('logistics.shipments.deleteMessage'),
      tone: 'danger',
      confirmLabel: t('logistics.common.delete'),
    });
    if (!ok) return;
    try {
      const { archived } = await shipmentsApi.remove(id);
      if (archived) toast.success(t('logistics.shipments.archived'));
      list.load();
    } catch (err) {
      failed(err);
    }
  };

  const restore = async (id: string) => {
    try {
      await shipmentsApi.restore(id);
      list.load();
    } catch (err) {
      failed(err);
    }
  };

  const resend = async (shipment: Shipment) => {
    try {
      await shipmentsApi.notify(shipment.id, { stage: stateOfShipment(shipment) });
      toast.success(t('logistics.shipments.emailQueued'));
    } catch (err) {
      failed(err);
    }
  };

  const filterConfig = useMemo(
    () => [
      {
        key: 'status',
        label: t('logistics.shipments.columns.status'),
        type: 'select' as const,
        options: SHIPMENT_FILTER_STATES.map((state) => ({
          value: state,
          label: t(stateLabelKey(state)),
        })),
      },
      {
        key: 'direction',
        label: t('logistics.shipments.columns.direction'),
        type: 'select' as const,
        options: ['out', 'in', 'pickup'].map((value) => ({
          value,
          label: t(`logistics.shipments.direction.${value}`),
        })),
      },
      {
        key: 'routeId',
        label: t('logistics.shipments.columns.route'),
        type: 'search-select' as const,
        options: routes.map((r) => ({ value: r.id, label: r.code, secondaryLabel: r.name })),
      },
      { key: 'fromDate', label: t('logistics.shipments.from'), type: 'date' as const },
      { key: 'toDate', label: t('logistics.shipments.to'), type: 'date' as const },
      {
        key: 'archived',
        label: t('logistics.shipments.archivedFilter'),
        type: 'select' as const,
        options: [{ value: 'yes', label: t('logistics.shipments.includeArchived') }],
      },
    ],
    [routes, t],
  );

  const columns: TableColumn<Shipment>[] = [
    {
      header: t('logistics.shipments.columns.number'),
      cell: (s) => <span className="font-mono text-xs text-fg-default">{shipmentCode(s)}</span>,
    },
    {
      header: t('logistics.shipments.columns.status'),
      cell: (s) => {
        const state = stateOfShipment(s);
        return (
          <div className="flex items-center gap-1.5">
            <Badge variant={stateTone(state)}>
              {t(stateLabelKey(state, s.direction === 'pickup'))}
            </Badge>
            {isLive(s.lastLocationAt) && (
              <span
                className="inline-block w-2 h-2 rounded-full bg-success animate-pulse"
                title={t('logistics.shipments.liveHint')}
              />
            )}
          </div>
        );
      },
    },
    {
      header: t('logistics.shipments.columns.direction'),
      cell: (s) => t(`logistics.shipments.direction.${(s.direction as string) || 'out'}`),
      className: 'text-xs text-fg-muted',
    },
    {
      header: t('logistics.shipments.columns.counterparty'),
      cell: (s) => (
        <div className="min-w-0">
          <div className="truncate text-fg-default">{(s.counterparty as string) || '—'}</div>
          <div className="truncate text-xs text-fg-muted max-w-[280px]">
            {s.destinationAddress || ''}
          </div>
        </div>
      ),
    },
    {
      header: t('logistics.shipments.columns.document'),
      cell: (s) => <span className="font-mono text-xs">{(s.documentNumber as string) || '—'}</span>,
    },
    {
      header: t('logistics.shipments.columns.route'),
      cell: (s) =>
        s.routeCode ? (
          <div>
            <div className="font-mono text-xs">{s.routeCode as string}</div>
            <div className="text-xs text-fg-muted">
              {[s.routeDriver, s.routeVehicle].filter(Boolean).join(' · ')}
            </div>
          </div>
        ) : s.carrier && s.carrier !== 'propio' ? (
          <span className="text-xs">{s.carrier}</span>
        ) : (
          '—'
        ),
    },
    {
      header: t('logistics.shipments.columns.estimated'),
      cell: (s) => (s.estimatedDelivery ? fmt.date(s.estimatedDelivery) : '—'),
      className: 'text-xs text-fg-muted',
    },
  ];

  const rowActions = (s: Shipment): RowAction[] => [
    {
      label: t('logistics.shipments.actions.view'),
      icon: <MapPin size={14} />,
      onClick: () => openTab(`/logistics/shipments/${s.id}`),
    },
    {
      label: t('logistics.shipments.actions.resend'),
      icon: <Mail size={14} />,
      onClick: () => resend(s),
    },
    s.archivedAt
      ? {
          label: t('logistics.shipmentDetail.restore'),
          icon: <RotateCcw size={14} />,
          onClick: () => restore(s.id),
        }
      : {
          label: t('logistics.shipments.deleteTitle'),
          icon: <Trash2 size={14} />,
          destructive: true,
          onClick: () => remove(s.id),
        },
  ];

  return (
    <div className="space-y-3">
      <FilterBar
        searchTerm={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder={t('logistics.shipments.searchPlaceholder')}
        activeFilters={list.filters}
        onFilterChange={(key, value) => list.setFilter(key as any, value)}
        onClear={list.clear}
        config={filterConfig}
        shortcut={false}
        resultCount={list.total}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={14} /> {t('logistics.shipments.new')}
          </Button>
        }
      />

      {!list.loading && list.rows.length === 0 ? (
        <Card bodyClassName="py-10">
          <EmptyState
            icon={<Truck size={28} />}
            title={
              list.hasFilters
                ? t('logistics.shipments.emptyFiltered')
                : t('logistics.shipments.empty')
            }
            hint={
              list.hasFilters
                ? t('logistics.shipments.emptyFilteredHint')
                : t('logistics.shipments.emptyHint')
            }
            action={
              list.hasFilters ? (
                <Button variant="secondary" size="sm" onClick={list.clear}>
                  {t('logistics.shipments.clearFilters')}
                </Button>
              ) : (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus size={14} /> {t('logistics.shipments.new')}
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden" noPadding>
          <Table
            className="max-md:p-3"
            columns={columns}
            data={list.rows}
            isLoading={list.loading}
            rowActions={rowActions}
            onRowClick={(s) => openTab(`/logistics/shipments/${s.id}`)}
            skeletonRowHeight={24}
            pagination={{
              page: list.page,
              pageSize: SHIPMENTS_PAGE_SIZE,
              total: list.total,
              onPageChange: list.setPage,
              pageSizeOptions: [],
            }}
          />
        </Card>
      )}

      <ShipmentCreateModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={list.load}
      />
    </div>
  );
};
