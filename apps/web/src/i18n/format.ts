import { intlLocale } from './i18n';

/**
 * Formatos dependientes del idioma activo. Sustituyen a los
 * `toLocaleString('es-ES')` / `new Intl.NumberFormat('es-ES')` fijos.
 * Se leen en cada llamada, así que siguen al idioma sin re-crear nada.
 */

export function formatNumber(n: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(intlLocale(), opts).format(n);
}

export function formatCurrency(n: number, currency = 'EUR', opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(intlLocale(), { style: 'currency', currency, ...opts }).format(n);
}

export function formatDate(d: Date | string | number, opts?: Intl.DateTimeFormatOptions): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString(intlLocale(), opts);
}

export function formatDateTime(d: Date | string | number, opts?: Intl.DateTimeFormatOptions): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleString(intlLocale(), opts);
}

export function formatTime(d: Date | string | number, opts?: Intl.DateTimeFormatOptions): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleTimeString(intlLocale(), opts);
}
