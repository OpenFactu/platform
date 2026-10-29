import { useEffect, useMemo, useState } from 'react';
import { normalizePhone } from '@openfactu/common';
import { useGeo } from '@/hooks/useGeo';
import { partnerGroupsApi, partnersApi } from '@/modules/partners/api';
import type { Partner, PartnerGroup } from '@/modules/partners/domain/partner';
import {
  findDuplicates,
  validateQuickPartner,
  type QuickPartnerDraft,
  type QuickPartnerField,
} from '../domain/quickPartner';

export interface QuickPartnerInitial {
  name: string;
  email?: string | null;
  phone?: string | null;
}

const EMPTY: QuickPartnerDraft = {
  name: '',
  nif: '',
  email: '',
  phone: '',
  countryCode: 'ES',
  groupId: '',
};

/**
 * Estado del alta rápida de cliente: borrador, validación por campo (al salir
 * de él o al intentar crear), clientes parecidos que ya existen y el alta.
 */
export function useQuickPartnerForm(initial: QuickPartnerInitial | null) {
  const { getCountry } = useGeo();
  const [draft, setDraft] = useState<QuickPartnerDraft>(EMPTY);
  const [touched, setTouched] = useState<Set<QuickPartnerField>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [groups, setGroups] = useState<PartnerGroup[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Al abrir con otros datos, se empieza de cero con ellos.
  const [seen, setSeen] = useState<QuickPartnerInitial | null>(null);
  if (initial !== seen) {
    setSeen(initial);
    if (initial) {
      setDraft({
        ...EMPTY,
        name: initial.name,
        email: initial.email ?? '',
        phone: initial.phone ?? '',
      });
      setTouched(new Set());
      setSubmitted(false);
      setServerError(null);
    }
  }

  const open = initial !== null;
  useEffect(() => {
    if (!open) return;
    partnerGroupsApi
      .list()
      .then(setGroups)
      .catch(() => setGroups([]));
    partnersApi
      .list()
      .then(setPartners)
      .catch(() => setPartners([]));
  }, [open]);

  const groupOptions = useMemo(
    () =>
      groups
        .filter((g) => g.isCustomer && g.codePrefix)
        .map((g) => ({ value: g.id, label: g.name })),
    [groups],
  );
  const effective = { ...draft, groupId: draft.groupId || groupOptions[0]?.value || '' };
  const country = getCountry(draft.countryCode);
  const allErrors = validateQuickPartner(effective, country);
  const duplicates = useMemo(() => findDuplicates(draft, partners), [draft, partners]);
  const nifDuplicate = duplicates.find((d) => d.reason === 'nif');
  if (nifDuplicate && !allErrors.nif)
    allErrors.nif = `Ya existe «${nifDuplicate.partner.name}» con este NIF`;

  // Solo se enseñan los errores de los campos ya visitados (o todos tras intentar crear).
  const errors = Object.fromEntries(
    Object.entries(allErrors).filter(
      ([k]) => submitted || touched.has(k as QuickPartnerField) || k === 'groupId',
    ),
  ) as typeof allErrors;
  // Mientras no se haya cargado la lista de grupos, no se avisa de que falta.
  if (!groups.length) delete errors.groupId;

  const set = (patch: Partial<QuickPartnerDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setServerError(null);
  };
  const blur = (field: QuickPartnerField) => setTouched((t) => new Set(t).add(field));

  /** Crea el cliente; devuelve el creado, o null si hay errores. */
  const create = async (): Promise<Partner | null> => {
    setSubmitted(true);
    if (Object.keys(allErrors).length) return null;
    setSaving(true);
    try {
      return await partnersApi.create({
        name: effective.name.trim(),
        nif: effective.nif.trim().toUpperCase() || null,
        email: effective.email.trim().toLowerCase() || null,
        phone: effective.phone.trim()
          ? normalizePhone(effective.phone, country ?? undefined)
          : null,
        groupId: effective.groupId,
        countryCode: effective.countryCode,
      });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'No se pudo crear el cliente');
      return null;
    } finally {
      setSaving(false);
    }
  };

  return {
    draft: effective,
    set,
    blur,
    errors,
    country,
    groupOptions,
    duplicates,
    saving,
    serverError,
    create,
  };
}
