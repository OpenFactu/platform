import { coreApi } from '@/shared/api';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Input, PageHeader, Select, useToast } from '@openfactu/ui';
import { Building, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { CountrySelect } from '@/components/geo/CountrySelect';
import { RegionSelect } from '@/components/geo/RegionSelect';
import { SubRegionSelect } from '@/components/geo/SubRegionSelect';
import { LocalitySelect } from '@/components/geo/LocalitySelect';
import { TaxIdInput } from '@/components/geo/TaxIdInput';
import { PostalCodeInput } from '@/components/geo/PostalCodeInput';
import { PhoneInput } from '@/components/geo/PhoneInput';

interface FormState {
  name: string;
  nif: string;
  address: string;
  city: string;
  zipCode: string;
  country: string;
  regionId: string;
  subRegionId: string;
  localityId: string;
  email: string;
  phone: string;
  website: string;
  currency: string;
  fiscalYearStart: string;
}

/** Monedas soportadas al dar de alta la empresa (se puede cambiar después). */
const CURRENCY_OPTIONS = [
  { value: 'EUR', label: '€ EUR' },
  { value: 'USD', label: '$ USD' },
  { value: 'GBP', label: '£ GBP' },
];

const EMPTY: FormState = {
  name: '',
  nif: '',
  address: '',
  city: '',
  zipCode: '',
  country: 'ES',
  regionId: '',
  subRegionId: '',
  localityId: '',
  email: '',
  phone: '',
  website: '',
  currency: 'EUR',
  fiscalYearStart: '01-01',
};

export const NewCompany: React.FC = () => {
  const { token, switchTenant } = useAuth();
  const toast = useToast();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [data, setData] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setData((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = async () => {
    if (!data.name.trim()) {
      toast.error(t('settings.newCompany.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      const res = await coreApi.raw('POST', '/api/tenants', data);
      if (!res.ok) {
        const err = res.data ?? { error: t('settings.newCompany.createError') };
        throw new Error(err.error || t('settings.newCompany.createError'));
      }
      const created = res.data;
      await switchTenant(created.id);
      toast.success(t('settings.newCompany.created'));
      navigate('/');
    } catch (e) {
      toast.error(
        (e instanceof Error ? e.message : undefined) || t('settings.newCompany.createError'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title={t('settings.newCompany.title')}
        subtitle={t('settings.newCompany.subtitle')}
        icon={<Building size={18} />}
        size="md"
        breadcrumbs={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => navigate(-1)}
            title={t('settings.newCompany.back')}
            className="w-fit"
          >
            <ArrowLeft size={18} />
          </Button>
        }
      />

      <Card>
        <div className="p-6 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-fg-muted">
            {t('settings.newCompany.sectionIdentification')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CountrySelect
              label={t('settings.newCompany.country')}
              value={data.country}
              onChange={(code) =>
                setData((prev) => ({
                  ...prev,
                  country: code,
                  regionId: '',
                  subRegionId: '',
                  localityId: '',
                  city: '',
                }))
              }
            />
            <Input
              label={t('settings.newCompany.name')}
              value={data.name}
              onChange={(e) => set('name', e.target.value)}
            />
            <div className="md:col-span-2">
              <TaxIdInput
                countryCode={data.country}
                value={data.nif}
                onChange={(v) => set('nif', v)}
              />
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-fg-muted">
            {t('settings.newCompany.sectionAddress')}
          </h2>
          <Input
            label={t('settings.newCompany.address')}
            value={data.address}
            onChange={(e) => set('address', e.target.value)}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RegionSelect
              countryCode={data.country}
              value={data.regionId}
              onChange={(id) =>
                setData((prev) => ({
                  ...prev,
                  regionId: id,
                  subRegionId: '',
                  localityId: '',
                  city: '',
                }))
              }
            />
            <SubRegionSelect
              countryCode={data.country}
              regionId={data.regionId || null}
              value={data.subRegionId}
              onChange={(id) =>
                setData((prev) => ({ ...prev, subRegionId: id, localityId: '', city: '' }))
              }
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <LocalitySelect
              subRegionId={data.subRegionId}
              value={data.localityId}
              valueName={data.city}
              onChange={(loc) =>
                setData((prev) => ({ ...prev, localityId: loc?.id || '', city: loc?.name || '' }))
              }
            />
            <PostalCodeInput
              countryCode={data.country}
              value={data.zipCode}
              onChange={(v) => set('zipCode', v)}
            />
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-fg-muted">
            {t('settings.newCompany.sectionContact')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label={t('settings.newCompany.email')}
              type="email"
              value={data.email}
              onChange={(e) => set('email', e.target.value)}
            />
            <PhoneInput
              countryCode={data.country}
              value={data.phone}
              onChange={(v) => set('phone', v)}
            />
            <div className="md:col-span-2">
              <Input
                label={t('settings.newCompany.website')}
                value={data.website}
                onChange={(e) => set('website', e.target.value)}
                placeholder="https://miempresa.com"
              />
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-fg-muted">
            {t('settings.newCompany.sectionPreferences')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label={t('settings.newCompany.currency')}
              options={CURRENCY_OPTIONS}
              value={data.currency}
              onChange={(v) => set('currency', v)}
            />
            <Input
              label={t('settings.newCompany.fiscalYearStart')}
              value={data.fiscalYearStart}
              onChange={(e) => set('fiscalYearStart', e.target.value)}
              placeholder="01-01"
            />
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => navigate(-1)} disabled={saving}>
          {t('settings.newCompany.cancel')}
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          <CheckCircle2 size={16} className="mr-2" />
          {saving ? t('settings.newCompany.creating') : t('settings.newCompany.create')}
        </Button>
      </div>
    </div>
  );
};
