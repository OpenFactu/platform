import { coreApi } from '@/shared/api';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Input, Select, useToast } from '@openfactu/ui';
import { Building, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
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
  const navigate = useNavigate();
  const [data, setData] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setData((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = async () => {
    if (!data.name.trim()) {
      toast.error('El nombre de la empresa es obligatorio');
      return;
    }
    setSaving(true);
    try {
      const res = await coreApi.raw('POST', '/api/tenants', data);
      if (!res.ok) {
        const err = res.data ?? { error: 'Error al crear empresa' };
        throw new Error(err.error || 'Error al crear empresa');
      }
      const created = res.data;
      await switchTenant(created.id);
      toast.success('Empresa creada y activada');
      navigate('/');
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || 'Error al crear empresa');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => navigate(-1)}
          title="Volver"
        >
          <ArrowLeft size={18} />
        </Button>
        <div className="p-2 bg-emerald-100 text-emerald-700 dark:text-emerald-200 rounded-lg">
          <Building size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Nueva Empresa</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Se creará un nuevo esquema con los datos maestros por defecto.
          </p>
        </div>
      </div>

      <Card>
        <div className="p-6 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            País e identificación
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CountrySelect
              label="País"
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
              label="Nombre de la empresa *"
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
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Domicilio
          </h2>
          <Input
            label="Dirección"
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
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Contacto
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Email"
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
                label="Web"
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
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Preferencias
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Moneda"
              options={CURRENCY_OPTIONS}
              value={data.currency}
              onChange={(v) => set('currency', v)}
            />
            <Input
              label="Inicio del año fiscal (MM-DD)"
              value={data.fiscalYearStart}
              onChange={(e) => set('fiscalYearStart', e.target.value)}
              placeholder="01-01"
            />
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => navigate(-1)} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          <CheckCircle2 size={16} className="mr-2" />
          {saving ? 'Creando...' : 'Crear empresa'}
        </Button>
      </div>
    </div>
  );
};
