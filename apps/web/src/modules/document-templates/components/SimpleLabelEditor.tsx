import { ColorInput, Input, NumberInput, Select, Switch } from '@openfactu/ui';
/**
 * Editor "tonto" de etiquetas FREE: formulario con toggles que produce el
 * `CanvasLayout` automáticamente sin que el usuario tenga que tocar el
 * diseñador canvas. Va dentro del `DocumentTemplateDesigner` como modo
 * alternativo al canvas.
 *
 * Cualquier cambio en el formulario llama a `onChange(layout)` con el layout
 * recompilado. Persistir el layout también persiste `simpleLabel` (la
 * configuración) dentro del propio layout, así al recargar volvemos al modo
 * simple por defecto.
 */

import React from 'react';
import {
  buildSimpleLabelLayout,
  defaultSimpleArticleSettings,
  defaultSimpleDocumentSettings,
} from './canvas/buildSimpleLabel';
import {
  PAGE_SIZE_LABELS,
  type CanvasLayout,
  type PageSize,
  type SimpleLabelSettings,
  type BarcodeSymbology,
} from './canvas/types';
import { useI18n } from '@/i18n/I18nContext';

interface Props {
  settings: SimpleLabelSettings;
  onChange: (layout: CanvasLayout) => void;
}

export const SimpleLabelEditor: React.FC<Props> = ({ settings, onChange }) => {
  const { t } = useI18n();
  const update = (patch: Partial<SimpleLabelSettings>) => {
    const next = { ...settings, ...patch };
    onChange(buildSimpleLabelLayout(next));
  };

  return (
    <div className="px-6 py-5 max-w-2xl mx-auto space-y-5 text-sm overflow-y-auto h-full">
      <div className="text-[11px] uppercase tracking-wide font-bold text-slate-500 dark:text-slate-400">
        {t('templates.simpleLabel.heading')}
      </div>

      <FormSection title={t('templates.simpleLabel.dataSource')}>
        <RadioRow
          label={t('templates.simpleLabel.whatToPrint')}
          value={settings.kind}
          options={[
            { value: 'article', label: t('templates.simpleLabel.articleLabel') },
            { value: 'document', label: t('templates.simpleLabel.documentLabel') },
          ]}
          onChange={(v) => {
            // Cambiar el origen reinicia los toggles a defaults sensatos del
            // nuevo tipo para evitar referencias a paths que no existen.
            const base =
              v === 'article' ? defaultSimpleArticleSettings() : defaultSimpleDocumentSettings();
            // Conservamos pageSize/accentColor que no dependen del origen.
            update({
              ...base,
              pageSize: settings.pageSize,
              customWidthMm: settings.customWidthMm,
              customHeightMm: settings.customHeightMm,
              accentColor: settings.accentColor,
            });
          }}
        />
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-1">
          {settings.kind === 'article'
            ? t('templates.simpleLabel.articleHint')
            : t('templates.simpleLabel.documentHint')}
        </p>
      </FormSection>

      <FormSection title={t('templates.simpleLabel.size')}>
        <Field label={t('templates.simpleLabel.pageSize')}>
          <Select
            options={[
              { value: 'Ticket80', label: t(PAGE_SIZE_LABELS.Ticket80) },
              { value: 'Ticket58', label: t(PAGE_SIZE_LABELS.Ticket58) },
              { value: 'Label100x62', label: t(PAGE_SIZE_LABELS.Label100x62) },
              { value: 'Label70x37', label: t(PAGE_SIZE_LABELS.Label70x37) },
              { value: 'Label50x25', label: t(PAGE_SIZE_LABELS.Label50x25) },
              { value: 'A4', label: t(PAGE_SIZE_LABELS.A4) },
              { value: 'Letter', label: t(PAGE_SIZE_LABELS.Letter) },
              { value: 'Custom', label: t(PAGE_SIZE_LABELS.Custom) },
            ]}
            value={settings.pageSize}
            onChange={(v) => update({ pageSize: v as PageSize })}
            ariaLabel={t('templates.simpleLabel.option')}
          />
        </Field>
        {settings.pageSize === 'Custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label={t('templates.simpleLabel.widthMm')}>
              <NumberInput
                value={settings.customWidthMm ?? 100}
                onChange={(v) => update({ customWidthMm: Math.max(10, v || 10) })}
                min={10}
              />
            </Field>
            <Field label={t('templates.simpleLabel.heightMm')}>
              <NumberInput
                value={settings.customHeightMm ?? 60}
                onChange={(v) => update({ customHeightMm: Math.max(10, v || 10) })}
                min={10}
              />
            </Field>
          </div>
        )}
      </FormSection>

      <FormSection title={t('templates.simpleLabel.whatToShow')}>
        <ToggleRow
          label={t('templates.simpleLabel.header')}
          checked={settings.showTitle === true}
          onChange={(v) => update({ showTitle: v })}
        />
        {settings.showTitle && (
          <Field label={t('templates.simpleLabel.headerText')}>
            <Input
              value={settings.titleText ?? ''}
              onChange={(e) => update({ titleText: e.target.value })}
              placeholder={settings.kind === 'document' ? 'DOCUMENTO' : 'PRODUCTO'}
            />
          </Field>
        )}
        <ToggleRow
          label={
            settings.kind === 'article'
              ? t('templates.simpleLabel.itemName')
              : t('templates.simpleLabel.docCode')
          }
          checked={settings.showName === true}
          onChange={(v) => update({ showName: v })}
        />
        {settings.kind === 'article' && (
          <ToggleRow
            label={t('templates.simpleLabel.itemCode')}
            checked={settings.showCode === true}
            onChange={(v) => update({ showCode: v })}
          />
        )}
        {settings.kind === 'article' && (
          <ToggleRow
            label={t('templates.simpleLabel.price')}
            checked={settings.showPrice === true}
            onChange={(v) => update({ showPrice: v })}
          />
        )}
        <ToggleRow
          label={t('templates.simpleLabel.barcode')}
          checked={settings.showBarcode === true}
          onChange={(v) => update({ showBarcode: v })}
        />
        {settings.showBarcode && (
          <Field label={t('templates.simpleLabel.symbology')}>
            <Select
              options={[
                { value: 'auto', label: t('templates.simpleLabel.symbologyAuto') },
                { value: 'code128', label: 'Code 128' },
                { value: 'ean13', label: 'EAN-13' },
                { value: 'ean8', label: 'EAN-8' },
                { value: 'upca', label: 'UPC-A' },
                { value: 'code39', label: 'Code 39' },
                { value: 'itf14', label: 'ITF-14' },
                { value: 'datamatrix', label: 'Data Matrix' },
                { value: 'pdf417', label: 'PDF417' },
              ]}
              value={settings.barcodeSymbology ?? 'auto'}
              onChange={(v) => update({ barcodeSymbology: v as BarcodeSymbology })}
              ariaLabel={t('templates.simpleLabel.option')}
            />
          </Field>
        )}
        <ToggleRow
          label={t('templates.simpleLabel.qr')}
          checked={settings.showQr === true}
          onChange={(v) => update({ showQr: v })}
        />
      </FormSection>

      <FormSection title={t('templates.simpleLabel.footer')}>
        <Field label={t('templates.simpleLabel.footerText')}>
          <Input
            value={settings.footerText ?? ''}
            onChange={(e) => update({ footerText: e.target.value || undefined })}
            placeholder={t('templates.simpleLabel.footerPlaceholder')}
          />
          <p className="text-[10px] text-slate-400 mt-1">
            {t('templates.simpleLabel.footerHint')} <code>{'{{params.docCode}}'}</code>.
          </p>
        </Field>
      </FormSection>

      <FormSection title={t('templates.simpleLabel.accent')}>
        <Field label={t('templates.simpleLabel.accentColor')}>
          <ColorInput
            value={settings.accentColor ?? '#0f172a'}
            onChange={(v) => update({ accentColor: v })}
          />
        </Field>
      </FormSection>

      <p className="text-[11px] text-slate-500 dark:text-slate-400 italic leading-snug border-t border-slate-200 dark:border-slate-800 pt-3">
        {t('templates.simpleLabel.advancedNote')}
      </p>
    </div>
  );
};

// ---------- helpers UI ----------

const FormSection: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="space-y-2 border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-900">
    <div className="text-[11px] uppercase tracking-wide font-bold text-slate-500 dark:text-slate-400">
      {title}
    </div>
    {children}
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">{label}</div>
    {children}
  </label>
);

const ToggleRow: React.FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <div className="py-1">
    <Switch label={label} checked={checked} onChange={onChange} />
  </div>
);

const RadioRow: React.FC<{
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: any) => void;
}> = ({ label, value, options, onChange }) => (
  <div>
    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">{label}</div>
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 px-3 py-2 text-xs rounded border transition-all ${
            value === o.value
              ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-200 font-bold'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  </div>
);
