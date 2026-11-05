import React from 'react';
import { Button, Progress, usePopup } from '@openfactu/ui';
import { CheckCircle2, Navigation } from 'lucide-react';
import { BarcodeCameraModal } from '@/components/scanner/BarcodeCameraModal';
import { useI18n } from '@/i18n/I18nContext';
import type { DeliveryFlow } from '../../../domain/deliveryFlow';
import type { proofFrom } from '../../../domain/deliveryWizard';
import { stopAddress, stopMapsUrl } from '../../../domain/driverRoute';
import type { RoutePackage, RouteStop } from '../../../domain/route';
import type { Shipment } from '../../../domain/shipment';
import { useDeliveryWizard } from '../../../hooks/useDeliveryWizard';
import { usePackageScanner } from '../../../hooks/usePackageScanner';
import { DriverModal } from '../DriverModal';
import { StepConfirm, StepPackages, StepPhoto, StepRecipient, StepSignature } from './steps';

interface Props {
  flow: DeliveryFlow;
  stop: RouteStop;
  shipment?: Shipment;
  packages: RoutePackage[];
  /** La parada que viene después de esta. */
  upcoming: RouteStop | null;
  upcomingShipment?: Shipment;
  onClose: () => void;
  onSubmit: (proof: ReturnType<typeof proofFrom>) => Promise<boolean>;
  onMissingPackage: () => void;
  onFinishRoute: () => void;
}

/**
 * Entregar paso a paso, a toda la pantalla, con lo que pida la empresa. Se monta al
 * abrirse: cada vez, de cero.
 */
export const DeliveryWizard: React.FC<Props> = ({
  flow,
  stop,
  shipment,
  packages,
  upcoming,
  upcomingShipment,
  onClose,
  onSubmit,
  onMissingPackage,
  onFinishRoute,
}) => {
  const { t } = useI18n();
  const popup = usePopup();
  const isPickup = shipment?.kind === 'pickup_return';
  const customerName = shipment?.recipientName;
  const wizard = useDeliveryWizard({
    flow,
    packageIds: packages.map((pkg) => pkg.id),
    customerName,
    onSubmit,
  });
  const { step, data, set, done } = wizard;
  const address = stopAddress(stop, shipment);
  const scanner = usePackageScanner(
    packages,
    (pkg) => data.checked.includes(pkg.id),
    (pkg) => set({ checked: [...data.checked, pkg.id] }),
  );

  const leave = async () => {
    if (wizard.dirty && !done) {
      const ok = await popup.confirm({
        title: t('logistics.wizard.discard.title'),
        message: t('logistics.wizard.discard.message'),
        tone: 'danger',
        confirmLabel: t('logistics.wizard.discard.confirm'),
      });
      if (!ok) return;
    }
    onClose();
  };

  if (done) {
    const href = upcoming ? stopMapsUrl(upcoming, upcomingShipment, flow.map.navigationApp) : null;
    return (
      <DriverModal
        isOpen
        onClose={onClose}
        title={t(isPickup ? 'logistics.wizard.done.titlePickup' : 'logistics.wizard.done.title')}
        footer={
          <div className="w-full space-y-2">
            {upcoming && href && (
              <Button
                size="lg"
                className="h-14 w-full text-base"
                onClick={() => {
                  window.open(href, '_blank', 'noreferrer');
                  onClose();
                }}
              >
                <Navigation size={20} /> {t('logistics.wizard.done.navigate')}
              </Button>
            )}
            {!upcoming && (
              <Button size="lg" className="h-14 w-full text-base" onClick={onFinishRoute}>
                {t('logistics.driver.finishRoute')}
              </Button>
            )}
            <Button size="lg" variant="secondary" className="w-full" onClick={onClose}>
              {t('logistics.wizard.done.backToRoute')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <CheckCircle2 size={72} className="text-success" />
          {upcoming ? (
            <div className="space-y-1">
              <div className="text-sm text-fg-muted">{t('logistics.wizard.done.next')}</div>
              <div className="text-xl font-bold text-fg-default">
                {upcomingShipment?.recipientName || stopAddress(upcoming, upcomingShipment)}
              </div>
              {upcomingShipment?.recipientName && (
                <div className="text-fg-body">{stopAddress(upcoming, upcomingShipment)}</div>
              )}
            </div>
          ) : (
            <div className="text-xl font-bold text-fg-default">{t('logistics.wizard.done.last')}</div>
          )}
        </div>
      </DriverModal>
    );
  }

  const titleKey =
    isPickup && (step === 'recipient' || step === 'packages')
      ? `logistics.wizard.${step}.titlePickup`
      : `logistics.wizard.${step}.title`;
  const skipping =
    wizard.canGoOn &&
    ((step === 'photo' && !data.photo) ||
      (step === 'signature' && !data.signature && !data.recipientDocument.trim()));
  const nextLabel = wizard.isLast
    ? wizard.sending
      ? t('logistics.wizard.confirm.sending')
      : t(isPickup ? 'logistics.wizard.confirm.submitPickup' : 'logistics.wizard.confirm.submit')
    : skipping
      ? t(`logistics.wizard.${step}.skip`)
      : t('logistics.wizard.next');

  const stepProps = { data, set, flow, isPickup };

  return (
    <DriverModal
      isOpen
      onClose={leave}
      eyebrow={t('logistics.wizard.stepOf', { n: wizard.index + 1, total: wizard.steps.length })}
      title={t(titleKey)}
      subtitle={address || undefined}
      footer={
        <div className="flex w-full gap-2">
          <Button size="lg" variant="secondary" onClick={wizard.isFirst ? leave : wizard.back}>
            {wizard.isFirst ? t('logistics.common.cancel') : t('logistics.wizard.back')}
          </Button>
          <Button
            size="lg"
            className="h-14 flex-1 text-base"
            disabled={!wizard.canGoOn || wizard.sending}
            onClick={wizard.isLast ? wizard.submit : wizard.next}
          >
            {nextLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        <Progress value={((wizard.index + 1) / wizard.steps.length) * 100} size="sm" />
        {step === 'packages' && (
          <StepPackages
            {...stepProps}
            packages={packages}
            onMissing={onMissingPackage}
            onScan={scanner.start}
          />
        )}
        {step === 'recipient' && <StepRecipient {...stepProps} customerName={customerName} />}
        {step === 'signature' && <StepSignature {...stepProps} />}
        {step === 'photo' && <StepPhoto {...stepProps} />}
        {step === 'confirm' && <StepConfirm {...stepProps} packageCount={packages.length} />}
      </div>
      <BarcodeCameraModal
        open={scanner.open}
        onClose={scanner.stop}
        onScan={scanner.handle}
        continuous
      />
    </DriverModal>
  );
};
