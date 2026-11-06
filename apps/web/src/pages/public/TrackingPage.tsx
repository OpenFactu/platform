import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Loader,
  Marker,
  Stepper,
  Timeline,
  type TimelineEvent,
} from '@openfactu/ui';
import { AlertTriangle, CheckCircle2, Clock, MapPin, RefreshCw, Share2 } from 'lucide-react';
import { LogisticsMap } from '@/modules/logistics/components/maps/LogisticsMap';
import { TruckPin } from '@/modules/logistics/components/maps/MapPins';
import { useI18n } from '@/i18n/I18nContext';
import { formatDateTime } from '@/i18n/format';
import { TrackingChatWidget } from './TrackingChatWidget';
import {
  DELIVERY_STEPS,
  OFF_PATH,
  PICKUP_STEPS,
  copyFor,
  stepIndexOf,
  type TrackingTone,
} from './trackingCopy';
import { useTracking } from './useTracking';

const ALERT_TONE: Record<TrackingTone, React.ComponentProps<typeof Alert>['tone']> = {
  neutral: 'neutral',
  info: 'info',
  warning: 'warning',
  success: 'success',
  danger: 'danger',
};

export const TrackingPage: React.FC = () => {
  const { token } = useParams();
  const { t } = useI18n();
  const { data, loading, refreshing, failed, reload } = useTracking(token);

  const status = data?.status || 'pending';
  const isPickup = data?.kind === 'pickup_return';
  const copy = copyFor(status, isPickup);
  const steps = isPickup ? PICKUP_STEPS : DELIVERY_STEPS;

  const events = useMemo<TimelineEvent[]>(
    () =>
      (data?.events || []).map((event, index) => {
        const eventCopy = copyFor(event.status || '', isPickup);
        return {
          id: String(index),
          title: event.status ? t(eventCopy.label) : event.kind,
          description: event.description || undefined,
          date: event.createdAt,
          tone: index === 0 ? 'accent' : 'default',
        };
      }),
    [data?.events, isPickup, t],
  );

  const share = async () => {
    const url = window.location.href;
    try {
      await navigator.share?.({ title: t('app.tracking.shareTitle'), url });
    } catch {
      await navigator.clipboard?.writeText(url).catch(() => {});
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-app flex items-center justify-center p-4">
        <Loader />
      </div>
    );
  }

  if (failed || !data) {
    return (
      <div className="min-h-screen bg-bg-app flex items-center justify-center p-6">
        <EmptyState
          icon={<AlertTriangle size={28} />}
          title={t('app.tracking.notFound')}
          hint={t('app.tracking.notFoundBody')}
        />
      </div>
    );
  }

  const position = data.lastPosition;

  return (
    <div className="min-h-screen bg-bg-app text-fg-body">
      <header className="sticky top-0 z-20 bg-bg-card border-b border-border-default">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {data.branding?.logoUrl && (
              <img src={data.branding.logoUrl} alt="" className="h-8 w-auto object-contain" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-bold text-fg-default truncate">
                {data.branding?.appName || t('app.tracking.tracking')}
              </div>
              <div className="text-xs text-fg-muted truncate">
                {data.code || t('app.tracking.tracking')}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={reload}
              disabled={refreshing}
              aria-label={t('app.common.refresh')}
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </Button>
            <Button variant="ghost" size="sm" onClick={share} aria-label={t('app.tracking.share')}>
              <Share2 size={16} />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4 pb-16">
        <Alert
          tone={ALERT_TONE[copy.tone]}
          icon={<copy.Icon size={18} />}
          title={<span className="text-lg font-bold">{t(copy.hero)}</span>}
        >
          {copy.sub && <p>{t(copy.sub)}</p>}
          {/* Una fecha que ya ha pasado no le dice nada al cliente. */}
          {data.estimatedDelivery &&
            status !== 'delivered' &&
            new Date(data.estimatedDelivery).getTime() > Date.now() && (
              <p className="mt-2 flex items-center gap-1.5">
                <Clock size={14} />
                {t('app.tracking.eta')} <b>{formatDateTime(data.estimatedDelivery)}</b>
              </p>
            )}
          {/* Lo manda el estado: un envío antiguo puede tener fecha de entrega y seguir en camino. */}
          {status === 'delivered' && data.deliveredAt && (
            <p className="mt-2 flex items-center gap-1.5">
              <CheckCircle2 size={14} />
              {t(isPickup ? 'app.tracking.pickedUpOn' : 'app.tracking.deliveredOn', {
                date: formatDateTime(data.deliveredAt),
              })}
            </p>
          )}
        </Alert>

        {!OFF_PATH.includes(status) && (
          <Card bodyClassName="p-4">
            <Stepper
              size="sm"
              current={status === 'delivered' ? steps.length : stepIndexOf(steps, status)}
              steps={steps.map((step, index) => ({ id: String(index), label: t(step.label) }))}
            />
          </Card>
        )}

        {data.destination.address && (
          <Card bodyClassName="p-4 flex gap-3">
            <MapPin size={18} className="shrink-0 mt-0.5 text-fg-muted" />
            <div className="min-w-0">
              <div className="text-xs text-fg-muted">
                {isPickup ? t('app.tracking.pickupAt') : t('app.tracking.deliverTo')}
              </div>
              <div className="text-sm font-semibold text-fg-default break-words">
                {data.destination.address}
              </div>
            </div>
          </Card>
        )}

        {position && (
          <Card noPadding className="overflow-hidden">
            <LogisticsMap
              className="h-64 sm:h-80"
              view={{ lat: position.lat, lng: position.lng, zoom: 14 }}
              settings={data.map}
              interactive={false}
              controls={false}
            >
              <Marker lat={position.lat} lng={position.lng}>
                <TruckPin />
              </Marker>
            </LogisticsMap>
            <div className="px-4 py-2 text-xs text-fg-muted">
              {t('app.tracking.updated', { ago: formatDateTime(position.reportedAt) })}
            </div>
          </Card>
        )}

        <Card bodyClassName="p-5">
          <h2 className="text-sm font-bold text-fg-default mb-3">{t('app.tracking.history')}</h2>
          <Timeline events={events} variant="compacto" emptyMessage={t('app.tracking.noEvents')} />
        </Card>

        <footer className="text-center text-xs text-fg-subtle pt-3">
          {t('app.tracking.footer')}
        </footer>
      </main>

      {data.chatEnabled && token && <TrackingChatWidget token={token} />}
    </div>
  );
};

export default TrackingPage;
