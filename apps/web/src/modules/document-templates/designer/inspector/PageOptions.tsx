import React from 'react';
import { Button, ColorInput, Input, NumberInput, Select, Textarea } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import type { CanvasLayout } from '../../components/canvas/types';
import { Label, Section, Toggle } from './controls';

export const PageNumbersInspector: React.FC<{
  value: CanvasLayout['pageNumbers'];
  onChange: (v: CanvasLayout['pageNumbers']) => void;
}> = ({ value, onChange }) => {
  const { t } = useI18n();
  const v = value ?? { enabled: false, alignment: 'center' as const };
  const patch = (p: Partial<NonNullable<CanvasLayout['pageNumbers']>>) => onChange({ ...v, ...p });
  return (
    <Section title={t('templates.designer.pageNumbers.title')}>
      <Toggle
        label={t('templates.designer.pageNumbers.show')}
        checked={v.enabled}
        onChange={(enabled) => patch({ enabled })}
      />
      {v.enabled && (
        <>
          <Label>{t('templates.designer.common.alignment')}</Label>
          <Select
            options={[
              { value: 'left', label: t('templates.designer.opt.left') },
              { value: 'center', label: t('templates.designer.opt.center') },
              { value: 'right', label: t('templates.designer.opt.right') },
            ]}
            value={v.alignment ?? 'center'}
            onChange={(v) => patch({ alignment: v as any })}
            ariaLabel={t('templates.designer.common.option')}
          />
          <div className="text-[11px] text-fg-muted leading-snug">
            {t('templates.designer.pageNumbers.hint')}
          </div>
        </>
      )}
    </Section>
  );
};

export const TraceabilityFooterInspector: React.FC<{
  showDocQr?: boolean;
  showDocBarcode?: boolean;
  onChange: (v: { showDocQr?: boolean; showDocBarcode?: boolean }) => void;
}> = ({ showDocQr, showDocBarcode, onChange }) => {
  const { t } = useI18n();
  return (
    <Section title={t('templates.designer.traceability.title')}>
      <Toggle
        label={t('templates.designer.traceability.showQr')}
        checked={showDocQr === true}
        onChange={(v) => onChange({ showDocQr: v })}
      />
      <Toggle
        label={t('templates.designer.traceability.showBarcode')}
        checked={showDocBarcode === true}
        onChange={(v) => onChange({ showDocBarcode: v })}
      />
      {(showDocQr || showDocBarcode) && (
        <div className="text-[11px] text-fg-muted leading-snug">
          {t('templates.designer.traceability.hint')}
        </div>
      )}
    </Section>
  );
};

export const WatermarkInspector: React.FC<{
  watermark: CanvasLayout['watermark'];
  onChange: (w: CanvasLayout['watermark']) => void;
}> = ({ watermark, onChange }) => {
  const { t } = useI18n();
  const w = watermark ?? {
    enabled: false,
    text: 'BORRADOR',
    color: '#94a3b8',
    opacity: 0.15,
    rotation: -30,
    fontSize: 84,
    fontWeight: 'bold' as const,
  };
  const patch = (p: Partial<NonNullable<CanvasLayout['watermark']>>) => onChange({ ...w, ...p });
  return (
    <Section title={t('templates.designer.watermark.title')}>
      <Toggle
        label={t('templates.designer.watermark.enable')}
        checked={w.enabled}
        onChange={(v) => patch({ enabled: v })}
      />
      {w.enabled && (
        <>
          <Label>{t('templates.designer.common.text')}</Label>
          <Input
            inputSize="sm"
            className="font-mono"
            value={w.text}
            onChange={(e) => patch({ text: e.target.value })}
            placeholder={t('templates.designer.watermark.textPlaceholder')}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <div className="text-[11px] text-fg-muted">
                {t('templates.designer.common.color')}
              </div>
              <ColorInput
                size="sm"
                showHex={false}
                value={w.color ?? '#94a3b8'}
                onChange={(next) => patch({ color: next })}
              />
            </label>
            <label className="block">
              <div className="text-[11px] text-fg-muted">
                {t('templates.designer.common.sizePt')}
              </div>
              <NumberInput
                inputSize="sm"
                thousandSeparator={false}
                min={10}
                max={300}
                value={w.fontSize ?? 84}
                onChange={(num) => patch({ fontSize: num ?? 84 })}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <div className="text-[11px] text-fg-muted">
                {t('templates.designer.common.rotationDeg')}
              </div>
              <NumberInput
                inputSize="sm"
                thousandSeparator={false}
                min={-180}
                max={180}
                value={w.rotation ?? -30}
                onChange={(num) => patch({ rotation: num ?? 0 })}
              />
            </label>
            <label className="block">
              <div className="text-[11px] text-fg-muted">
                {t('templates.designer.watermark.opacity')}
              </div>
              <NumberInput
                inputSize="sm"
                thousandSeparator={false}
                step={0.05}
                precision={2}
                min={0}
                max={1}
                value={w.opacity ?? 0.15}
                onChange={(num) =>
                  patch({
                    opacity: Math.max(0, Math.min(1, num ?? 0)),
                  })
                }
              />
            </label>
          </div>
          <Toggle
            label={t('templates.designer.common.bold')}
            checked={w.fontWeight === 'bold'}
            onChange={(v) => patch({ fontWeight: v ? 'bold' : 'normal' })}
          />
        </>
      )}
    </Section>
  );
};
