/**
 * Convierte un número a texto en español. Cubre hasta 999.999.999.
 * Ejemplos:
 *   1210     → "mil doscientos diez"
 *   1210.15  → "mil doscientos diez euros con quince céntimos"
 */

const UNIDADES = [
  '',
  'uno',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'once',
  'doce',
  'trece',
  'catorce',
  'quince',
  'dieciséis',
  'diecisiete',
  'dieciocho',
  'diecinueve',
  'veinte',
  'veintiuno',
  'veintidós',
  'veintitrés',
  'veinticuatro',
  'veinticinco',
  'veintiséis',
  'veintisiete',
  'veintiocho',
  'veintinueve',
];

const DECENAS = [
  '',
  '',
  '',
  'treinta',
  'cuarenta',
  'cincuenta',
  'sesenta',
  'setenta',
  'ochenta',
  'noventa',
];

const CENTENAS = [
  '',
  'ciento',
  'doscientos',
  'trescientos',
  'cuatrocientos',
  'quinientos',
  'seiscientos',
  'setecientos',
  'ochocientos',
  'novecientos',
];

function twoDigits(n: number): string {
  if (n < 30) return UNIDADES[n];
  const dec = Math.floor(n / 10);
  const unit = n % 10;
  if (unit === 0) return DECENAS[dec];
  return `${DECENAS[dec]} y ${UNIDADES[unit]}`;
}

function threeDigits(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const hundredPart = CENTENAS[hundreds];
  const restPart = twoDigits(rest);
  if (!hundredPart) return restPart;
  if (!restPart) return hundredPart;
  return `${hundredPart} ${restPart}`;
}

function thousandsBlock(n: number): string {
  // n < 1.000.000
  if (n === 0) return '';
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  let out = '';
  if (thousands > 0) {
    if (thousands === 1) {
      out = 'mil';
    } else {
      const pre = threeDigits(thousands).replace(/\buno\b/g, 'un');
      out = `${pre} mil`;
    }
  }
  const restPart = threeDigits(rest);
  if (restPart) out = out ? `${out} ${restPart}` : restPart;
  return out;
}

function millionsBlock(n: number): string {
  // n < 1.000.000.000
  if (n === 0) return 'cero';
  const millions = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  let out = '';
  if (millions > 0) {
    if (millions === 1) {
      out = 'un millón';
    } else {
      const pre = thousandsBlock(millions).replace(/\buno\b/g, 'un');
      out = `${pre} millones`;
    }
  }
  const restPart = thousandsBlock(rest);
  if (restPart) out = out ? `${out} ${restPart}` : restPart;
  return out;
}

/**
 * Convierte un número entero positivo a letras en español.
 */
export function numberToSpanishWords(n: number): string {
  const abs = Math.abs(Math.floor(n));
  if (abs === 0) return 'cero';
  if (abs >= 1_000_000_000) return String(abs); // fallback para muy grandes
  return millionsBlock(abs);
}

/**
 * Convierte un importe a letras en español con formato "X euros con Y céntimos".
 * Acepta número decimal. Redondea a 2 decimales.
 */
export function amountToSpanishWords(amount: number, currency: string = 'euro'): string {
  const rounded = Math.round(amount * 100) / 100;
  const integer = Math.floor(rounded);
  const cents = Math.round((rounded - integer) * 100);

  const integerWords = numberToSpanishWords(integer);
  const currencyWord = integer === 1 ? currency : `${currency}s`;

  let result = `${integerWords} ${currencyWord}`;

  if (cents > 0) {
    const centWords = numberToSpanishWords(cents);
    const centWord = cents === 1 ? 'céntimo' : 'céntimos';
    result += ` con ${centWords} ${centWord}`;
  }

  return result;
}

const EN_ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen',
];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function belowThousandEn(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${EN_ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(EN_TENS[Math.floor(n / 10)] + (n % 10 ? `-${EN_ONES[n % 10]}` : ''));
  } else if (n > 0 || parts.length === 0) {
    parts.push(EN_ONES[n]);
  }
  return parts.join(' ');
}

/** Entero a letras en inglés (escala corta: thousand, million). */
export function numberToEnglishWords(n: number): string {
  const abs = Math.floor(Math.abs(n));
  if (abs === 0) return 'zero';
  if (abs >= 1_000_000_000) return String(abs);
  const parts: string[] = [];
  const millions = Math.floor(abs / 1_000_000);
  const thousands = Math.floor((abs % 1_000_000) / 1000);
  const rest = abs % 1000;
  if (millions) parts.push(`${belowThousandEn(millions)} million`);
  if (thousands) parts.push(`${belowThousandEn(thousands)} thousand`);
  if (rest) parts.push(belowThousandEn(rest));
  return parts.join(' ');
}

/** Importe a letras en inglés: "one hundred twenty euros and fifty cents". */
export function amountToEnglishWords(amount: number, currency: string = 'euro'): string {
  const rounded = Math.round(amount * 100) / 100;
  const integer = Math.floor(rounded);
  const cents = Math.round((rounded - integer) * 100);
  let result = `${numberToEnglishWords(integer)} ${integer === 1 ? currency : `${currency}s`}`;
  if (cents > 0) result += ` and ${numberToEnglishWords(cents)} ${cents === 1 ? 'cent' : 'cents'}`;
  return result;
}

/** Importe a letras en el idioma del documento. */
export function amountToWords(amount: number, locale: string = 'es'): string {
  return locale.startsWith('en') ? amountToEnglishWords(amount) : amountToSpanishWords(amount);
}
