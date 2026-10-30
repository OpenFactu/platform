import { t } from '@/i18n/i18n';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useGeo, type GeoRow } from '@/hooks/useGeo';
import { crudApi } from '@/shared/api';
import { partnerGroupsApi, partnersApi } from '../api';
import type { Partner, PartnerAddress, PartnerGroup } from '../domain/partner';

export interface PartnerFormData {
  groupId: string;
  name: string;
  code: string;
  nif: string;
  foreignName: string;
  phone: string;
  email: string;
  website: string;
  priceListId: string;
  countryCode: string;
  defaultDocumentTypeId: string;
  defaultPaymentMethodId: string;
  defaultPaymentTermId: string;
  defaultWithholdingRate: string | number;
  iban: string;
  bankName: string;
  bankSwift: string;
}

export const EMPTY_PARTNER: PartnerFormData = {
  groupId: '',
  name: '',
  code: '',
  nif: '',
  foreignName: '',
  phone: '',
  email: '',
  website: '',
  priceListId: '',
  countryCode: 'ES',
  defaultDocumentTypeId: '',
  defaultPaymentMethodId: '',
  defaultPaymentTermId: '',
  defaultWithholdingRate: '',
  iban: '',
  bankName: '',
  bankSwift: '',
};

function toFormData(p: Partner): PartnerFormData {
  return {
    groupId: p.groupId || '',
    name: p.name || '',
    code: p.code || '',
    nif: p.nif || '',
    foreignName: p.foreignName || '',
    phone: p.phone || '',
    email: p.email || '',
    website: p.website || '',
    priceListId: p.priceListId || '',
    countryCode: p.countryCode || 'ES',
    defaultDocumentTypeId: p.defaultDocumentTypeId || '',
    defaultPaymentMethodId: p.defaultPaymentMethodId || '',
    defaultPaymentTermId: p.defaultPaymentTermId || '',
    defaultWithholdingRate: p.defaultWithholdingRate ?? '',
    iban: p.iban || '',
    bankName: p.bankName || '',
    bankSwift: p.bankSwift || '',
  };
}

/** Una opción de catálogo auxiliar (tarifa, forma/plazo de pago, tipo de documento). */
export interface LookupRow {
  id: string;
  name: string;
  code?: string | null;
}

export interface PartnerLookups {
  groups: PartnerGroup[];
  priceLists: LookupRow[];
  docTypes: LookupRow[];
  paymentMethods: LookupRow[];
  paymentTerms: LookupRow[];
}

/**
 * Catálogos que necesita la ficha. Van por el adaptador genérico para no
 * acoplar este módulo a los de tarifas, pagos y documentos.
 */
function usePartnerLookups(): PartnerLookups {
  const { user } = useAuth();
  const [lookups, setLookups] = useState<PartnerLookups>({
    groups: [],
    priceLists: [],
    docTypes: [],
    paymentMethods: [],
    paymentTerms: [],
  });

  useEffect(() => {
    if (!user?.tenantId) return;
    const list = (endpoint: string) =>
      crudApi
        .list<LookupRow>(endpoint)
        .then((d) => (Array.isArray(d) ? d : []))
        .catch(() => [] as LookupRow[]);
    Promise.all([
      partnerGroupsApi.list().catch(() => [] as PartnerGroup[]),
      list('/api/pricelists'),
      list('/api/document-types'),
      list('/api/payment-methods'),
      list('/api/payment-terms'),
    ]).then(([groups, priceLists, docTypes, paymentMethods, paymentTerms]) =>
      setLookups({ groups, priceLists, docTypes, paymentMethods, paymentTerms }),
    );
  }, [user?.tenantId]);

  return lookups;
}

/**
 * Estado y reglas de la ficha de interlocutor: datos fijos, direcciones,
 * campos de plugin y el guardado. El TSX solo compone las secciones.
 */
export function usePartnerForm() {
  const { loadSubRegionsByCountry } = useGeo();
  const lookups = usePartnerLookups();
  const [data, setData] = useState<PartnerFormData>(EMPTY_PARTNER);
  const [addresses, setAddresses] = useState<PartnerAddress[]>([]);
  // Valores de los campos que los plugins añaden a BusinessPartner. Viajan
  // aparte del formulario fijo y se mezclan con él justo al guardar.
  const [pluginValues, setPluginValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [subRegions, setSubRegions] = useState<Record<number, GeoRow[]>>({});
  const [subRegionsLoading, setSubRegionsLoading] = useState<Record<number, boolean>>({});

  const set = <K extends keyof PartnerFormData>(key: K, value: PartnerFormData[K]) =>
    setData((d) => ({ ...d, [key]: value }));

  const loadSubRegions = useCallback(
    async (idx: number, countryCode: string) => {
      if (!countryCode) return;
      setSubRegionsLoading((p) => ({ ...p, [idx]: true }));
      try {
        const rows = await loadSubRegionsByCountry(countryCode);
        setSubRegions((p) => ({ ...p, [idx]: rows }));
      } catch {
        setSubRegions((p) => ({ ...p, [idx]: [] }));
      } finally {
        setSubRegionsLoading((p) => ({ ...p, [idx]: false }));
      }
    },
    [loadSubRegionsByCountry],
  );

  /** Carga un interlocutor existente (o deja el formulario vacío para un alta). */
  const reset = useCallback(
    (partner: Partner | null) => {
      setData(partner ? toFormData(partner) : EMPTY_PARTNER);
      const addrs = partner?.addresses?.map((a) => ({ ...a })) ?? [];
      setAddresses(addrs);
      // La fila trae los campos de plugin como columnas sueltas, así que el
      // propio registro sirve de origen de valores.
      setPluginValues(partner ? { ...partner } : {});
      setSubRegions({});
      addrs.forEach((a, i) => loadSubRegions(i, a.countryCode || 'ES'));
    },
    [loadSubRegions],
  );

  const addAddress = () => {
    const idx = addresses.length;
    setAddresses((prev) => [
      ...prev,
      {
        name: '',
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: '',
        type: 'B',
        isDefault: prev.length === 0,
        countryCode: data.countryCode || 'ES',
        subRegionId: '',
        localityId: '',
      },
    ]);
    loadSubRegions(idx, data.countryCode || 'ES');
  };

  /** Solo puede haber una dirección por defecto de cada tipo. */
  const updateAddress = (idx: number, patch: Partial<PartnerAddress>) => {
    setAddresses((prev) => {
      const next = prev.map((a) => ({ ...a }));
      const current = { ...next[idx], ...patch };
      if (current.isDefault && (patch.isDefault === true || patch.type !== undefined)) {
        next.forEach((a, i) => {
          if (i !== idx && a.type === current.type) a.isDefault = false;
        });
      }
      next[idx] = current;
      return next;
    });
  };

  const removeAddress = (idx: number) => setAddresses((prev) => prev.filter((_, i) => i !== idx));

  /** Guarda y devuelve el interlocutor. Lanza si falta algo o falla el servidor. */
  const submit = async (id: string | null): Promise<Partner> => {
    if (!data.name.trim() || !data.groupId) throw new Error(t('partners.form.nameGroupRequired'));
    setSaving(true);
    try {
      // `pluginValues` va PRIMERO: arranca siendo el registro entero, así que
      // si fuese después pisaría con los valores viejos los campos que se
      // acaban de editar en el formulario.
      const payload = { ...pluginValues, ...data, addresses };
      return id ? await partnersApi.update(id, payload) : await partnersApi.create(payload);
    } finally {
      setSaving(false);
    }
  };

  return {
    data,
    set,
    addresses,
    addAddress,
    updateAddress,
    removeAddress,
    subRegions,
    subRegionsLoading,
    loadSubRegions,
    pluginValues,
    setPluginValue: (k: string, v: unknown) => setPluginValues((p) => ({ ...p, [k]: v })),
    lookups,
    saving,
    reset,
    submit,
  };
}

export type PartnerForm = ReturnType<typeof usePartnerForm>;
