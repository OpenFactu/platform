/**
 * Conversión de una celda al tipo que espera el campo.
 *
 * El fichero que llega de otro ERP no viene limpio: números con separador de
 * miles español ("1.234,56"), fechas en dd/mm/aaaa o como número de serie de
 * Excel, booleanos escritos "Sí"/"X"/"1". Convertirlo aquí y no en el handler
 * es lo que permite que el resto del importador trate todo como si viniera de
 * un formulario.
 *
 * Devuelve `{ value }` o `{ error }` con un mensaje en el idioma del usuario:
 * ese texto acaba en la columna de motivo del CSV de errores, así que tiene
 * que decirle a alguien de administración qué corregir.
 */

import type { ImportFieldDef } from './ImportRegistry';

export interface CoerceResult {
  value: any;
  error?: string;
}

const TRUE_WORDS = new Set(['true', '1', 'si', 'sí', 'yes', 'y', 's', 'x', 'verdadero', 'v']);
const FALSE_WORDS = new Set(['false', '0', 'no', 'n', 'falso', 'f', '']);

/** Epoch del número de serie de Excel (1899-12-30 por el bug del año bisiesto). */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function isBlank(raw: any): boolean {
  return raw === null || raw === undefined || String(raw).trim() === '';
}

/**
 * "1.234,56" → 1234.56, "1,234.56" → 1234.56, "1234,56" → 1234.56.
 *
 * La regla: manda el separador que aparece MÁS A LA DERECHA, porque es el
 * decimal. Si solo hay uno y separa grupos de tres dígitos exactos, se trata
 * como millares ("1.234" son mil doscientos treinta y cuatro, no 1,234).
 */
function parseNumber(text: string): number | null {
  let s = text.trim().replace(/[\s €$%]/g, '');
  if (!s) return null;

  const negative = /^\(.*\)$/.test(s);
  if (negative) s = s.slice(1, -1);

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    s = s.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (lastComma >= 0) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot >= 0) {
    const decimals = s.length - lastDot - 1;
    const groupsOfThree = decimals === 3 && /^\d{1,3}(\.\d{3})+$/.test(s);
    if (groupsOfThree) s = s.split('.').join('');
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Devuelve 'yyyy-mm-dd', que es lo que aceptan los endpoints. */
function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDate(raw: any): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    // `cellDates: true` devuelve la fecha ya construida en hora local; se
    // normaliza a UTC para que no se desplace un día al serializar.
    return toIsoDate(new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate())));
  }

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return toIsoDate(new Date(EXCEL_EPOCH + Math.round(raw) * 86400000));
  }

  const text = String(raw).trim();

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return toIsoDate(new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3])));
  }

  // dd/mm/aaaa y dd-mm-aaaa, con año de 2 o 4 cifras.
  const dmy = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    let year = +dmy[3];
    if (year < 100) year += year < 70 ? 2000 : 1900;
    const month = +dmy[2];
    const day = +dmy[1];
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return toIsoDate(new Date(Date.UTC(year, month - 1, day)));
  }

  return null;
}

export function coerceValue(field: ImportFieldDef, raw: any): CoerceResult {
  if (isBlank(raw)) return { value: null };

  switch (field.type) {
    case 'number': {
      const n = typeof raw === 'number' ? raw : parseNumber(String(raw));
      if (n === null) return { value: null, error: `"${raw}" no es un número` };
      return { value: n };
    }

    case 'boolean': {
      const t = String(raw).trim().toLowerCase();
      if (TRUE_WORDS.has(t)) return { value: true };
      if (FALSE_WORDS.has(t)) return { value: false };
      return { value: null, error: `"${raw}" no es un sí/no reconocible` };
    }

    case 'date': {
      const d = parseDate(raw);
      if (!d)
        return { value: null, error: `"${raw}" no es una fecha (usa dd/mm/aaaa o aaaa-mm-dd)` };
      return { value: d };
    }

    case 'enum': {
      const t = String(raw).trim();
      const match = (field.enumValues || []).find((v) => v.toLowerCase() === t.toLowerCase());
      if (!match) {
        return {
          value: null,
          error: `"${raw}" no es un valor válido. Admitidos: ${(field.enumValues || []).join(', ')}`,
        };
      }
      return { value: match };
    }

    case 'ref':
    case 'string':
    default:
      return { value: String(raw).trim() };
  }
}
