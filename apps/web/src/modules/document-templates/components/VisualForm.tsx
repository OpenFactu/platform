import React from 'react';
import {
  Input,
  Textarea,
  NumberInput,
  ColorInput,
  Checkbox,
  SearchableSelect,
  Slider,
} from '@openfactu/ui';
import {
  Palette,
  Layout,
  Image as ImageIcon,
  Building2,
  Users,
  Table,
  Stamp,
  AlignCenter,
  Code2,
} from 'lucide-react';
import type { VisualOptions } from '@openfactu/pdf/browser';
import { Section } from './Section';
import { useI18n } from '@/i18n/I18nContext';

interface Props {
  opts: VisualOptions;
  updateOpt: <K extends keyof VisualOptions>(key: K, value: VisualOptions[K]) => void;
}

// -------------------- Field helpers --------------------

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="text-[10px] font-bold text-fg-body uppercase tracking-wider">{children}</label>
);

/** El ColorInput del paquete ya trae muestra + campo hex en una pieza, así que
 *  aquí solo queda ponerle la etiqueta en versales del resto del panel. */
const ColorField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({
  label,
  value,
  onChange,
}) => (
  <div className="space-y-1">
    <FieldLabel>{label}</FieldLabel>
    <ColorInput value={value} onChange={onChange} size="sm" />
  </div>
);

const NumberField: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step, unit, onChange }) => (
  <div className="space-y-1">
    <FieldLabel>
      {label}
      {unit && <span className="text-fg-subtle normal-case"> ({unit})</span>}
    </FieldLabel>
    {/* NumberInput emite `number | null`; aquí el campo nunca puede quedar
        vacío (son medidas del PDF), así que un null se lee como 0. */}
    <NumberInput
      value={value}
      min={min}
      max={max}
      step={step ?? 1}
      onChange={(v) => onChange(v ?? 0)}
      className="h-9 text-xs"
    />
  </div>
);

const RangeField: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step, onChange }) => (
  // Slider de @openfactu/ui (desde 0.6.0; antes era un <input type="range">
  // porque el paquete no lo tenía). Pinta él la etiqueta y el valor.
  <Slider
    label={label}
    min={min}
    max={max}
    step={step ?? 1}
    value={value}
    onChange={onChange}
    showValue="always"
  />
);

const SelectField: React.FC<{
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => (
  <div className="space-y-1">
    <FieldLabel>{label}</FieldLabel>
    <SearchableSelect value={value} onChange={onChange} options={options} />
  </div>
);

const CheckboxRow: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description?: string;
}> = ({ checked, onChange, title, description }) => (
  <label className="flex items-center gap-3 p-2.5 border border-border-default rounded-lg hover:bg-bg-hover cursor-pointer">
    {/* Checkbox no expone `label`: la fila entera hace de etiqueta. */}
    <Checkbox checked={checked} onChange={onChange} />
    <div>
      <div className="text-xs font-bold text-fg-body">{title}</div>
      {description && <div className="text-[10px] text-fg-subtle">{description}</div>}
    </div>
  </label>
);

const Grid2: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
);

// -------------------- Main form --------------------

export const VisualForm: React.FC<Props> = ({ opts, updateOpt }) => {
  const { t } = useI18n();
  const updateColumn = <K extends keyof VisualOptions['columns']>(key: K, value: boolean) => {
    updateOpt('columns', { ...opts.columns, [key]: value });
  };
  const updateWatermark = <K extends keyof VisualOptions['watermark']>(
    key: K,
    value: VisualOptions['watermark'][K],
  ) => {
    updateOpt('watermark', { ...opts.watermark, [key]: value });
  };
  const updateFooter = <K extends keyof VisualOptions['footer']>(
    key: K,
    value: VisualOptions['footer'][K],
  ) => {
    updateOpt('footer', { ...opts.footer, [key]: value });
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
      <Section title={t('templates.visual.design')} icon={<Palette size={14} />} defaultExpanded>
        <div className="space-y-3">
          <Grid2>
            <ColorField
              label={t('templates.visual.primaryColor')}
              value={opts.accentColor}
              onChange={(v) => updateOpt('accentColor', v)}
            />
            <ColorField
              label={t('templates.visual.headerColor')}
              value={opts.headerBgColor}
              onChange={(v) => updateOpt('headerBgColor', v)}
            />
          </Grid2>
          <Grid2>
            <ColorField
              label={t('templates.visual.textColor')}
              value={opts.textColor}
              onChange={(v) => updateOpt('textColor', v)}
            />
            <ColorField
              label={t('templates.visual.secondaryColor')}
              value={opts.mutedColor}
              onChange={(v) => updateOpt('mutedColor', v)}
            />
          </Grid2>
          <Grid2>
            <SelectField
              label={t('templates.visual.font')}
              value={opts.fontFamily}
              onChange={(v) => updateOpt('fontFamily', v as any)}
              options={[
                { label: t('templates.visual.fontSans'), value: 'sans' },
                { label: t('templates.visual.fontSerif'), value: 'serif' },
                { label: t('templates.visual.fontMono'), value: 'mono' },
              ]}
            />
            <NumberField
              label={t('templates.visual.baseSize')}
              value={opts.baseFontSize}
              min={7}
              max={14}
              unit="pt"
              onChange={(v) => updateOpt('baseFontSize', v)}
            />
          </Grid2>
        </div>
      </Section>

      <Section title={t('templates.visual.page')} icon={<Layout size={14} />}>
        <div className="space-y-3">
          <Grid2>
            <SelectField
              label={t('templates.visual.size')}
              value={opts.pageSize}
              onChange={(v) => updateOpt('pageSize', v as any)}
              options={[
                { label: 'A4 (210 × 297 mm)', value: 'A4' },
                { label: t('templates.visual.letterUs'), value: 'Letter' },
                { label: 'A5 (148 × 210 mm)', value: 'A5' },
              ]}
            />
            <SelectField
              label={t('templates.visual.orientation')}
              value={opts.orientation}
              onChange={(v) => updateOpt('orientation', v as any)}
              options={[
                { label: t('templates.visual.portrait'), value: 'portrait' },
                { label: t('templates.visual.landscape'), value: 'landscape' },
              ]}
            />
          </Grid2>
          <SelectField
            label={t('templates.visual.margins')}
            value={opts.margins}
            onChange={(v) => updateOpt('margins', v as any)}
            options={[
              { label: t('templates.visual.marginsNarrow'), value: 'narrow' },
              { label: t('templates.visual.marginsNormal'), value: 'normal' },
              { label: t('templates.visual.marginsWide'), value: 'wide' },
            ]}
          />
        </div>
      </Section>

      <Section title={t('templates.visual.headerLogo')} icon={<ImageIcon size={14} />}>
        <div className="space-y-3">
          <div className="space-y-1">
            <FieldLabel>{t('templates.visual.customTitle')}</FieldLabel>
            <Input
              value={opts.customTitle}
              onChange={(e) => updateOpt('customTitle', e.target.value)}
              placeholder={t('templates.visual.customTitlePlaceholder')}
            />
          </div>
          <div className="space-y-1">
            <FieldLabel>{t('templates.visual.logoUrl')}</FieldLabel>
            <Input
              value={opts.logoUrl}
              onChange={(e) => updateOpt('logoUrl', e.target.value)}
              placeholder="https://miempresa.com/logo.png"
            />
          </div>
          <Grid2>
            <SelectField
              label={t('templates.visual.logoPosition')}
              value={opts.logoPosition}
              onChange={(v) => updateOpt('logoPosition', v as any)}
              options={[
                { label: t('templates.visual.left'), value: 'left' },
                { label: t('templates.visual.centered'), value: 'center' },
                { label: t('templates.visual.right'), value: 'right' },
              ]}
            />
            <NumberField
              label={t('templates.visual.maxHeight')}
              value={opts.logoMaxHeight}
              min={20}
              max={200}
              unit="px"
              onChange={(v) => updateOpt('logoMaxHeight', v)}
            />
          </Grid2>
        </div>
      </Section>

      <Section title={t('templates.visual.companyData')} icon={<Building2 size={14} />}>
        <div className="space-y-2">
          <CheckboxRow
            checked={opts.showCompanyTaxId}
            onChange={(v) => updateOpt('showCompanyTaxId', v)}
            title={t('templates.visual.showCompanyTaxId')}
          />
          <CheckboxRow
            checked={opts.showCompanyAddress}
            onChange={(v) => updateOpt('showCompanyAddress', v)}
            title={t('templates.visual.showAddress')}
          />
          <CheckboxRow
            checked={opts.showCompanyContact}
            onChange={(v) => updateOpt('showCompanyContact', v)}
            title={t('templates.visual.showContact')}
          />
          <p className="text-[10px] text-fg-subtle italic pt-1">
            {t('templates.visual.companyHint1')} <code>SystemConfig</code>{' '}
            {t('templates.visual.companyHint2')}
          </p>
        </div>
      </Section>

      <Section title={t('templates.visual.partnerData')} icon={<Users size={14} />}>
        <div className="space-y-2">
          <CheckboxRow
            checked={opts.showPartnerTaxId}
            onChange={(v) => updateOpt('showPartnerTaxId', v)}
            title={t('templates.visual.showPartnerTaxId')}
          />
          <CheckboxRow
            checked={opts.showPartnerAddress}
            onChange={(v) => updateOpt('showPartnerAddress', v)}
            title={t('templates.visual.showMainAddress')}
          />
          <CheckboxRow
            checked={opts.showPartnerContact}
            onChange={(v) => updateOpt('showPartnerContact', v)}
            title={t('templates.visual.showEmailPhone')}
          />
          <CheckboxRow
            checked={opts.showBillTo}
            onChange={(v) => updateOpt('showBillTo', v)}
            title={t('templates.visual.billToBlock')}
            description={t('templates.visual.ifDocHasIt')}
          />
          <CheckboxRow
            checked={opts.showShipTo}
            onChange={(v) => updateOpt('showShipTo', v)}
            title={t('templates.visual.shipToBlock')}
            description={t('templates.visual.ifDocHasIt')}
          />
          <CheckboxRow
            checked={opts.showBaseDoc}
            onChange={(v) => updateOpt('showBaseDoc', v)}
            title={t('templates.visual.showBaseDoc')}
            description={t('templates.visual.showBaseDocDesc')}
          />
          {/* Extensión propia: el toggle no está en el paquete @openfactu/pdf
              (se serializa en el meta y lo lee renderDocumentPdf en el server). */}
          <CheckboxRow
            checked={Boolean((opts as any).showInternalOrder)}
            onChange={(v) =>
              (updateOpt as unknown as (k: string, val: boolean) => void)('showInternalOrder', v)
            }
            title={t('templates.visual.showProject')}
            description={t('templates.visual.showProjectDesc')}
          />
        </div>
      </Section>

      <Section title={t('templates.visual.linesTable')} icon={<Table size={14} />}>
        <div className="space-y-2">
          <CheckboxRow
            checked={opts.columns.code}
            onChange={(v) => updateColumn('code', v)}
            title={t('templates.visual.colCode')}
          />
          <CheckboxRow
            checked={opts.columns.description}
            onChange={(v) => updateColumn('description', v)}
            title={t('templates.visual.colDescription')}
          />
          <CheckboxRow
            checked={opts.columns.quantity}
            onChange={(v) => updateColumn('quantity', v)}
            title={t('templates.visual.colQuantity')}
          />
          <CheckboxRow
            checked={opts.columns.uom}
            onChange={(v) => updateColumn('uom', v)}
            title={t('templates.visual.colUom')}
          />
          <CheckboxRow
            checked={opts.columns.price}
            onChange={(v) => updateColumn('price', v)}
            title={t('templates.visual.colPrice')}
          />
          <CheckboxRow
            checked={opts.columns.iva}
            onChange={(v) => updateColumn('iva', v)}
            title={t('templates.visual.colVat')}
          />
          <CheckboxRow
            checked={opts.columns.lineTotal}
            onChange={(v) => updateColumn('lineTotal', v)}
            title={t('templates.visual.colLineTotal')}
          />
        </div>
      </Section>

      <Section title={t('templates.visual.totals')} icon={<Stamp size={14} />}>
        <div className="space-y-2">
          <CheckboxRow
            checked={opts.showTaxBreakdown}
            onChange={(v) => updateOpt('showTaxBreakdown', v)}
            title={t('templates.visual.taxBreakdown')}
            description={t('templates.visual.taxBreakdownDesc')}
          />
          <CheckboxRow
            checked={opts.showTotalInWords}
            onChange={(v) => updateOpt('showTotalInWords', v)}
            title={t('templates.visual.totalInWords')}
            description={t('templates.visual.totalInWordsDesc')}
          />
        </div>
      </Section>

      <Section title={t('templates.visual.customFields')} icon={<Stamp size={14} />}>
        <div className="space-y-2">
          <CheckboxRow
            checked={!!(opts as any).showCustomFields}
            onChange={(v) =>
              (updateOpt as unknown as (k: string, val: boolean) => void)('showCustomFields', v)
            }
            title={t('templates.visual.showCustomFields')}
            description={t('templates.visual.showCustomFieldsDesc')}
          />
          {(opts as any).showCustomFields && (
            <div className="space-y-1">
              <FieldLabel>{t('templates.visual.blockTitle')}</FieldLabel>
              <Input
                value={(opts as any).customFieldsLabel ?? 'Datos adicionales'}
                onChange={(e) =>
                  (updateOpt as unknown as (k: string, val: string) => void)(
                    'customFieldsLabel',
                    e.target.value,
                  )
                }
                placeholder="Datos adicionales"
              />
            </div>
          )}
        </div>
      </Section>

      <Section title={t('templates.visual.watermark')} icon={<Stamp size={14} />}>
        <div className="space-y-3">
          <CheckboxRow
            checked={opts.watermark.enabled}
            onChange={(v) => updateWatermark('enabled', v)}
            title={t('templates.visual.enableWatermark')}
            description={t('templates.visual.watermarkDesc')}
          />
          {opts.watermark.enabled && (
            <>
              <div className="space-y-1">
                <FieldLabel>{t('templates.visual.text')}</FieldLabel>
                <Input
                  value={opts.watermark.text}
                  onChange={(e) => updateWatermark('text', e.target.value)}
                  placeholder={t('templates.visual.watermarkPlaceholder')}
                />
              </div>
              <Grid2>
                <ColorField
                  label={t('templates.visual.color')}
                  value={opts.watermark.color}
                  onChange={(v) => updateWatermark('color', v)}
                />
                <NumberField
                  label={t('templates.visual.size')}
                  value={opts.watermark.fontSize}
                  min={40}
                  max={200}
                  unit="px"
                  onChange={(v) => updateWatermark('fontSize', v)}
                />
              </Grid2>
              <RangeField
                label={t('templates.visual.opacity')}
                value={Math.round(opts.watermark.opacity * 100) / 100}
                min={0.05}
                max={1}
                step={0.05}
                onChange={(v) => updateWatermark('opacity', v)}
              />
              <RangeField
                label={t('templates.visual.rotation')}
                value={opts.watermark.rotation}
                min={-90}
                max={90}
                step={5}
                onChange={(v) => updateWatermark('rotation', v)}
              />
            </>
          )}
        </div>
      </Section>

      <Section title={t('templates.visual.footer')} icon={<AlignCenter size={14} />}>
        <div className="space-y-3">
          <div className="space-y-1">
            <FieldLabel>{t('templates.visual.footerMessage')}</FieldLabel>
            <Input
              value={opts.footer.text}
              onChange={(e) => updateFooter('text', e.target.value)}
              placeholder={t('templates.visual.footerPlaceholder')}
            />
            <p className="text-[9px] text-fg-subtle italic">
              {t('templates.visual.supportsVars')} <code>{'{{company.name}}'}</code>,{' '}
              <code>{'{{doc.docCode}}'}</code>, <code>{'{{generatedAt}}'}</code>
            </p>
          </div>
          <SelectField
            label={t('templates.visual.alignment')}
            value={opts.footer.alignment}
            onChange={(v) => updateFooter('alignment', v as any)}
            options={[
              { label: t('templates.visual.left'), value: 'left' },
              { label: t('templates.visual.center'), value: 'center' },
              { label: t('templates.visual.right'), value: 'right' },
            ]}
          />
          <CheckboxRow
            checked={opts.footer.showPageNumbers}
            onChange={(v) => updateFooter('showPageNumbers', v)}
            title={t('templates.visual.showPageNumbers')}
            description={t('templates.visual.showPageNumbersDesc')}
          />
          <CheckboxRow
            checked={opts.footer.showGeneratedAt}
            onChange={(v) => updateFooter('showGeneratedAt', v)}
            title={t('templates.visual.showGeneratedAt')}
          />
        </div>
      </Section>

      <Section title={t('templates.visual.customCss')} icon={<Code2 size={14} />}>
        <div className="space-y-2">
          <FieldLabel>{t('templates.visual.extraCss')}</FieldLabel>
          <Textarea
            value={opts.customCss}
            onChange={(e) => updateOpt('customCss', e.target.value)}
            placeholder={t('templates.visual.cssPlaceholder')}
            rows={8}
            className="text-[11px] font-mono resize-y"
          />
          <p className="text-[9px] text-fg-subtle italic">
            {t('templates.visual.cssHint1')} <code>&lt;style&gt;</code>
            {t('templates.visual.cssHint2')}
          </p>
        </div>
      </Section>
    </div>
  );
};
