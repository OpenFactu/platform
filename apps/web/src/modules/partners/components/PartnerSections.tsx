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
  const { data, set, lookups } = form;
  const countryOptions = useCountryOptions();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Razón social"
          required
          value={data.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Nombre legal"
          disabled={disabled}
        />
        <Input
          label="Nombre comercial"
          value={data.foreignName}
          onChange={(e) => set('foreignName', e.target.value)}
          placeholder="Nombre alternativo o alias"
          disabled={disabled}
        />
        <SearchableSelect
          label="Grupo"
          required
          value={data.groupId}
          onChange={(v) => set('groupId', v)}
          options={lookups.groups.map((g) => ({
            label: g.codePrefix ? `${g.name} (${g.codePrefix})` : g.name,
            value: g.id,
          }))}
          placeholder="Seleccionar grupo…"
          disabled={disabled}
        />
        <SearchableSelect
          label="País"
          value={data.countryCode}
          onChange={(v) => set('countryCode', v)}
          options={countryOptions}
          placeholder="Seleccionar país…"
          disabled={disabled}
        />
        <TaxIdInput
          countryCode={data.countryCode}
          value={data.nif}
          onChange={(v) => set('nif', v)}
          disabled={disabled}
        />
        <SearchableSelect
          label="Tarifa"
          value={data.priceListId}
          onChange={(v) => set('priceListId', v)}
          options={[
            { label: 'Tarifa estándar (sin descuento)', value: '' },
            ...lookups.priceLists.map((pl) => ({ label: pl.name, value: pl.id })),
          ]}
          helperText="Precios por defecto en pedidos y facturas."
          disabled={disabled}
        />
      </div>
    </div>
  );
};

export const PartnerContactFields: React.FC<SectionProps> = ({ form, disabled }) => {
  const { data, set } = form;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <PhoneInput
        countryCode={data.countryCode}
        value={data.phone}
        onChange={(v) => set('phone', v)}
        label="Teléfono"
        disabled={disabled}
      />
      <Input
        label="Correo electrónico"
        type="email"
        value={data.email}
        onChange={(e) => set('email', e.target.value)}
        placeholder="admin@empresa.com"
        disabled={disabled}
      />
      <Input
        label="Sitio web"
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
  const { data, set, lookups } = form;
  return (
    <div className="space-y-5">
      <div>
        <h3 className={sectionTitleCls}>Valores por defecto al facturar</h3>
        <p className={sectionDescCls}>
          Se sugieren al crear una factura; se pueden cambiar en cada una.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SearchableSelect
            label="Tipo de documento"
            value={data.defaultDocumentTypeId}
            onChange={(v) => set('defaultDocumentTypeId', v)}
            options={lookupOptions(lookups.docTypes)}
            placeholder="—"
            clearable
            disabled={disabled}
          />
          <SearchableSelect
            label="Método de pago"
            value={data.defaultPaymentMethodId}
            onChange={(v) => set('defaultPaymentMethodId', v)}
            options={lookupOptions(lookups.paymentMethods)}
            placeholder="—"
            clearable
            disabled={disabled}
          />
          <SearchableSelect
            label="Plazo de pago"
            value={data.defaultPaymentTermId}
            onChange={(v) => set('defaultPaymentTermId', v)}
            options={lookupOptions(lookups.paymentTerms)}
            placeholder="—"
            clearable
            disabled={disabled}
          />
          <Input
            label="Retención %"
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
        <h3 className={sectionTitleCls}>Cuenta bancaria principal</h3>
        <p className={sectionDescCls}>IBAN para cobros y pagos.</p>
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
              <BankCheck result={validateIban(data.iban)} okLabel="IBAN válido" />
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Banco"
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
                <BankCheck result={validateSwift(data.bankSwift)} okLabel="SWIFT válido" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ADDRESS_TYPE_OPTIONS = [
  { label: 'Facturación', value: 'B' },
  { label: 'Envío', value: 'S' },
];

export const PartnerAddressesFields: React.FC<SectionProps> = ({ form, disabled }) => {
  const { searchLocalities } = useGeo();
  const countryOptions = useCountryOptions();
  const { addresses, addAddress, updateAddress, removeAddress, subRegions, subRegionsLoading } =
    form;

  if (addresses.length === 0) {
    return (
      <EmptyState
        icon={<MapPin size={18} />}
        title="Sin direcciones"
        hint="Añade una dirección de facturación o de envío."
        action={
          !disabled && (
            <Button type="button" variant="secondary" size="sm" onClick={addAddress}>
              <Plus size={14} /> Nueva dirección
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
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_12rem_auto_auto] gap-3 items-end">
              <Input
                label="Nombre"
                required
                value={addr.name}
                onChange={(e) => updateAddress(idx, { name: e.target.value })}
                placeholder="Ej.: Sede central"
                disabled={disabled}
              />
              <Select
                label="Tipo"
                value={addr.type}
                onChange={(v) => updateAddress(idx, { type: v })}
                options={ADDRESS_TYPE_OPTIONS}
                disabled={disabled}
              />
              <div className="pb-2">
                <Checkbox
                  checked={addr.isDefault}
                  onChange={(v) => updateAddress(idx, { isDefault: v })}
                  label="Por defecto"
                  disabled={disabled}
                />
              </div>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAddress(idx)}
                  aria-label="Quitar dirección"
                  title="Quitar dirección"
                >
                  <Trash2 size={15} />
                </Button>
              )}
            </div>
            <Input
              label="Calle"
              value={addr.street}
              onChange={(e) => updateAddress(idx, { street: e.target.value })}
              placeholder="C/ Mayor 1…"
              disabled={disabled}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <SearchableSelect
                label="País"
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
                placeholder="Seleccionar país…"
                disabled={disabled}
              />
              <SearchableSelect
                label="Provincia"
                value={String(addr.subRegionId || '')}
                onChange={(id) => updateAddress(idx, { subRegionId: id, localityId: '', city: '' })}
                options={regions.map((r) => ({ label: r.name, value: r.id }))}
                placeholder={regionsLoading ? 'Cargando…' : 'Seleccionar provincia…'}
                disabled={disabled || regionsLoading || regions.length === 0}
              />
              <MunicipalitySearch
                subRegionId={String(addr.subRegionId || '')}
                value={String(addr.localityId || '')}
                valueName={addr.city}
                onChange={(loc) =>
                  updateAddress(idx, { localityId: loc?.id || '', city: loc?.name || '' })
                }
                label="Municipio"
                disabled={disabled || !addr.subRegionId}
                onSearch={searchLocalities}
              />
              <PostalCodeInput
                countryCode={addr.countryCode || 'ES'}
                value={addr.zipCode}
                onChange={(v) => updateAddress(idx, { zipCode: v })}
                label="C.P."
                disabled={disabled}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
