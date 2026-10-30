/**
 * Comprobaciones de un interlocutor antes de darlo de alta: formato de NIF,
 * correo, teléfono, web, código postal e IBAN, y búsqueda de interlocutores
 * que ya existen con el mismo NIF, correo o nombre. Puro.
 */
import { t } from '@/i18n/i18n';
import { validatePostalCode, validateTaxId, type CountryMeta } from '@openfactu/common';

export type CountryLike = (CountryMeta & { name?: string }) | null | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const WEB_RE = /^(https?:\/\/)?[^\s/$.?#]+\.[^\s]{2,}$/i;

export const checkName = (name: string): string | null => {
  const n = name.trim();
  if (!n) return t('partners.checks.nameRequired');
  if (n.length < 2) return t('partners.checks.nameTooShort');
  if (n.length > 200) return t('partners.checks.nameTooLong');
  return null;
};

export const checkNif = (nif: string, country: CountryLike): string | null =>
  nif.trim() && !validateTaxId(nif.trim(), country ?? undefined)
    ? t('partners.checks.nifFormat', {
        label: country?.taxIdLabel || t('partners.checks.nif'),
        country: country?.name ?? t('partners.checks.thisCountry'),
      }) +
      (country?.taxIdExample
        ? ` ${t('partners.checks.example', { example: country.taxIdExample })}`
        : '')
    : null;

export const checkEmail = (email: string): string | null =>
  email.trim() && !EMAIL_RE.test(email.trim()) ? t('partners.checks.emailInvalid') : null;

export const checkPhone = (phone: string, country?: CountryLike): string | null => {
  if (!phone.trim()) return null;
  // Sin el prefijo del país (PhoneInput lo guarda como «+34 600…»).
  const prefix = (country?.phonePrefix ?? '').replace(/\D/g, '');
  let digits = phone.replace(/\D/g, '');
  if (phone.trim().startsWith('+') && prefix && digits.startsWith(prefix))
    digits = digits.slice(prefix.length);
  return digits.length < 6 || digits.length > 15 ? t('partners.checks.phoneInvalid') : null;
};

export const checkWebsite = (web: string): string | null =>
  web.trim() && !WEB_RE.test(web.trim()) ? t('partners.checks.websiteInvalid') : null;

export const checkPostalCode = (zip: string, country: CountryLike): string | null =>
  zip.trim() && !validatePostalCode(zip.trim(), country ?? undefined)
    ? t('partners.checks.zipFormat', { country: country?.name ?? t('partners.checks.thisCountry') })
    : null;

/** IBAN: longitud y dígito de control (mod 97). */
export function checkIban(iban: string): string | null {
  const s = iban.replace(/\s+/g, '').toUpperCase();
  if (!s) return null;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return t('partners.checks.ibanInvalid');
  const moved = s.slice(4) + s.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1 ? null : t('partners.checks.ibanChecksum');
}

/** NIF comparable: sin espacios ni guiones, en mayúsculas y sin el prefijo de país (ES…). */
export function normalizeNif(nif: string | null | undefined, countryCode = 'ES'): string {
  const n = (nif ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return n.startsWith(countryCode.toUpperCase()) && n.length > 9 ? n.slice(2) : n;
}

const LEGAL_FORM =
  /\b(s\.?\s?l\.?\s?u?|s\.?\s?a\.?\s?u?|s\.?\s?c\.?|s\.?\s?coop\.?|c\.?\s?b\.?|sll)\.?$/i;

/** Nombre comparable: sin acentos, puntuación ni forma jurídica («Prueba S.L.» = «prueba»). */
export function normalizeName(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(LEGAL_FORM, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface PartnerLike {
  id: string;
  name: string;
  code?: string | null;
  nif?: string | null;
  email?: string | null;
}

export type DuplicateReason = 'nif' | 'email' | 'name';
export interface Duplicate<P extends PartnerLike> {
  partner: P;
  reason: DuplicateReason;
}

/** Claves de i18n: se traducen al pintar con `t()`. */
export const DUPLICATE_REASON_LABEL: Record<DuplicateReason, string> = {
  nif: 'partners.duplicates.reason.nif',
  email: 'partners.duplicates.reason.email',
  name: 'partners.duplicates.reason.name',
};

/** Interlocutores que ya existen y casan por NIF, correo o nombre (el NIF primero). */
export function findDuplicates<P extends PartnerLike>(
  d: { name: string; nif: string; email: string; countryCode: string },
  partners: P[],
): Duplicate<P>[] {
  const nif = normalizeNif(d.nif, d.countryCode);
  const email = d.email.trim().toLowerCase();
  const name = normalizeName(d.name);
  const out: Duplicate<P>[] = [];
  const seen = new Set<string>();
  const add = (partner: P, reason: DuplicateReason) => {
    if (seen.has(partner.id)) return;
    seen.add(partner.id);
    out.push({ partner, reason });
  };
  if (nif.length >= 5)
    for (const p of partners) if (normalizeNif(p.nif, d.countryCode) === nif) add(p, 'nif');
  if (email)
    for (const p of partners) if ((p.email ?? '').trim().toLowerCase() === email) add(p, 'email');
  if (name.length >= 3)
    for (const p of partners) if (normalizeName(p.name) === name) add(p, 'name');
  return out.slice(0, 3);
}
