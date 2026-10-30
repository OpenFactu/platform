import { useI18n } from '@/i18n/I18nContext';
import React from 'react';
import { Button, Checkbox, EmptyState, Input, SearchableSelect, Select } from '@openfactu/ui';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { useGeo } from '@/hooks/useGeo';
import { TaxIdInput } from '@/components/geo/TaxIdInput';
import { PostalCodeInput } from '@/components/geo/PostalCodeInput';
import { PhoneInput } from '@/components/geo/PhoneInput';
import { validateIban, validateSwift, formatIban } from '@/utils/bankValidation';
import type { PartnerForm, LookupRow } from '../hooks/usePartnerForm';
import { MunicipalitySearch } from './MunicipalitySearch';

const FLAGS: Record<string, string> = {
  ES: '🇪🇸',
  PT: '🇵🇹',
  FR: '🇫🇷',
  IT: '🇮🇹',
  DE: '🇩🇪',
  GB: '🇬🇧',
  US: '🇺🇸',
};

const sectionTitleCls = 'text-xs font-bold uppercase tracking-wider text-fg-muted mb-1';
const sectionDescCls = 'text-xs text-fg-subtle mb-3';

const lookupOptions = (rows: LookupRow[]) =>
  rows.map((r) => ({ label: r.code ? `${r.code} · ${r.name}` : r.name, value: r.id }));

function useCountryOptions() {
  const { countries } = useGeo();
  return countries.map((c) => ({ label: `${FLAGS[c.code] || ''} ${c.name}`, value: c.code }));
}

interface SectionProps {
  form: PartnerForm;
  disabled?: boolean;
}

/** Validación en vivo de IBAN/SWIFT bajo el campo. */
const BankCheck: React.FC<{ result: { ok: boolean; reason?: string }; okLabel: string }> = ({
  result,
  okLabel,
}) => (
  <p className={`text-xs mt-1 font-mono ${result.ok ? 'text-success-fg' : 'text-danger-fg'}`}>
    {result.ok ? `✓ ${okLabel}` : `⚠ ${result.reason}`}
  </p>
);

export const PartnerGeneralFields: React.FC<SectionProps> = ({ form, disabled }) => {
  const { t } = useI18n();
  const { data, set, lookups } = form;
  const countryOptions = useCountryOptions();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label={t('partners.fields.legalName')}
          required
          value={data.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder={t('partners.fields.legalNamePlaceholder')}
          disabled={disabled}
        />
        <Input
          label={t('partners.fields.tradeName')}
          value={data.foreignName}
          onChange={(e) => set('foreignName', e.target.value)}
          placeholder={t('partners.fields.tradeNamePlaceholder')}
          disabled={disabled}
        />
        <SearchableSelect
          label={t('partners.fields.group')}
          required
          value={data.groupId}
          onChange={(v) => set('groupId', v)}
          options={lookups.groups.map((g) => ({
            label: g.codePrefix ? `${g.name} (${g.codePrefix})` : g.name,
            value: g.id,
          }))}
          placeholder={t('partners.fields.selectGroup')}
          disabled={disabled}
        />
        <SearchableSelect
          label={t('partners.fields.country')}
          value={data.countryCode}
          onChange={(v) => set('countryCode', v)}
          options={countryOptions}
          placeholder={t('partners.fields.selectCountry')}
          disabled={disabled}
        />
        <TaxIdInput
          countryCode={data.countryCode}
          value={data.nif}
          onChange={(v) => set('nif', v)}
          disabled={disabled}
        />
        <SearchableSelect
          label={t('partners.fields.priceList')}
          value={data.priceListId}
          onChange={(v) => set('priceListId', v)}
          options={[
            { label: t('partners.fields.standardPriceList'), value: '' },
            ...lookups.priceLists.map((pl) => ({ label: pl.name, value: pl.id })),
          ]}
          helperText={t('partners.fields.priceListHint')}
          disabled={disabled}
        />
      </div>
    </div>
  );
};

export const PartnerContactFields: React.FC<SectionProps> = ({ form, disabled }) => {
  const { t } = useI18n();
  const { data, set } = form;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <PhoneInput
        countryCode={data.countryCode}
        value={data.phone}
        onChange={(v) => set('phone', v)}
        label={t('partners.fields.phone')}
        disabled={disabled}
      />
      <Input
        label={t('partners.fields.emailLong')}
        type="email"
        value={data.email}
        onChange={(e) => set('email', e.target.value)}
        placeholder={t('partners.fields.emailPlaceholder')}
        disabled={disabled}
      />
      <Input
        label={t('partners.fields.websiteLong')}
        value={data.website}
        onChange={(e) => set('website', e.target.value)}
        placeholder="https://…"
        disabled={disabled}
        className="sm:col-span-2"
      />
    </div>
  );
};

export const PartnerFiscalFields: React.FC<SectionProps> = ({ form, disabled }) => {
  const { t } = useI18n();
  const { data, set, lookups } = form;
  return (
    <div className="space-y-5">
      <div>
        <h3 className={sectionTitleCls}>{t('partners.fiscal.defaults')}</h3>
        <p className={sectionDescCls}>{t('partners.fiscal.defaultsHint')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SearchableSelect
            label={t('partners.fields.documentType')}
            value={data.defaultDocumentTypeId}
            onChange={(v) => set('defaultDocumentTypeId', v)}
            options={lookupOptions(lookups.docTypes)}
            placeholder="—"
            clearable
            disabled={disabled}
          />
          <SearchableSelect
            label={t('partners.fields.paymentMethodLong')}
            value={data.defaultPaymentMethodId}
            onChange={(v) => set('defaultPaymentMethodId', v)}
            options={lookupOptions(lookups.paymentMethods)}
            placeholder="—"
            clearable
            disabled={disabled}
          />
          <SearchableSelect
            label={t('partners.fields.paymentTerm')}
            value={data.defaultPaymentTermId}
            onChange={(v) => set('defaultPaymentTermId', v)}
            options={lookupOptions(lookups.paymentTerms)}
            placeholder="—"
            clearable
            disabled={disabled}
          />
          <Input
            label={t('partners.fields.withholding')}
            type="number"
            step="0.01"
            value={String(data.defaultWithholdingRate ?? '')}
            onChange={(e) => set('defaultWithholdingRate', e.target.value)}
            placeholder="0.00"
            disabled={disabled}
          />
        </div>
      </div>
      <div className="pt-4 border-t border-border-default">
        <h3 className={sectionTitleCls}>{t('partners.fiscal.bankAccount')}</h3>
        <p className={sectionDescCls}>{t('partners.fiscal.bankAccountHint')}</p>
        <div className="space-y-3">
          <div>
            <Input
              label="IBAN"
              value={data.iban}
              onChange={(e) => set('iban', e.target.value)}
              onBlur={(e) => set('iban', formatIban(e.target.value))}
              placeholder="ES91 2100 0418 45 0200051332"
              disabled={disabled}
            />
            {data.iban.trim() && (
              <BankCheck
                result={validateIban(data.iban)}
                okLabel={t('partners.fiscal.ibanValid')}
              />
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={t('partners.fields.bank')}
              value={data.bankName}
              onChange={(e) => set('bankName', e.target.value)}
              disabled={disabled}
            />
            <div>
              <Input
                label="SWIFT / BIC"
                value={data.bankSwift}
                onChange={(e) => set('bankSwift', e.target.value.toUpperCase())}
                placeholder="CAIXESBBXXX"
                disabled={disabled}
              />
              {data.bankSwift.trim() && (
                <BankCheck
                  result={validateSwift(data.bankSwift)}
                  okLabel={t('partners.fiscal.swiftValid')}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/** `label` es una clave de i18n. */
const ADDRESS_TYPE_OPTIONS = [
  { label: 'partners.addresses.billing', value: 'B' },
  { label: 'partners.addresses.shipping', value: 'S' },
];

export const PartnerAddressesFields: React.FC<SectionProps> = ({ form, disabled }) => {
  const { t } = useI18n();
  const { searchLocalities } = useGeo();
  const countryOptions = useCountryOptions();
  const { addresses, addAddress, updateAddress, removeAddress, subRegions, subRegionsLoading } =
    form;

  if (addresses.length === 0) {
    return (
      <EmptyState
        icon={<MapPin size={18} />}
        title={t('partners.addresses.empty')}
        hint={t('partners.addresses.emptyHint')}
        action={
          !disabled && (
            <Button type="button" variant="secondary" size="sm" onClick={addAddress}>
              <Plus size={14} /> {t('partners.addresses.new')}
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {addresses.map((addr, idx) => {
        const regions = subRegions[idx] || [];
        const regionsLoading = subRegionsLoading[idx] || false;
        return (
          <div
            key={addr.id ?? `new-${idx}`}
            className="border border-border-default rounded-xs p-4 bg-bg-muted space-y-3"
          >
            {/* Cabecera con la papelera a la derecha: en móvil, dentro de la rejilla,
                caía en una fila propia en medio de los campos. */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-fg-default">
                {addr.name?.trim() || t('partners.addresses.addressN', { n: idx + 1 })}
              </span>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAddress(idx)}
                  aria-label={t('partners.addresses.remove')}
                  title={t('partners.addresses.remove')}
                >
                  <Trash2 size={15} />
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_12rem_auto] gap-3 items-end">
              <Input
                label={t('partners.fields.name')}
                required
                value={addr.name}
                onChange={(e) => updateAddress(idx, { name: e.target.value })}
                placeholder={t('partners.addresses.namePlaceholder')}
                disabled={disabled}
              />
              <Select
                label={t('partners.fields.type')}
                value={addr.type}
                onChange={(v) => updateAddress(idx, { type: v })}
                options={ADDRESS_TYPE_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                disabled={disabled}
              />
              <div className="pb-2">
                <Checkbox
                  checked={addr.isDefault}
                  onChange={(v) => updateAddress(idx, { isDefault: v })}
                  label={t('partners.addresses.default')}
                  disabled={disabled}
                />
              </div>
            </div>
            <Input
              label={t('partners.addresses.street')}
              value={addr.street}
              onChange={(e) => updateAddress(idx, { street: e.target.value })}
              placeholder={t('partners.addresses.streetPlaceholder')}
              disabled={disabled}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <SearchableSelect
                label={t('partners.fields.country')}
                value={addr.countryCode || 'ES'}
                onChange={(code) => {
                  updateAddress(idx, {
                    countryCode: code,
                    subRegionId: '',
                    localityId: '',
                    city: '',
                  });
                  form.loadSubRegions(idx, code);
                }}
                options={countryOptions}
                placeholder={t('partners.fields.selectCountry')}
                disabled={disabled}
              />
              <SearchableSelect
                label={t('partners.addresses.province')}
                value={String(addr.subRegionId || '')}
                onChange={(id) => updateAddress(idx, { subRegionId: id, localityId: '', city: '' })}
                options={regions.map((r) => ({ label: r.name, value: r.id }))}
                placeholder={
                  regionsLoading
                    ? t('partners.common.loading')
                    : t('partners.addresses.selectProvince')
                }
                disabled={disabled || regionsLoading || regions.length === 0}
              />
              <MunicipalitySearch
                subRegionId={String(addr.subRegionId || '')}
                value={String(addr.localityId || '')}
                valueName={addr.city}
                onChange={(loc) =>
                  updateAddress(idx, { localityId: loc?.id || '', city: loc?.name || '' })
                }
                label={t('partners.addresses.municipality')}
                disabled={disabled || !addr.subRegionId}
                onSearch={searchLocalities}
              />
              <PostalCodeInput
                countryCode={addr.countryCode || 'ES'}
                value={addr.zipCode}
                onChange={(v) => updateAddress(idx, { zipCode: v })}
                label={t('partners.addresses.zip')}
                disabled={disabled}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
