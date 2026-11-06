import React, { useState } from 'react';
import { Alert, Button, ConfirmDialog, EmptyState, Spinner } from '@openfactu/ui';
import { CheckCircle2, Play, QrCode, Square } from 'lucide-react';
import { BarcodeCameraModal } from '@/components/scanner/BarcodeCameraModal';
import { useAuth } from '@/context/AuthContext';
import { useTabs } from '@/context/TabsContext';
import { useI18n } from '@/i18n/I18nContext';
import { AppReportModal } from '../components/driver/AppReportModal';
import { DriverNextStop } from '../components/driver/DriverNextStop';
import { DriverRouteHeader, type DriverView } from '../components/driver/DriverRouteHeader';
import { DriverRouteList } from '../components/driver/DriverRouteList';
import { DriverRouteSetup } from '../components/driver/DriverRouteSetup';
import {
  DriverScanModals,
  type AreaScan,
  type PackageScan,
} from '../components/driver/DriverScanModals';
import { DriverScreen } from '../components/driver/DriverScreen';
import { DriverSettingsModal } from '../components/driver/DriverSettingsModal';
import { DriverStopActions } from '../components/driver/DriverStopActions';
import { DriverStopList } from '../components/driver/DriverStopList';
import { DriverStopsMap } from '../components/driver/DriverStopsMap';
import { StagingDropModal } from '../components/driver/StagingDropModal';
import { StopProblemModal } from '../components/driver/StopProblemModal';
import { DeliveryWizard } from '../components/driver/wizard/DeliveryWizard';
import { fullRouteUrl, leftoverStops, nextOpenStop, stopAddress } from '../domain/driverRoute';
import { MISSING_PACKAGE } from '../domain/stopProblems';
import { useDriverApp } from '../hooks/useDriverApp';
import { usePackageScanner } from '../hooks/usePackageScanner';

/**
 * App del conductor: a toda la pantalla, sin el menú del ERP. Lo normal es no salir de
 * la vista "Ahora": la parada que toca arriba y, abajo, el botón de entregar. Lo que se
 * le pide en cada paso lo decide su empresa (`DeliveryFlow`).
 */
export const DriverApp: React.FC = () => {
  const { user } = useAuth();
  const { openTab } = useTabs();
  const { t } = useI18n();
  const app = useDriverApp(user?.tenantId);
  const [view, setView] = useState<DriverView>('now');
  const [scanning, setScanning] = useState(false);
  const [packageScan, setPackageScan] = useState<PackageScan | null>(null);
  const [areaScan, setAreaScan] = useState<AreaScan | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ stopId: string; preset: string | null } | null>(null);
  const [drop, setDrop] = useState<{ finishing: boolean } | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmArriveAll, setConfirmArriveAll] = useState(false);

  const { flow } = app;
  const packages = (app.detail?.packages ?? []).filter((pkg) => pkg.status !== 'delivered');
  const loadScanner = usePackageScanner(
    packages,
    (pkg) => !!pkg.loadedAt,
    (pkg) => app.setPackageLoaded(pkg.id, true),
  );

  const openRoute = (routeId: string | null) => {
    setView('now');
    app.setSelectedId(routeId);
  };
  const exit = user?.role === 'DRIVER' ? undefined : () => openTab('/');
  const active = app.detail?.route.status === 'active';

  const shared = (
    <>
      <DriverScanModals
        scanning={scanning}
        onCloseScanner={() => setScanning(false)}
        tenantId={user?.tenantId}
        routes={app.routes}
        packageScan={packageScan}
        areaScan={areaScan}
        onPackageScan={setPackageScan}
        onAreaScan={setAreaScan}
        onOpenRoute={openRoute}
      />
      <DriverSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        gps={
          active
            ? {
                tracking: app.tracking,
                onToggle: () => (app.tracking ? app.stopGps() : app.startGps()),
              }
            : undefined
        }
        onReport={() => {
          setSettingsOpen(false);
          setReportOpen(true);
        }}
        onExit={exit}
      />
      {reportOpen && (
        <AppReportModal routeId={app.selectedId} onClose={() => setReportOpen(false)} />
      )}
    </>
  );

  if (!app.selectedId) {
    return (
      <>
        <DriverRouteList
          userName={user?.username ?? ''}
          loading={app.loading}
          hasRoutes={app.routes.length > 0}
          routes={app.visibleRoutes}
          dateFilter={app.dateFilter}
          onDateFilter={app.setDateFilter}
          onOpen={openRoute}
          onScan={() => setScanning(true)}
          onSettings={() => setSettingsOpen(true)}
          onExit={exit}
        />
        {shared}
      </>
    );
  }

  const { detail, currentStop } = app;
  if (!detail) {
    return (
      <DriverScreen>
        <div className="flex justify-center py-32">
          <Spinner size="lg" />
        </div>
      </DriverScreen>
    );
  }

  const shipmentOf = (stop: { shipmentId?: string | null } | null) =>
    stop?.shipmentId ? app.shipmentsById.get(stop.shipmentId) : undefined;
  const planned = detail.route.status === 'planned';
  const openStops = detail.stops.filter((s) =>
    ['pending', 'en_route', 'arrived'].includes(s.status),
  );
  const notArrived = detail.stops.filter((s) => ['pending', 'en_route'].includes(s.status));
  const currentShipment = shipmentOf(currentStop);
  const delivering = detail.stops.find((s) => s.id === deliveringId) ?? null;
  const upcoming = nextOpenStop(detail.stops.filter((s) => s.id !== deliveringId));
  const problemStop = detail.stops.find((s) => s.id === problem?.stopId) ?? null;
  const leftover = leftoverStops(detail.stops, detail.packages ?? []);
  const canDrop = flow.stagingDrop && !planned && leftover.length > 0;
  const loading = flow.loadOut !== 'off' && packages.length > 0;
  const toLoad = loading ? packages.filter((pkg) => !pkg.loadedAt).length : 0;
  const blocked = flow.loadOutRequired && toLoad > 0;

  const pickStop = (stopId: string) => {
    app.focusStop(stopId);
    setView('now');
  };
  // Antes de cerrar, lo que queda en la furgoneta tiene que quedarse en algún sitio.
  const finish = () => (canDrop ? setDrop({ finishing: true }) : setConfirmFinish(true));

  const footer =
    view !== 'now' ? undefined : planned ? (
      <>
        {loading && (
          <Button size="lg" variant="secondary" className="w-full" onClick={loadScanner.start}>
            <QrCode size={18} /> {t('logistics.driver.loadOut.scan')}
          </Button>
        )}
        <Button
          size="lg"
          className="h-14 w-full text-base"
          disabled={app.busy || blocked}
          onClick={app.startRoute}
        >
          <Play size={20} />
          {blocked
            ? t('logistics.driver.loadOut.missing', { count: toLoad })
            : t('logistics.driver.startRoute')}
        </Button>
      </>
    ) : active && currentStop ? (
      <DriverStopActions
        status={currentStop.status}
        isPickup={currentShipment?.kind === 'pickup_return'}
        canArrive={flow.arrive}
        onDeliver={() => setDeliveringId(currentStop.id)}
        onArrive={() => app.arrive(currentStop.id)}
        onProblem={() => setProblem({ stopId: currentStop.id, preset: null })}
      />
    ) : active ? (
      <Button size="lg" className="h-14 w-full text-base" disabled={app.busy} onClick={finish}>
        <Square size={20} /> {t('logistics.driver.finishRoute')}
      </Button>
    ) : undefined;

  return (
    <>
      <DriverScreen
        scroll={view !== 'map'}
        header={
          <DriverRouteHeader
            detail={detail}
            view={view}
            onView={setView}
            tracking={app.tracking}
            mapsUrl={fullRouteUrl(detail.stops, app.shipmentsById, flow.map.navigationApp)}
            notArrived={notArrived.length}
            onBack={() => openRoute(null)}
            onScan={() => setScanning(true)}
            onArriveAll={() => setConfirmArriveAll(true)}
            onDrop={canDrop ? () => setDrop({ finishing: false }) : undefined}
            onFinish={finish}
            onSettings={() => setSettingsOpen(true)}
          />
        }
        footer={footer}
      >
        {app.pending > 0 && view !== 'map' && (
          <div className="px-3 pt-3">
            <Alert tone="warning">
              {t('logistics.driver.outbox.pending', { count: app.pending })}
            </Alert>
          </div>
        )}
        {view === 'now' &&
          (planned ? (
            <DriverRouteSetup
              detail={detail}
              flow={flow}
              packages={packages}
              onTogglePackage={app.setPackageLoaded}
            />
          ) : currentStop ? (
            <DriverNextStop
              stop={currentStop}
              total={detail.stops.length}
              shipment={currentShipment}
              packages={app.packagesOf(currentStop.shipmentId)}
              navigationApp={flow.map.navigationApp}
            />
          ) : (
            <div className="py-20">
              <EmptyState
                icon={<CheckCircle2 size={32} />}
                title={
                  active
                    ? t('logistics.driver.allDoneTitle')
                    : t('logistics.driver.routeClosedTitle')
                }
                hint={active ? t('logistics.driver.allDoneHint') : undefined}
              />
            </div>
          ))}
        {view === 'list' && (
          <DriverStopList
            stops={detail.stops}
            shipments={app.shipmentsById}
            currentId={currentStop?.id ?? null}
            onPick={pickStop}
          />
        )}
        {view === 'map' && (
          <DriverStopsMap
            points={app.mapPoints}
            shipments={app.shipmentsById}
            lastFix={app.lastFix}
            currentId={currentStop?.id ?? null}
            navigationApp={flow.map.navigationApp}
            onPick={pickStop}
          />
        )}
      </DriverScreen>

      {shared}

      <BarcodeCameraModal
        open={loadScanner.open}
        onClose={loadScanner.stop}
        onScan={loadScanner.handle}
        continuous
      />

      {delivering && (
        <DeliveryWizard
          key={delivering.id}
          flow={flow}
          stop={delivering}
          shipment={shipmentOf(delivering)}
          packages={app.packagesOf(delivering.shipmentId)}
          upcoming={upcoming}
          upcomingShipment={shipmentOf(upcoming)}
          onClose={() => setDeliveringId(null)}
          onSubmit={(proof) => app.deliver(delivering.id, proof)}
          onMissingPackage={() => {
            setProblem({ stopId: delivering.id, preset: MISSING_PACKAGE });
            setDeliveringId(null);
          }}
          onFinishRoute={() => {
            setDeliveringId(null);
            finish();
          }}
        />
      )}

      {problem && (
        <StopProblemModal
          key={problem.stopId}
          reasons={flow.reasons}
          subtitle={problemStop ? stopAddress(problemStop, shipmentOf(problemStop)) : undefined}
          preset={problem.preset}
          onClose={() => setProblem(null)}
          onConfirm={(kind, reason) =>
            kind === 'postpone'
              ? app.postpone(problem.stopId, reason)
              : app.reportIncident(problem.stopId, reason)
          }
        />
      )}

      {drop && (
        <StagingDropModal
          stops={leftover}
          shipments={app.shipmentsById}
          packageCount={(shipmentId) => app.packagesOf(shipmentId).length}
          finishing={drop.finishing}
          onClose={() => setDrop(null)}
          onSkip={() => {
            setDrop(null);
            setConfirmFinish(true);
          }}
          onConfirm={async (areaId, shipmentIds) => {
            const ok = await app.dropAtStaging(areaId, shipmentIds);
            if (ok) {
              const thenFinish = drop.finishing;
              setDrop(null);
              if (thenFinish) setConfirmFinish(true);
            }
            return ok;
          }}
        />
      )}

      <ConfirmDialog
        open={confirmFinish}
        onCancel={() => setConfirmFinish(false)}
        onConfirm={async () => {
          await app.finishRoute();
          setConfirmFinish(false);
        }}
        title={t('logistics.driver.finishRoute')}
        message={
          openStops.length > 0
            ? t('logistics.driver.finishOpenStops', { count: openStops.length })
            : t('logistics.driver.finishAllClosed')
        }
        confirmLabel={t('logistics.driver.finishRoute')}
        tone="danger"
      />

      <ConfirmDialog
        open={confirmArriveAll}
        onCancel={() => setConfirmArriveAll(false)}
        onConfirm={async () => {
          setConfirmArriveAll(false);
          await app.arriveAll(notArrived);
        }}
        title={t('logistics.driver.bulk.title')}
        message={t('logistics.driver.bulk.message', { count: notArrived.length })}
        confirmLabel={t('logistics.driver.bulk.confirm')}
      />
    </>
  );
};

export default DriverApp;
