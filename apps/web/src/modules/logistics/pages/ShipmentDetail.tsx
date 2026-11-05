import { PageBack } from '@/components/common/PageBack';
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  DropdownMenu,
  EmptyState,
  Loader,
  PageHeader,
  Stepper,
} from '@openfactu/ui';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Mail,
  MoreVertical,
  PackageCheck,
  PackagePlus,
  RefreshCw,
  Route as RouteIcon,
  RotateCcw,
  Send,
  Tag,
  Truck,
  Undo2,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTabs } from '@/context/TabsContext';
import { openPdf } from '@/utils/downloadPdf';
import { useI18n } from '@/i18n/I18nContext';
import { shipmentsApi } from '../api';
import type { ShipmentReturnResult } from '../api/shipmentsApi';
import {
  ShipmentActionModals,
  type ModalSubmit,
  type ShipmentModal,
} from '../components/shipmentDetail/ShipmentActionModals';
import { ShipmentFacts } from '../components/shipmentDetail/ShipmentFacts';
import { ShipmentHistory } from '../components/shipmentDetail/ShipmentHistory';
import { ShipmentMapCard } from '../components/shipmentDetail/ShipmentMapCard';
import { ShipmentPackages } from '../components/shipmentDetail/ShipmentPackages';
import { ShipmentStops } from '../components/shipmentDetail/ShipmentStops';
import { ShipmentTechnicalCard } from '../components/shipmentDetail/ShipmentTechnicalCard';
import {
  progressOf,
  shipmentCode,
  stateLabelKey,
  stateTone,
  type ShipmentAction,
} from '../domain/shipmentStatus';
import { useReturnFollowUp } from '../hooks/useReturnFollowUp';
import { useRouteWarnings } from '../hooks/useRouteWarnings';
import { useShipmentDetail } from '../hooks/useShipmentDetail';

const ACTION_ICON: Record<ShipmentAction, React.ReactNode> = {
  dispatch: <RouteIcon size={14} />,
  ready: <PackageCheck size={14} />,
  deliver: <CheckCircle2 size={14} />,
  postpone: <Clock size={14} />,
  incident: <AlertTriangle size={14} />,
  resolve: <RotateCcw size={14} />,
  return: <Undo2 size={14} />,
  pickup: <PackagePlus size={14} />,
  cancel: <X size={14} />,
  receive: <PackageCheck size={14} />,
};

export const ShipmentDetail: React.FC = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { openTab } = useTabs();
  const { t } = useI18n();
  const { detail, shipment, state, direction, actions, track, loading, load, run } =
    useShipmentDetail(id);
  const [modal, setModal] = useState<ShipmentModal | null>(null);
  const showWarnings = useRouteWarnings();
  const offerCreditNote = useReturnFollowUp();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERUSER';

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <Loader />
      </div>
    );
  }

  if (!shipment || !detail || !id) {
    return (
      <div className="p-4">
        <EmptyState title={t('logistics.shipmentDetail.notFound')} />
      </div>
    );
  }

  const isPickup = direction === 'pickup';
  const isInbound = direction === 'in';
  const progress = progressOf(state, direction);

  const direct: Partial<Record<ShipmentAction, () => void>> = {
    ready: () => run(() => shipmentsApi.ready(id), t('logistics.shipmentDetail.done.ready')),
    deliver: () => run(() => shipmentsApi.deliver(id), t('logistics.shipmentDetail.done.deliver')),
    resolve: () =>
      run(() => shipmentsApi.resolveIncident(id), t('logistics.shipmentDetail.done.resolve')),
    receive: () => run(() => shipmentsApi.receive(id), t('logistics.shipmentDetail.done.receive')),
  };
  const asModal: Partial<Record<ShipmentAction, ShipmentModal>> = {
    dispatch: 'dispatch',
    postpone: 'postpone',
    incident: 'incident',
    return: 'return',
    pickup: 'pickup',
    cancel: 'cancel',
  };

  const submitModal = async (which: ShipmentModal, values: ModalSubmit) => {
    const done = t(`logistics.shipmentDetail.done.${which}`);
    let returned: ShipmentReturnResult | null = null;
    const works: Record<ShipmentModal, () => Promise<unknown>> = {
      dispatch: async () =>
        showWarnings((await shipmentsApi.dispatch(id, { routeId: values.routeId })).warnings),
      carrier: () =>
        shipmentsApi.carrierDispatch(id, {
          carrierAccountId: values.carrierAccountId as string,
          trackingNumber: values.trackingNumber,
        }),
      postpone: () => shipmentsApi.postpone(id, values.reason),
      incident: () => shipmentsApi.reportIncident(id, values.reason || ''),
      return: async () => {
        returned = await shipmentsApi.return(id, {
          reason: values.reason,
          cancelDeliveryNote: values.cancelDeliveryNote,
        });
      },
      pickup: () =>
        shipmentsApi.schedulePickup(id, { reason: values.reason, warehouseId: values.warehouseId }),
      cancel: () =>
        shipmentsApi.cancel(id, {
          reason: values.reason,
          cancelDeliveryNote: values.cancelDeliveryNote,
        }),
    };
    if (await run(works[which], done)) {
      setModal(null);
      if (returned) await offerCreditNote(returned);
    }
  };

  const runAction = (action: ShipmentAction) => {
    const target = asModal[action];
    if (target) setModal(target);
    else direct[action]?.();
  };

  const resend = () =>
    run(() => shipmentsApi.notify(id, { stage: state }), t('logistics.shipments.emailQueued'));

  const saveDestination = (lat: number, lng: number) =>
    run(
      () => shipmentsApi.update(id, { destinationLat: lat, destinationLng: lng }),
      t('logistics.shipmentDetail.destinationUpdated'),
    );

  const [primary, ...rest] = actions;
  const withCarrier = !!shipment.carrierAccountId;
  const menuItems = [
    ...(actions.includes('dispatch')
      ? [
          {
            label: t('logistics.shipmentDetail.actions.carrier'),
            icon: <Send size={14} />,
            onClick: () => setModal('carrier' as const),
          },
        ]
      : []),
    ...rest.map((action) => ({
      label: t(`logistics.shipmentDetail.actions.${action}`),
      icon: ACTION_ICON[action],
      destructive: action === 'cancel',
      onClick: () => runAction(action),
    })),
    ...(withCarrier
      ? [
          {
            label: t('logistics.shipmentDetail.carrierLabel'),
            icon: <Tag size={14} />,
            onClick: () => openPdf(`/api/logistics/shipments/${id}/carrier-label.pdf`),
          },
          {
            label: t('logistics.shipmentDetail.carrierRefresh'),
            icon: <RefreshCw size={14} />,
            onClick: () =>
              run(
                () => shipmentsApi.carrierRefresh(id),
                t('logistics.shipmentDetail.done.carrierRefresh'),
              ),
          },
        ]
      : []),
    ...(!isInbound
      ? [
          {
            label: t('logistics.shipmentDetail.sendNotification'),
            icon: <Mail size={14} />,
            onClick: resend,
          },
        ]
      : []),
    {
      label: t('logistics.shipmentDetail.refresh'),
      icon: <RefreshCw size={14} />,
      onClick: load,
    },
  ];

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <PageHeader
        size="sm"
        divider
        icon={isInbound ? <PackageCheck size={22} /> : <Truck size={22} />}
        title={
          <>
            {shipmentCode(shipment)}{' '}
            <Badge variant={stateTone(state)}>{t(stateLabelKey(state, isPickup))}</Badge>
          </>
        }
        subtitle={[t(`logistics.shipments.direction.${direction}`), shipment.counterparty as string]
          .filter(Boolean)
          .join(' · ')}
        breadcrumbs={
          <div>
            <PageBack onBack={() => openTab('/logistics')}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openTab('/logistics')}
                title={t('logistics.shipmentDetail.backToHub')}
              >
                <ArrowLeft size={14} />
              </Button>
            </PageBack>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            {primary && (
              <Button onClick={() => runAction(primary)}>
                {ACTION_ICON[primary]} {t(`logistics.shipmentDetail.actions.${primary}`)}
              </Button>
            )}
            <DropdownMenu align="end" items={menuItems}>
              <Button
                type="button"
                variant="outline"
                aria-label={t('logistics.shipmentDetail.moreActions')}
              >
                <MoreVertical size={16} />
              </Button>
            </DropdownMenu>
          </div>
        }
      />

      {shipment.archivedAt && (
        <Alert
          tone="neutral"
          action={
            <Button size="sm" variant="outline" onClick={() => run(() => shipmentsApi.restore(id))}>
              {t('logistics.shipmentDetail.restore')}
            </Button>
          }
        >
          {t('logistics.shipmentDetail.archivedNotice')}
        </Alert>
      )}

      {progress.current !== null && (
        <Card bodyClassName="p-4">
          <Stepper
            size="sm"
            current={progress.current}
            steps={progress.steps.map((step) => ({
              id: step.id,
              label: t(
                `logistics.shipmentDetail.progress.${isPickup && step.id === 'delivered' ? 'pickedUp' : step.id}`,
              ),
            }))}
          />
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          <ShipmentFacts shipment={shipment} />
          {!isInbound && (
            <ShipmentMapCard
              shipment={shipment}
              track={track}
              onDestinationChange={saveDestination}
            />
          )}
          <ShipmentPackages shipmentId={id} packages={detail.packages} />
          <ShipmentStops stops={detail.stops} />
        </div>
        <div className="space-y-4">
          <ShipmentHistory events={detail.events} isPickup={isPickup} />
          {isAdmin && !isInbound && <ShipmentTechnicalCard shipment={shipment} />}
        </div>
      </div>

      <ShipmentActionModals
        modal={modal}
        shipment={shipment}
        onClose={() => setModal(null)}
        onSubmit={submitModal}
      />
    </div>
  );
};

export default ShipmentDetail;
