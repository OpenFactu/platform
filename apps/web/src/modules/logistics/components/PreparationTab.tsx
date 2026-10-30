/**
 * Preparación — gestor de shipments en estados `picking|packed|ready|receiving|received`.
 * Permite abrir el panel de tareas, empaquetar, marcar listo y asignar a una ruta.
 */
import { routesApi, shipmentsApi, stagingAreasApi } from '../api';
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Badge, Loader, Modal, SearchableSelect, useToast } from '@openfactu/ui';
import type { BadgeProps } from '@openfactu/ui';
import {
  Box,
  Package as PackageIcon,
  Send,
  CheckCircle2,
  ChevronRight,
  Warehouse,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { PickingTasksPanel } from './PickingTasksPanel';
import { RoutePicker } from './RoutePicker';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import type { Route } from '../domain/route';
import type { Shipment } from '../domain/shipment';
import type { StagingArea } from '../domain/stagingArea';

const PREP_BADGE: Record<string, BadgeProps['variant']> = {
  draft: 'neutral',
  picking: 'info',
  packed: 'info',
  ready: 'success',
  dispatched: 'success',
  in_transit: 'info',
  delivered: 'success',
  receiving: 'info',
  received: 'success',
  cancelled: 'error',
  exception: 'error',
};

const PREP_LABEL: Record<string, string> = {
  draft: 'logistics.status.prep.draft',
  picking: 'logistics.status.prep.picking',
  packed: 'logistics.status.prep.packed',
  ready: 'logistics.status.prep.ready',
  dispatched: 'logistics.status.prep.dispatched',
  in_transit: 'logistics.status.prep.in_transit',
  delivered: 'logistics.status.prep.delivered',
  receiving: 'logistics.status.prep.receiving',
  received: 'logistics.status.prep.received',
  cancelled: 'logistics.status.prep.cancelled',
  exception: 'logistics.status.prep.exception',
};

export const PreparationTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const { t } = useI18n();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stagingAreas, setStagingAreas] = useState<{ id: string; code: string; name: string }[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Shipment | null>(null);
  const [showDispatch, setShowDispatch] = useState<Shipment | null>(null);
  const [dispatchRouteId, setDispatchRouteId] = useState('');
  const [showStaging, setShowStaging] = useState<Shipment | null>(null);
  const [stagingAreaId, setStagingAreaId] = useState('');

  const load = async () => {
    setLoading(true);
    const [sh, rt, st] = await Promise.all([
      shipmentsApi.list().catch(() => []),
      routesApi.list().catch(() => []),
      stagingAreasApi.list().catch(() => []),
    ]);
    setShipments(Array.isArray(sh) ? sh : []);
    setRoutes(Array.isArray(rt) ? rt : []);
    setStagingAreas(Array.isArray(st) ? st : []);
    setLoading(false);
  };
  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const activeShipments = useMemo(
    () =>
      shipments.filter((s) =>
        ['picking', 'packed', 'ready', 'receiving'].includes(s.preparationStatus || ''),
      ),
    [shipments],
  );

  const markReady = async (sh: Shipment) => {
    try {
      await shipmentsApi.ready(sh.id);
      toast.success(t('logistics.preparation.markedReady'));
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('logistics.common.error'));
    }
  };

  const receive = async (sh: Shipment) => {
    try {
      await shipmentsApi.receive(sh.id);
      toast.success(t('logistics.preparation.received'));
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('logistics.common.error'));
    }
  };

  const dispatch = async () => {
    if (!showDispatch) return;
    try {
      await shipmentsApi.dispatch(showDispatch.id, { routeId: dispatchRouteId || null });
      toast.success(t('logistics.preparation.dispatched'));
      setShowDispatch(null);
      setDispatchRouteId('');
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('logistics.common.error'));
    }
  };

  const sendToStaging = async () => {
    if (!showStaging || !stagingAreaId) return;
    try {
      const d = await shipmentsApi.toStaging(showStaging.id, { stagingAreaId });
      const area = stagingAreas.find((a) => a.id === stagingAreaId);
      toast.success(
        t('logistics.preparation.movedTo', {
          name: area?.name || t('logistics.preparation.areaFallback'),
          detail:
            d.packagesCreated > 0
              ? t('logistics.preparation.packageCreated')
              : t('logistics.preparation.packagesAffected', { count: d.packagesAffected }),
        }),
      );
      setShowStaging(null);
      setStagingAreaId('');
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('logistics.common.error'));
    }
  };

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader />
        </div>
      ) : activeShipments.length === 0 ? (
        <Card bodyClassName="py-10 text-center text-sm text-slate-500">
          {t('logistics.preparation.emptyBefore')} <b>{t('logistics.preparation.emptyAction')}</b>{' '}
          {t('logistics.preparation.emptyAfter')}
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {activeShipments.map((sh) => (
              <li
                key={sh.id}
                className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 px-4 py-2.5 border-b border-border-subtle last:border-0"
              >
                <div className="flex items-start gap-2 md:flex-1 md:min-w-0">
                  <Badge variant={PREP_BADGE[sh.preparationStatus] || 'neutral'}>
                    {PREP_LABEL[sh.preparationStatus]
                      ? t(PREP_LABEL[sh.preparationStatus])
                      : sh.preparationStatus}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-fg-default">
                        {sh.sourceDocType === 'SDN'
                          ? t('logistics.preparation.sale')
                          : sh.sourceDocType === 'PDN'
                            ? t('logistics.preparation.purchase')
                            : t('logistics.preparation.shipment')}
                      </span>
                      <code className="px-1.5 py-0.5 bg-bg-muted text-[11px] font-mono rounded">
                        {sh.id.slice(0, 8)}
                      </code>
                      {sh.destinationAddress && (
                        <span className="text-[11px] text-slate-500 truncate max-w-[60vw] md:max-w-sm">
                          → {sh.destinationAddress}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 md:gap-2 md:flex-nowrap md:shrink-0">
                  <Button
                    variant="secondary"
                    onClick={() => setSelected(sh)}
                    className="!px-2 !py-1 flex items-center gap-1"
                  >
                    <Box size={13} /> {t('logistics.preparation.tasks')}
                    <ChevronRight size={13} />
                  </Button>

                  {(sh.preparationStatus === 'packed' || sh.preparationStatus === 'ready') && (
                    <Button
                      variant="secondary"
                      onClick={() => setShowStaging(sh)}
                      className="!px-2 !py-1 flex items-center gap-1"
                      title={t('logistics.preparation.moveToArea')}
                    >
                      <Warehouse size={13} /> {t('logistics.preparation.toArea')}
                    </Button>
                  )}
                  {sh.preparationStatus === 'packed' && (
                    <Button
                      onClick={() => markReady(sh)}
                      className="!px-2 !py-1 flex items-center gap-1"
                    >
                      <PackageIcon size={13} /> {t('logistics.preparation.ready')}
                    </Button>
                  )}
                  {sh.preparationStatus === 'ready' && (
                    <Button
                      onClick={() => setShowDispatch(sh)}
                      className="!px-2 !py-1 flex items-center gap-1"
                    >
                      <Send size={13} /> {t('logistics.preparation.dispatch')}
                    </Button>
                  )}
                  {sh.preparationStatus === 'receiving' && (
                    <Button
                      onClick={() => receive(sh)}
                      className="!px-2 !py-1 flex items-center gap-1"
                    >
                      <CheckCircle2 size={13} /> {t('logistics.preparation.receive')}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        isOpen={!!selected}
        onClose={() => {
          setSelected(null);
          load();
        }}
        title={t('logistics.preparation.tasksTitle')}
        subtitle={
          selected
            ? `${selected.sourceDocType || t('logistics.preparation.shipment')} · ${selected.preparationStatus}`
            : undefined
        }
        maxWidth="lg"
      >
        {selected && (
          <div className="pt-4">
            <PickingTasksPanel
              shipmentId={selected.id}
              onAllDone={() => {
                toast.success(t('logistics.preparation.allTasksDone'));
                load();
              }}
            />
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!showStaging}
        onClose={() => setShowStaging(null)}
        title={t('logistics.preparation.stagingTitle')}
        subtitle={t('logistics.preparation.stagingSubtitle')}
        maxWidth="md"
      >
        <div className="space-y-3 pt-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              {t('logistics.preparation.targetArea')}
            </label>
            {/* Acopios vienen del servidor → SearchableSelect (no tiene prop
                `label`, se conserva el <label> suelto). */}
            <SearchableSelect
              options={stagingAreas.map((a) => ({
                value: a.id,
                label: a.name,
                secondaryLabel: a.code,
              }))}
              value={stagingAreaId}
              onChange={setStagingAreaId}
              placeholder={t('logistics.common.selectPlaceholder')}
              clearable
            />
            {stagingAreas.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1">
                {t('logistics.preparation.noAreas')}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
            <Button variant="secondary" onClick={() => setShowStaging(null)}>
              {t('logistics.common.cancel')}
            </Button>
            <Button onClick={sendToStaging} disabled={!stagingAreaId}>
              {t('logistics.preparation.moveToAreaButton')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!showDispatch}
        onClose={() => setShowDispatch(null)}
        title={t('logistics.preparation.dispatchTitle')}
        subtitle={t('logistics.preparation.dispatchSubtitle')}
        maxWidth="md"
      >
        <div className="space-y-3 pt-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              {t('logistics.preparation.route')}
            </label>
            <RoutePicker
              value={dispatchRouteId}
              onChange={setDispatchRouteId}
              routes={routes}
              filterStatuses={['planned', 'active']}
              allowEmpty
              placeholder={t('logistics.preparation.unassignedRoute')}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
            <Button variant="secondary" onClick={() => setShowDispatch(null)}>
              {t('logistics.common.cancel')}
            </Button>
            <Button onClick={dispatch}>{t('logistics.preparation.dispatch')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
