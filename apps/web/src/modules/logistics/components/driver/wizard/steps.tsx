import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Input,
  SignaturePad,
  Textarea,
  type SignaturePadHandle,
} from '@openfactu/ui';
import { QrCode, RotateCcw } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import type { DeliveryFlow, Handover } from '../../../domain/deliveryFlow';
import {
  handoverPatch,
  needsRecipientName,
  type WizardData,
} from '../../../domain/deliveryWizard';
import { flattenOnWhite } from '../../../domain/proofImages';
import type { RoutePackage } from '../../../domain/route';
import { PhotoCapture } from '../PhotoCapture';

/** Tinta de la firma: oscura siempre, porque el área es blanca también en modo oscuro. */
const SIGNATURE_INK = '#0f172a';

export interface StepProps {
  data: WizardData;
  set: (patch: Partial<WizardData>) => void;
  flow: DeliveryFlow;
  isPickup: boolean;
}

const kilos = (pkg: RoutePackage) => (pkg.weightKg ? `${Number(pkg.weightKg)} kg` : undefined);

export const StepPackages: React.FC<
  StepProps & { packages: RoutePackage[]; onMissing: () => void; onScan: () => void }
> = ({ data, set, flow, packages, onMissing, onScan }) => {
  const { t } = useI18n();
  const scanOnly = flow.packageCheck === 'scan';
  const toggle = (id: string, on: boolean) =>
    set({ checked: on ? [...data.checked, id] : data.checked.filter((other) => other !== id) });

  return (
    <div className="space-y-3">
      {scanOnly && (
        <Button size="lg" className="w-full" onClick={onScan}>
          <QrCode size={18} /> {t('logistics.wizard.packages.scan')}
        </Button>
      )}
      <div className="space-y-2">
        {packages.map((pkg) => (
          <div key={pkg.id} className="rounded-lg border border-border-default bg-bg-card p-3">
            <Checkbox
              checked={data.checked.includes(pkg.id)}
              disabled={scanOnly}
              onChange={(on) => toggle(pkg.id, on)}
              label={<span className="font-mono text-base">{pkg.code}</span>}
              description={kilos(pkg)}
            />
          </div>
        ))}
      </div>
      {!scanOnly && (
        <Button
          size="lg"
          variant="secondary"
          className="w-full"
          onClick={() => set({ checked: packages.map((pkg) => pkg.id) })}
        >
          {t('logistics.wizard.packages.all')}
        </Button>
      )}
      <Button size="lg" variant="outline" className="w-full" onClick={onMissing}>
        {t('logistics.wizard.packages.missing')}
      </Button>
    </div>
  );
};

export const StepRecipient: React.FC<StepProps & { customerName?: string | null }> = ({
  data,
  set,
  flow,
  customerName,
}) => {
  const { t } = useI18n();
  const options = flow.handover.filter(
    (option: Handover) => option !== 'customer' || !!customerName || flow.handover.length === 1,
  );
  const typesName = data.handover !== 'safePlace' && (data.handover !== 'customer' || !customerName);

  return (
    <div className="space-y-3">
      {options.length > 1 && (
        <div className="space-y-2">
          {options.map((option) => (
            <Button
              key={option}
              size="lg"
              variant={data.handover === option ? 'primary' : 'outline'}
              className="w-full"
              onClick={() => set(handoverPatch(option, customerName))}
            >
              {option === 'customer' ? customerName : t(`logistics.wizard.handover.${option}`)}
            </Button>
          ))}
        </div>
      )}
      {data.handover === 'safePlace' && (
        <Alert tone="info">{t('logistics.wizard.handover.safePlaceHint')}</Alert>
      )}
      {typesName && (
        <Input
          autoFocus
          label={t('logistics.wizard.recipient.name')}
          requiredMark={needsRecipientName(data.handover)}
          value={data.recipientName}
          onChange={(e) => set({ recipientName: e.target.value })}
        />
      )}
    </div>
  );
};

export const StepSignature: React.FC<StepProps> = ({ data, set, flow }) => {
  const { t } = useI18n();
  const padRef = useRef<SignaturePadHandle>(null);
  // Al volver a este paso el lienzo sale vacío: se enseña la firma que ya hay.
  const [drawing, setDrawing] = useState(!data.signature);
  const [cantSign, setCantSign] = useState(!!data.recipientDocument);
  const height = useMemo(() => Math.max(200, Math.min(340, window.innerHeight * 0.38)), []);

  const onStrokes = async (strokes: unknown[]) => {
    if (!strokes.length || !padRef.current) {
      set({ signature: null });
      return;
    }
    set({ signature: await flattenOnWhite(padRef.current.toDataURL('image/png')) });
  };

  return (
    <div className="space-y-3">
      {!cantSign &&
        (drawing ? (
          // El área se fuerza a blanco (también en oscuro): la tinta es oscura y la
          // firma acaba en un correo.
          <div style={{ ['--bg-card' as string]: '#ffffff' }}>
            <SignaturePad
              ref={padRef}
              color={SIGNATURE_INK}
              height={height}
              hint={t('logistics.pod.signatureHint')}
              onChange={(strokes) => void onStrokes(strokes)}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <img
              src={data.signature ?? ''}
              alt={t('logistics.pod.signature')}
              className="w-full rounded-lg border border-border-default bg-white"
            />
            <Button
              size="lg"
              variant="secondary"
              className="w-full"
              onClick={() => {
                set({ signature: null });
                setDrawing(true);
              }}
            >
              <RotateCcw size={18} /> {t('logistics.wizard.signature.redo')}
            </Button>
          </div>
        ))}

      {flow.allowDocument && cantSign && (
        <Input
          autoFocus
          label={t('logistics.pod.document')}
          requiredMark={flow.signature === 'required'}
          value={data.recipientDocument}
          onChange={(e) => set({ recipientDocument: e.target.value.toUpperCase() })}
        />
      )}
      {flow.allowDocument && (
        <Button
          size="lg"
          variant="outline"
          className="w-full"
          onClick={() => {
            set(cantSign ? { recipientDocument: '' } : { signature: null });
            if (!cantSign) setDrawing(true);
            setCantSign(!cantSign);
          }}
        >
          {cantSign
            ? t('logistics.wizard.signature.canSign')
            : t('logistics.wizard.signature.cantSign')}
        </Button>
      )}
    </div>
  );
};

export const StepPhoto: React.FC<StepProps> = ({ data, set, flow }) => {
  const { t } = useI18n();
  const required = flow.photo === 'required' || data.handover === 'safePlace';
  return (
    <div className="space-y-3">
      <PhotoCapture
        value={data.photo}
        onChange={(photo) => set({ photo })}
        label={t('logistics.pod.takePhoto')}
      />
      {required && !data.photo && <Alert tone="info">{t('logistics.wizard.photo.required')}</Alert>}
    </div>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4 border-b border-border-subtle py-2 last:border-0">
    <span className="text-sm text-fg-muted">{label}</span>
    <span className="text-right text-sm font-semibold text-fg-default">{children}</span>
  </div>
);

export const StepConfirm: React.FC<
  StepProps & { packageCount: number; customerName?: string | null }
> = ({ data, set, isPickup, packageCount }) => {
  const { t } = useI18n();
  const place = data.handover === 'customer' ? null : t(`logistics.wizard.handover.${data.handover}`);
  return (
    <div className="space-y-4">
      <div>
        {packageCount > 0 && <Row label={t('logistics.wizard.confirm.packages')}>{packageCount}</Row>}
        {(place || data.recipientName) && (
          <Row
            label={t(
              isPickup
                ? 'logistics.wizard.confirm.recipientPickup'
                : 'logistics.wizard.confirm.recipient',
            )}
          >
            {[place, data.recipientName.trim()].filter(Boolean).join(' · ')}
          </Row>
        )}
        {data.recipientDocument && (
          <Row label={t('logistics.pod.document')}>{data.recipientDocument}</Row>
        )}
        {data.signature && (
          <Row label={t('logistics.pod.signature')}>
            <img
              src={data.signature}
              alt=""
              className="h-14 rounded border border-border-subtle bg-white"
            />
          </Row>
        )}
        {data.photo && (
          <Row label={t('logistics.pod.photo')}>
            <img src={data.photo} alt="" className="h-14 rounded border border-border-subtle" />
          </Row>
        )}
      </div>
      <Textarea
        label={t('logistics.pod.notes')}
        rows={2}
        placeholder={t('logistics.pod.notesPlaceholder')}
        value={data.notes}
        onChange={(e) => set({ notes: e.target.value })}
      />
    </div>
  );
};
