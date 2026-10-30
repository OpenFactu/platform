import { t } from '@/i18n/i18n';
import { useEffect, useMemo, useState } from 'react';
import { useGeo } from '@/hooks/useGeo';
import { partnersApi } from '../api';
import type { Partner } from '../domain/partner';
import {
  checkEmail,
  checkIban,
  checkName,
  checkNif,
  checkPhone,
  checkPostalCode,
  checkWebsite,
  findDuplicates,
} from '../domain/partnerChecks';
import type { PartnerForm } from './usePartnerForm';

/** Pasos del alta de un interlocutor. `label` y `hint` son claves de i18n. */
export const PARTNER_WIZARD_STEPS = [
  {
    id: 'general',
    label: 'partners.wizard.steps.general',
    hint: 'partners.wizard.steps.generalHint',
  },
  {
    id: 'contact',
    label: 'partners.wizard.steps.contact',
    hint: 'partners.wizard.steps.contactHint',
  },
  {
    id: 'addresses',
    label: 'partners.wizard.steps.addresses',
    hint: 'partners.wizard.steps.addressesHint',
  },
  {
    id: 'fiscal',
    label: 'partners.wizard.steps.fiscal',
    hint: 'partners.wizard.steps.fiscalHint',
  },
  {
    id: 'review',
    label: 'partners.wizard.steps.review',
    hint: 'partners.wizard.steps.reviewHint',
  },
] as const;

/**
 * Asistente de alta de un interlocutor sobre el estado de `usePartnerForm`:
 * paso actual, validación de cada paso antes de seguir y búsqueda de
 * interlocutores que ya existen con el mismo NIF, correo o nombre.
 */
export function usePartnerWizard(form: PartnerForm) {
  const { getCountry } = useGeo();
  const [step, setStep] = useState(0);
  // Errores del paso que se intentó dejar atrás; se recalculan al corregir.
  const [attempted, setAttempted] = useState<number | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);

  useEffect(() => {
    partnersApi
      .list()
      .then(setPartners)
      .catch(() => setPartners([]));
  }, []);

  const { data, addresses } = form;
  const country = getCountry(data.countryCode);

  /** Problemas de un paso, en frases. */
  const problemsOf = (index: number): string[] => {
    const out: (string | null)[] = [];
    switch (PARTNER_WIZARD_STEPS[index].id) {
      case 'general':
        out.push(
          checkName(data.name),
          data.groupId ? null : t('partners.wizard.groupRequired'),
          checkNif(data.nif, country),
        );
        break;
      case 'contact':
        out.push(
          checkPhone(data.phone, country),
          checkEmail(data.email),
          checkWebsite(data.website),
        );
        break;
      case 'addresses':
        addresses.forEach((a, i) => {
          const n = addresses.length > 1 ? ` ${t('partners.wizard.addressN', { n: i + 1 })}` : '';
          if (!String(a.name ?? '').trim()) out.push(t('partners.wizard.nameMissing') + n);
          if (!String(a.street ?? '').trim()) out.push(t('partners.wizard.streetMissing') + n);
          const z = checkPostalCode(String(a.zipCode ?? ''), getCountry(a.countryCode || 'ES'));
          if (z) out.push(z + n);
        });
        break;
      case 'fiscal': {
        out.push(checkIban(data.iban));
        const w = Number(data.defaultWithholdingRate);
        if (data.defaultWithholdingRate !== '' && (Number.isNaN(w) || w < 0 || w > 100))
          out.push(t('partners.wizard.withholdingRange'));
        break;
      }
    }
    return out.filter((x): x is string => !!x);
  };

  const duplicates = useMemo(
    () =>
      findDuplicates(
        { name: data.name, nif: data.nif, email: data.email, countryCode: data.countryCode },
        partners,
      ),
    [data.name, data.nif, data.email, data.countryCode, partners],
  );
  const nifDuplicate = duplicates.find((d) => d.reason === 'nif');

  const problems = attempted === step ? problemsOf(step) : [];
  if (attempted === step && step === 0 && nifDuplicate)
    problems.push(t('partners.wizard.nifExists', { name: nifDuplicate.partner.name }));

  const isLast = step === PARTNER_WIZARD_STEPS.length - 1;

  /** Pasa al siguiente si el paso actual está bien. */
  const next = (): boolean => {
    const blocking = problemsOf(step).length > 0 || (step === 0 && !!nifDuplicate);
    if (blocking) {
      setAttempted(step);
      return false;
    }
    setAttempted(null);
    setStep((n) => Math.min(n + 1, PARTNER_WIZARD_STEPS.length - 1));
    return true;
  };
  const back = () => {
    setAttempted(null);
    setStep((n) => Math.max(n - 1, 0));
  };
  /** Solo hacia atrás: los pasos de delante se alcanzan validando. */
  const goTo = (index: number) => {
    if (index < step) {
      setAttempted(null);
      setStep(index);
    }
  };

  /** Antes de crear: el primer paso con problemas (o -1). Lo deja a la vista. */
  const firstInvalid = (): number => {
    for (let i = 0; i < PARTNER_WIZARD_STEPS.length; i++) {
      if (problemsOf(i).length || (i === 0 && nifDuplicate)) {
        setStep(i);
        setAttempted(i);
        return i;
      }
    }
    return -1;
  };

  return { step, isLast, next, back, goTo, problems, duplicates, firstInvalid, country };
}

export type PartnerWizard = ReturnType<typeof usePartnerWizard>;
