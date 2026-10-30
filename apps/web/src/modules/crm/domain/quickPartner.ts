/**
 * Alta rápida de cliente desde el CRM: validación de sus campos. Las
 * comprobaciones y la búsqueda de duplicados son las del alta normal
 * (partners/domain/partnerChecks).
 */
import { t } from '@/i18n/i18n';
import {
  checkEmail,
  checkName,
  checkNif,
  checkPhone,
  type CountryLike,
} from '@/modules/partners/domain/partnerChecks';

export { findDuplicates, DUPLICATE_REASON_LABEL } from '@/modules/partners/domain/partnerChecks';

export interface QuickPartnerDraft {
  name: string;
  nif: string;
  email: string;
  phone: string;
  countryCode: string;
  groupId: string;
}

export type QuickPartnerField = 'name' | 'nif' | 'email' | 'phone' | 'groupId';
export type QuickPartnerErrors = Partial<Record<QuickPartnerField, string>>;

export function validateQuickPartner(
  d: QuickPartnerDraft,
  country: CountryLike,
): QuickPartnerErrors {
  const e: QuickPartnerErrors = {};
  const checks: Array<[QuickPartnerField, string | null]> = [
    ['name', checkName(d.name)],
    ['nif', checkNif(d.nif, country)],
    ['email', checkEmail(d.email)],
    // Aquí el teléfono se escribe sin prefijo (va aparte en el campo).
    ['phone', checkPhone(d.phone)],
    ['groupId', d.groupId ? null : t('crm.quickPartner.noGroup')],
  ];
  for (const [k, msg] of checks) if (msg) e[k] = msg;
  return e;
}
