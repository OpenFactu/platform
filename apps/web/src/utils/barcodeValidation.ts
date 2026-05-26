/**
 * Validación heurística de códigos de barras.
 *
 * Detecta el formato más probable a partir de la longitud y los caracteres y
 * verifica el dígito de control en formatos numéricos (EAN-13, EAN-8, UPC-A).
 * Para Code128 (alfanumérico) acepta cualquier cadena no vacía sin comprobar
 * checksum porque éste se calcula en el momento de imprimir.
 *
 * Devuelve un objeto con:
 *  - `valid`: true si el código respeta el formato detectado.
 *  - `format`: nombre legible del formato ('EAN-13', 'EAN-8', 'UPC-A',
 *    'Code128', 'desconocido').
 *  - `reason`: mensaje en español explicando el motivo de invalidez.
 */

export type BarcodeFormat = 'EAN-13' | 'EAN-8' | 'UPC-A' | 'Code128' | 'desconocido';

export interface BarcodeValidationResult {
  valid: boolean;
  format: BarcodeFormat;
  reason?: string;
  /**
   * Si el código es inválido pero detectamos que sólo le falta o está mal el
   * dígito de control, devolvemos aquí el código completo con el dígito
   * correcto para sugerirlo al usuario en la UI ("autocorregir").
   */
  suggested?: string;
}

/** Calcula el dígito de control mod-10 (algoritmo EAN/UPC). */
function computeMod10(digits: string): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = parseInt(digits[i], 10);
    // Para EAN-13: posiciones impares (desde la derecha) ×3.
    // Para EAN-8: igual algoritmo, distinta longitud.
    // Para UPC-A: posiciones impares (desde la izquierda, 0-based) ×3.
    const weight = (digits.length - i) % 2 === 0 ? 1 : 3;
    sum += d * weight;
  }
  return (10 - (sum % 10)) % 10;
}

export function validateBarcode(raw: string): BarcodeValidationResult {
  const value = (raw ?? '').trim();
  if (!value) {
    return { valid: false, format: 'desconocido', reason: 'Vacío' };
  }
  const onlyDigits = /^\d+$/.test(value);
  if (onlyDigits) {
    if (value.length === 13) {
      const expected = computeMod10(value.slice(0, 12));
      const actual = parseInt(value[12], 10);
      return expected === actual
        ? { valid: true, format: 'EAN-13' }
        : {
            valid: false,
            format: 'EAN-13',
            reason: `Dígito de control inválido (esperado ${expected})`,
            suggested: value.slice(0, 12) + expected,
          };
    }
    if (value.length === 8) {
      const expected = computeMod10(value.slice(0, 7));
      const actual = parseInt(value[7], 10);
      return expected === actual
        ? { valid: true, format: 'EAN-8' }
        : {
            valid: false,
            format: 'EAN-8',
            reason: `Dígito de control inválido (esperado ${expected})`,
            suggested: value.slice(0, 7) + expected,
          };
    }
    if (value.length === 12) {
      // 12 dígitos puede ser:
      //  a) UPC-A completo (ya con check digit) → validamos.
      //  b) EAN-13 al que le falta el check digit → sugerimos completar.
      // Tratamos primero como UPC-A; si no cuadra, ofrecemos la versión EAN-13.
      const upcExpected = computeMod10(value.slice(0, 11));
      const upcActual = parseInt(value[11], 10);
      if (upcExpected === upcActual) {
        return { valid: true, format: 'UPC-A' };
      }
      const ean13Check = computeMod10(value);
      return {
        valid: false,
        format: 'UPC-A',
        reason: `12 dígitos: como UPC-A el check digit es inválido. Como EAN-13 falta uno (sería ${value}${ean13Check})`,
        suggested: value + ean13Check,
      };
    }
    if (value.length === 11) {
      // Probable UPC-A sin check digit → sugerimos completar.
      const upcCheck = computeMod10(value);
      return {
        valid: false,
        format: 'UPC-A',
        reason: `Falta el dígito de control (sería ${value}${upcCheck})`,
        suggested: value + upcCheck,
      };
    }
    if (value.length === 7) {
      // Probable EAN-8 sin check digit.
      const eanCheck = computeMod10(value);
      return {
        valid: false,
        format: 'EAN-8',
        reason: `Falta el dígito de control (sería ${value}${eanCheck})`,
        suggested: value + eanCheck,
      };
    }
    // Numérico pero no entra en los estándar habituales.
    return {
      valid: false,
      format: 'desconocido',
      reason: `Longitud ${value.length} no es estándar (8/12/13)`,
    };
  }
  // No solo dígitos → asumimos Code128 (acepta ASCII imprimible).
  if (/^[\x20-\x7E]+$/.test(value)) {
    return { valid: true, format: 'Code128' };
  }
  return {
    valid: false,
    format: 'desconocido',
    reason: 'Contiene caracteres no imprimibles',
  };
}

/**
 * Genera un EAN-13 válido a partir de una semilla opcional. Estrategia:
 *  - Si se pasa `seed` con dígitos, los conserva como prefijo (limpiando no
 *    dígitos) y rellena con cifras pseudo-aleatorias hasta 12; calcula el
 *    dígito de control.
 *  - Si no, usa el prefijo `20` (rango reservado para uso interno: el
 *    estándar GS1 indica que los códigos que empiezan por 02 o 20-29 son
 *    para uso "in-store" — nunca colisionarán con un EAN-13 oficial).
 *  - Si se pasa `text` no numérico (un slug del nombre, etc.), lo hashea de
 *    forma determinista a 12 dígitos para que el mismo nombre genere siempre
 *    el mismo barcode (idempotente, útil al regenerar).
 */
export function generateEan13(seed?: string): string {
  const cleanSeed = (seed ?? '').replace(/\D/g, '');
  let digits12: string;
  if (cleanSeed.length >= 12) {
    digits12 = cleanSeed.slice(0, 12);
  } else if (cleanSeed.length > 0) {
    // Completar con dígitos derivados deterministícamente del seed para que
    // sea reproducible. Si solo había unos pocos dígitos, los usamos como
    // prefijo y rellenamos con un hash simple del seed completo.
    const fillNeeded = 12 - cleanSeed.length;
    const hash = simpleNumericHash(seed ?? '', fillNeeded);
    digits12 = cleanSeed + hash;
  } else {
    // Sin semilla → prefijo 20 (in-store) + 10 dígitos aleatorios.
    let body = '';
    for (let i = 0; i < 10; i++) body += Math.floor(Math.random() * 10).toString();
    digits12 = '20' + body;
  }
  const check = computeMod10(digits12);
  return digits12 + check;
}

/**
 * Hash numérico simple y determinista a partir de cualquier string. No es
 * criptográfico — sólo busca distribuir razonablemente para evitar colisiones
 * dentro del mismo tenant (1 en 10^N donde N = digits).
 */
function simpleNumericHash(input: string, digits: number): string {
  // FNV-1a (32-bit) → mod 10^digits.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  const mod = Math.pow(10, digits);
  return (h % mod).toString().padStart(digits, '0');
}
