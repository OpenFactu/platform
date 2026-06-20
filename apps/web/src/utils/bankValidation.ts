// ──────────────────────────────────────────────────────────────────
// Validación de IBAN (ISO 13616) y SWIFT/BIC (ISO 9362).
// Usado tanto en el formulario de Partner como en CompanySettings (sección
// Fiscal). La longitud esperada por país se verifica además del checksum.
// ──────────────────────────────────────────────────────────────────

const IBAN_LENGTHS: Record<string, number> = {
  AD: 24,
  AE: 23,
  AL: 28,
  AT: 20,
  AZ: 28,
  BA: 20,
  BE: 16,
  BG: 22,
  BH: 22,
  BR: 29,
  BY: 28,
  CH: 21,
  CR: 22,
  CY: 28,
  CZ: 24,
  DE: 22,
  DK: 18,
  DO: 28,
  EE: 20,
  EG: 29,
  ES: 24,
  FI: 18,
  FO: 18,
  FR: 27,
  GB: 22,
  GE: 22,
  GI: 23,
  GL: 18,
  GR: 27,
  GT: 28,
  HR: 21,
  HU: 28,
  IE: 22,
  IL: 23,
  IQ: 23,
  IS: 26,
  IT: 27,
  JO: 30,
  KW: 30,
  KZ: 20,
  LB: 28,
  LC: 32,
  LI: 21,
  LT: 20,
  LU: 20,
  LV: 21,
  MC: 27,
  MD: 24,
  ME: 22,
  MK: 19,
  MR: 27,
  MT: 31,
  MU: 30,
  NL: 18,
  NO: 15,
  PK: 24,
  PL: 28,
  PS: 29,
  PT: 25,
  QA: 29,
  RO: 24,
  RS: 22,
  SA: 24,
  SE: 24,
  SI: 19,
  SK: 24,
  SM: 27,
  ST: 25,
  SV: 28,
  TL: 23,
  TN: 24,
  TR: 26,
  UA: 29,
  VA: 22,
  VG: 24,
  XK: 20,
};

/** Normaliza: mayúsculas, sin espacios. */
export function normalizeIban(raw: string): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/\s+/g, '');
}

/** Retorna { ok, reason } — reason es una etiqueta cuando falla. */
export function validateIban(raw: string): { ok: boolean; reason?: string } {
  const iban = normalizeIban(raw);
  if (!iban) return { ok: false, reason: 'vacío' };
  if (!/^[A-Z0-9]+$/.test(iban)) return { ok: false, reason: 'caracteres no válidos' };

  const country = iban.slice(0, 2);
  const expected = IBAN_LENGTHS[country];
  if (!expected) return { ok: false, reason: `país ${country} desconocido` };
  if (iban.length !== expected)
    return { ok: false, reason: `${country} esperaba ${expected} chars, recibidos ${iban.length}` };

  // Rotar y sustituir letras por números. Hacemos mod 97 por bloques para
  // no manejar BigInt — aritmética estándar sobre string numérico.
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged
    .split('')
    .map((c) => (c >= 'A' && c <= 'Z' ? (c.charCodeAt(0) - 55).toString() : c))
    .join('');

  let remainder = 0;
  for (let i = 0; i < numeric.length; i++) {
    remainder = (remainder * 10 + Number(numeric.charAt(i))) % 97;
  }
  if (remainder !== 1) return { ok: false, reason: 'checksum inválido' };
  return { ok: true };
}

/** Formatea con grupos de 4: ES91 2100 0418 45 0200051332 */
export function formatIban(raw: string): string {
  const iban = normalizeIban(raw);
  return iban.match(/.{1,4}/g)?.join(' ') || '';
}

/** SWIFT/BIC: 8 u 11 caracteres, primeros 4 bancarios (letras), siguientes 2
 *  código país, siguientes 2 ubicación alfanuméricos, últimos 3 opcionales. */
export function validateSwift(raw: string): { ok: boolean; reason?: string } {
  const s = String(raw || '')
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!s) return { ok: false, reason: 'vacío' };
  if (s.length !== 8 && s.length !== 11)
    return { ok: false, reason: `${s.length} caracteres, esperados 8 u 11` };
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(s))
    return { ok: false, reason: 'formato inválido' };
  return { ok: true };
}
