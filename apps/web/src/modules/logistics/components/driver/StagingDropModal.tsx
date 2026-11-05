import React, { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, SearchableSelect } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { driverApi } from '../../api';
import { stopAddress } from '../../domain/driverRoute';
import type { RouteStop } from '../../domain/route';
import type { Shipment } from '../../domain/shipment';
import { DriverModal } from './DriverModal';

interface Area {
  id: string;
  code: string;
  name: string;
  address: string | null;
}

interface Props {
  stops: RouteStop[];
  shipments: Map<string, Shipment>;
  packageCount: (shipmentId: string | null | undefined) => number;
  /** Al terminar la ruta: lo normal es dejarlo todo, y se puede seguir sin dejar nada. */
  finishing: boolean;
  onClose: () => void;
  onSkip: () => void;
  onConfirm: (stagingAreaId: string, shipmentIds: string[]) => Promise<boolean>;
}

/** Hacer un acopio: dejar en un sitio lo que no se ha podido entregar. */
export const StagingDropModal: React.FC<Props> = ({
  stops,
  shipments,
  packageCount,
  finishing,
  onClose,
  onSkip,
  onConfirm,
}) => {
  const { t } = useI18n();
  const [areas, setAreas] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState('');
  const [selected, setSelected] = useState<string[]>(() =>
    finishing ? stops.map((stop) => stop.shipmentId as string) : [],
  );
  const [sending, setSending] = useState(false);

  useEffect(() => {
    driverApi
      .stagingAreas()
      .then((rows) => setAreas(Array.isArray(rows) ? rows : []))
      .catch(() => setAreas([]));
  }, []);

  const toggle = (id: string, on: boolean) =>
    setSelected((current) => (on ? [...current, id] : current.filter((other) => other !== id)));

  const confirm = async () => {
    setSending(true);
    try {
      await onConfirm(areaId, selected);
    } finally {
      setSending(false);
    }
  };

  return (
    <DriverModal
      isOpen
      onClose={onClose}
      title={t(finishing ? 'logistics.driver.drop.titleFinishing' : 'logistics.driver.drop.title')}
      subtitle={t('logistics.driver.drop.hint')}
      footer={
        <div className="w-full space-y-2">
          <Button
            size="lg"
            className="h-14 w-full text-base"
            disabled={!areaId || selected.length === 0 || sending}
            onClick={confirm}
          >
            {t('logistics.driver.drop.confirm', { count: selected.length })}
          </Button>
          <Button size="lg" variant="secondary" className="w-full" onClick={finishing ? onSkip : onClose}>
            {finishing ? t('logistics.driver.drop.skip') : t('logistics.common.cancel')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        {areas.length === 0 && <Alert tone="warning">{t('logistics.driver.drop.noAreas')}</Alert>}
        <SearchableSelect
          label={t('logistics.driver.drop.area')}
          required
          options={areas.map((area) => ({ value: area.id, label: `${area.code} · ${area.name}` }))}
          value={areaId}
          onChange={setAreaId}
          placeholder={t('logistics.common.selectPlaceholder')}
        />
        <div className="space-y-2">
          {stops.map((stop) => {
            const shipment = stop.shipmentId ? shipments.get(stop.shipmentId) : undefined;
            const id = stop.shipmentId as string;
            return (
              <div key={stop.id} className="rounded-lg border border-border-default bg-bg-card p-3">
                <Checkbox
                  checked={selected.includes(id)}
                  onChange={(on) => toggle(id, on)}
                  label={
                    <span className="text-base font-semibold">
                      {shipment?.recipientName || stopAddress(stop, shipment) || '—'}
                    </span>
                  }
                  description={t('logistics.driver.packagesCount', {
                    count: packageCount(stop.shipmentId),
                  })}
                />
              </div>
            );
          })}
        </div>
      </div>
    </DriverModal>
  );
};
