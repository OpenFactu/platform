/**
 * Alta rápida de cliente: validación de los campos y búsqueda de clientes
 * que ya existen con el mismo NIF, correo o nombre. Puro.
 */
import { validateTaxId, type CountryMeta } from '@openfactu/common';

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateQuickPartner(
  d: QuickPartnerDraft,
  country: (CountryMeta & { name?: string }) | null | undefined,
): QuickPartnerErrors {
  const e: QuickPartnerErrors = {};
  const name = d.name.trim();
  if (!name) e.name = 'Escribe el nombre o la razón social';
  else if (name.length < 2) e.name = 'Demasiado corto';
  else if (name.length > 200) e.name = 'Como mucho 200 caracteres';

  const nif = d.nif.trim();
  if (nif && !validateTaxId(nif, country ?? undefined))
    e.nif = `No tiene el formato de ${country?.name ?? 'este país'}${
      country?.taxIdExample ? ` (ej.: ${country.taxIdExample})` : ''
    }`;

  const email = d.email.trim();
  if (email && !EMAIL_RE.test(email)) e.email = 'Correo no válido';

  const digits = d.phone.replace(/\D/g, '');
  if (d.phone.trim() && (digits.length < 6 || digits.length > 15)) e.phone = 'Teléfono no válido';

  if (!d.groupId)
    e.groupId =
      'No hay grupos de clientes con prefijo de código: créalo en Interlocutores → Grupos';
  return e;
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

/** Clientes que ya existen y casan por NIF, correo o nombre (el NIF primero). */
export function findDuplicates<P extends PartnerLike>(
  d: QuickPartnerDraft,
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
