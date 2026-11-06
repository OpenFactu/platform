import React from 'react';
import { Button } from '@openfactu/ui';
import { CheckCircle2, MapPin, TriangleAlert } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

interface Props {
  status: string;
  isPickup: boolean;
  /** La empresa puede no pedir que se marque la llegada. */
  canArrive: boolean;
  onDeliver: () => void;
  onArrive: () => void;
  onProblem: () => void;
}

/** Lo que se hace en la parada: entregar en grande y, debajo, lo demás. */
export const DriverStopActions: React.FC<Props> = ({
  status,
  isPickup,
  canArrive,
  onDeliver,
  onArrive,
  onProblem,
}) => {
  const { t } = useI18n();
  const showArrive = canArrive && status !== 'arrived';
  return (
    <>
      <Button size="lg" className="h-14 w-full text-base" onClick={onDeliver}>
        <CheckCircle2 size={20} />
        {isPickup ? t('logistics.driver.collectNow') : t('logistics.driver.deliverNow')}
      </Button>
      <div className={showArrive ? 'grid grid-cols-2 gap-2' : ''}>
        {showArrive && (
          <Button size="lg" variant="secondary" onClick={onArrive}>
            <MapPin size={18} /> {t('logistics.driver.arrived')}
          </Button>
        )}
        <Button size="lg" variant="outline" className={showArrive ? '' : 'w-full'} onClick={onProblem}>
          <TriangleAlert size={18} />
          {isPickup ? t('logistics.driver.cantCollect') : t('logistics.driver.cantDeliver')}
        </Button>
      </div>
    </>
  );
};
