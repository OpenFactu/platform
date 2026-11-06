import React, { useMemo } from 'react';
import { Alert, Badge, List, Modal } from '@openfactu/ui';
import { BarcodeCameraModal } from '@/components/scanner/BarcodeCameraModal';
import { useI18n } from '@/i18n/I18nContext';
import { useToast } from '@openfactu/ui';
import { driverApi } from '../../api';
import type { Route } from '../../domain/route';
import { packageTone } from '../../domain/packageStatus';

export interface PackageScan {
  code: string;
  status: string;
  weightKg: number | null;
  shipmentCode: string | null;
  trackingNumber: string | null;
  destinationAddress: string | null;
}

export interface AreaScan {
  ownership: 'mine' | 'other' | 'unassigned';
  stagingName: string;
  stagingCode: string;
  myRoutes?: { id: string; code: string; name: string }[];
  otherDriver?: string;
  otherRouteCode?: string;
  packagesCount: number;
}

interface Props {
  scanning: boolean;
  onCloseScanner: () => void;
  tenantId?: string | null;
  routes: Route[];
  packageScan: PackageScan | null;
  areaScan: AreaScan | null;
  onPackageScan: (scan: PackageScan | null) => void;
  onAreaScan: (scan: AreaScan | null) => void;
  onOpenRoute: (routeId: string) => void;
}

/**
 * Leer un QR: el de un bulto dice adónde va, y el de un acopio si la carga es tuya.
 * El aviso de que es de otro conductor es lo importante: evita cargar lo que no toca.
 */
export const DriverScanModals: React.FC<Props> = ({
  scanning,
  onCloseScanner,
  tenantId,
  routes,
  packageScan,
  areaScan,
  onPackageScan,
  onAreaScan,
  onOpenRoute,
}) => {
  const { t } = useI18n();
  const toast = useToast();
  const myRouteIds = useMemo(() => new Set(routes.map((r) => r.id)), [routes]);

  const handleScan = async (raw: string) => {
    onCloseScanner();
    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      toast.error(t('logistics.driver.qrUnrecognized'));
      return;
    }

    if (parsed?.v === 1 && parsed.type === 'package' && parsed.id) {
      try {
        onPackageScan(await driverApi.package(parsed.id));
        navigator.vibrate?.([60, 30, 60]);
      } catch {
        toast.error(t('logistics.driver.packageReadError'));
      }
      return;
    }

    if (!parsed || parsed.v !== 1 || !parsed.s) {
      toast.error(t('logistics.driver.qrInvalidArea'));
      return;
    }
    if (parsed.t && tenantId && parsed.t !== tenantId) {
      toast.error(t('logistics.driver.areaOtherCompany'));
      return;
    }
    try {
      const payload = await driverApi.stagingArea(parsed.s);
      const base = {
        stagingName: payload.staging?.name || '',
        stagingCode: payload.staging?.code || '',
        packagesCount: payload.packages?.length || 0,
      };
      const onArea = payload.routes || [];
      const mine = onArea.filter((r: any) => myRouteIds.has(r.id));
      if (mine.length > 0) {
        onAreaScan({
          ...base,
          ownership: 'mine',
          myRoutes: mine.map((r: any) => ({ id: r.id, code: r.code, name: r.name })),
        });
      } else if (onArea.length > 0) {
        onAreaScan({
          ...base,
          ownership: 'other',
          otherDriver: onArea[0].driverName || '—',
          otherRouteCode: onArea[0].code,
        });
      } else {
        onAreaScan({ ...base, ownership: 'unassigned' });
      }
      navigator.vibrate?.(mine.length > 0 ? [80, 40, 80] : 200);
    } catch {
      toast.error(t('logistics.driver.areaLoadError'));
    }
  };

  return (
    <>
      <BarcodeCameraModal
        open={scanning}
        onClose={onCloseScanner}
        onScan={handleScan}
      />

      <Modal
        isOpen={!!packageScan}
        onClose={() => onPackageScan(null)}
        title={t('logistics.driver.scan.packageTitle')}
        maxWidth="sm"
      >
        {packageScan && (
          <div className="pt-2 space-y-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-fg-default">{packageScan.code}</span>
              <Badge variant={packageTone(packageScan.status)}>
                {t(`logistics.packages.status.${packageScan.status}`)}
              </Badge>
              {packageScan.weightKg != null && (
                <span className="text-xs text-fg-muted">{packageScan.weightKg} kg</span>
              )}
            </div>
            <Alert tone="warning" title={t('logistics.driver.deliverTo')}>
              <span className="text-base font-bold">
                {packageScan.destinationAddress || t('logistics.driver.scan.noAddress')}
              </span>
            </Alert>
            {(packageScan.shipmentCode || packageScan.trackingNumber) && (
              <div className="text-xs text-fg-muted">
                {t('logistics.driver.scan.shipment')}{' '}
                <span className="font-mono">
                  {packageScan.shipmentCode || packageScan.trackingNumber}
                </span>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!areaScan}
        onClose={() => onAreaScan(null)}
        title={t('logistics.driver.scan.areaTitle')}
        maxWidth="sm"
      >
        {areaScan?.ownership === 'mine' && (
          <div className="pt-2 space-y-3">
            <Alert tone="success" title={t('logistics.driver.scan.mine')}>
              {t('logistics.driver.scan.area')} <b>{areaScan.stagingName}</b> ({areaScan.stagingCode}) —{' '}
              {t('logistics.driver.scan.packages', { count: areaScan.packagesCount })}
            </Alert>
            <List
              variant="bordered"
              items={(areaScan.myRoutes || []).map((route) => ({
                id: route.id,
                title: route.name || route.code,
                subtitle: route.code,
                meta: t('logistics.driver.scan.open'),
                onClick: () => {
                  onOpenRoute(route.id);
                  onAreaScan(null);
                },
              }))}
            />
          </div>
        )}
        {areaScan?.ownership === 'other' && (
          <Alert tone="danger" className="mt-2" title={t('logistics.driver.scan.notMine')}>
            {t('logistics.driver.scan.assignedTo')} <b>{areaScan.otherDriver}</b>
            {areaScan.otherRouteCode && ` (${t('logistics.driver.scan.route')} ${areaScan.otherRouteCode})`}
            . {t('logistics.driver.scan.dontLoad')}
          </Alert>
        )}
        {areaScan?.ownership === 'unassigned' && (
          <Alert tone="warning" className="mt-2" title={t('logistics.driver.scan.unassigned')}>
            {t('logistics.driver.scan.unassignedBefore')} <b>{areaScan.stagingName}</b>{' '}
            {t('logistics.driver.scan.unassignedAfter')}
          </Alert>
        )}
      </Modal>
    </>
  );
};
