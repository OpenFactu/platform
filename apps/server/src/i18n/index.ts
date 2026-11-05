/**
 * Traducción de los textos que el servidor devuelve al usuario.
 *
 * El código sigue escribiendo los mensajes en español (es el idioma fuente);
 * aquí se traducen a la salida según el idioma de la petición. Así no hace
 * falta tocar cada `res.status(400).json({ error: '…' })`:
 *
 *   - `i18nMiddleware` fija `req.locale` (cabecera `Accept-Language`, que la
 *     web manda siempre) y envuelve `res.json` para traducir los campos de
 *     texto habituales (`error`, `message`, `details`, `warning`…).
 *   - `tr(locale, texto, vars?)` para los textos que no salen por `res.json`
 *     (emails, notificaciones, PDFs…).
 *
 * Catálogos: `messages/<idioma>/*.ts`, cada uno `export default { 'texto en
 * español': 'translation' }`. Las partes variables se escriben `{0}`, `{1}`…
 * en la clave y en la traducción: `'No existe el artículo {0}': 'Item {0} not
 * found'`. Una clave sin `{n}` se compara exacta; con `{n}`, como patrón.
 *
 * Un plugin puede añadir textos y hasta un idioma entero (ver
 * `core/plugins/PluginTranslations.ts`); lo del núcleo siempre gana.
 */
import fs from 'fs';
import path from 'path';
import type { NextFunction, Request, Response } from 'express';

/** Los que trae el núcleo, más cualquiera que aporte un plugin. */
export type Locale = 'es' | 'en' | (string & {});
export const DEFAULT_LOCALE: Locale = 'es';

type Catalog = Record<string, string>;
interface Pattern {
  re: RegExp;
  to: string;
  /** Caracteres fijos de la clave: cuantos más, más específica. */
  literal: number;
}

const exact: Record<string, Map<string, string>> = {};
const patterns: Record<string, Pattern[]> = {};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function addCatalog(locale: Locale, catalog: Catalog): void {
  exact[locale] ??= new Map();
  patterns[locale] ??= [];
  for (const [from, to] of Object.entries(catalog)) {
    if (/\{\d+\}/.test(from)) {
      const source = escapeRe(from).replace(/\\\{(\d+)\\\}/g, '(?<v$1>[\\s\\S]+?)');
      const literal = from.replace(/\{\d+\}/g, '').length;
      patterns[locale].push({ re: new RegExp(`^${source}$`), to, literal });
    } else if (!exact[locale].has(from)) {
      // El primero gana: el núcleo se carga antes, así que un plugin no lo pisa.
      exact[locale].set(from, to);
    }
  }
  // Los más específicos (más texto fijo) primero: «…para ver {0}.» antes que «…para {0} {1}.».
  // Es estable, así que a igualdad también gana el núcleo.
  patterns[locale].sort((a, b) => b.literal - a.literal);
}

function readCoreCatalogs(locale: Locale): Catalog[] {
  const dir = path.join(__dirname, 'messages', locale);
  if (!fs.existsSync(dir)) return [];
  const result: Catalog[] = [];
  for (const file of fs.readdirSync(dir)) {
    if (!/\.(ts|js)$/.test(file) || file.endsWith('.d.ts')) continue;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(path.join(dir, file));
    result.push(mod.default || mod);
  }
  return result;
}

const coreCatalogs: Record<string, Catalog[]> = { en: readCoreCatalogs('en') };
const pluginCatalogs: Array<{ pluginId: string; locale: Locale; catalog: Catalog }> = [];

function rebuild(): void {
  for (const locale of Object.keys(exact)) {
    delete exact[locale];
    delete patterns[locale];
  }
  for (const [locale, list] of Object.entries(coreCatalogs)) {
    for (const catalog of list) addCatalog(locale, catalog);
  }
  for (const { locale, catalog } of pluginCatalogs) addCatalog(locale, catalog);
}

rebuild();

/** Añade los textos de servidor de un plugin. Lo que ya traduzca el núcleo no cambia. */
export function registerPluginMessages(pluginId: string, locale: Locale, catalog: Catalog): void {
  pluginCatalogs.push({ pluginId, locale, catalog });
  rebuild();
}

export function forgetPluginMessages(pluginId: string): void {
  let changed = false;
  for (let i = pluginCatalogs.length - 1; i >= 0; i--) {
    if (pluginCatalogs[i].pluginId !== pluginId) continue;
    pluginCatalogs.splice(i, 1);
    changed = true;
  }
  if (changed) rebuild();
}

/** Idiomas que aportan los plugins instalados, para reconocerlos en las peticiones. */
const pluginLocales = new Set<string>();

export function registerPluginLocale(locale: Locale): void {
  pluginLocales.add(locale);
}

export function isKnownLocale(locale: unknown): locale is Locale {
  return locale === 'es' || locale === 'en' || pluginLocales.has(locale as string);
}

export function parseLocale(header: string | undefined | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  const first = header.split(',')[0].split(';')[0].trim();
  if (pluginLocales.has(first)) return first;
  const base = first.slice(0, 2).toLowerCase();
  if (base === 'en') return 'en';
  return pluginLocales.has(base) ? base : DEFAULT_LOCALE;
}

/** Etiqueta BCP 47 para `Intl` y `toLocale*`. */
export function intlLocale(locale: Locale): string {
  if (locale === 'en') return 'en-GB';
  if (locale === 'es') return 'es-ES';
  return locale;
}

export function getRequestLocale(req: Request): Locale {
  return ((req as any).locale as Locale) || parseLocale(req.headers['accept-language']);
}

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/**
 * Traduce un texto escrito en español. Si no hay traducción, lo devuelve tal
 * cual (mejor en español que roto). `vars` rellena `{nombre}` después.
 */
export function tr(
  localeOrReq: Locale | Request,
  text: string,
  vars?: Record<string, string | number>,
): string {
  const locale = typeof localeOrReq === 'string' ? localeOrReq : getRequestLocale(localeOrReq);
  if (locale === DEFAULT_LOCALE || typeof text !== 'string' || !text) return fill(text, vars);
  // Un idioma de plugin puede no tenerlo todo: lo que falte, mejor en inglés que en español.
  for (const candidate of locale === 'en' ? ['en'] : [locale, 'en']) {
    const hit = exact[candidate]?.get(text);
    if (hit != null) return fill(hit, vars);
    for (const p of patterns[candidate] || []) {
      const m = p.re.exec(text);
      if (m) {
        const groups = m.groups || {};
        const out = p.to.replace(/\{(\d+)\}/g, (s, n) => {
          const v = groups[`v${n}`];
          // Lo variable puede ser a su vez un mensaje traducible (p. ej. «Error: …»).
          return v == null ? s : tr(locale, v);
        });
        return fill(out, vars);
      }
    }
  }
  // Varios mensajes unidos con «; » (p. ej. bloqueos de cierre de periodo).
  if (text.includes('; ')) {
    const parts = text.split('; ');
    const translated = parts.map((p) => tr(locale, p));
    if (translated.some((p, i) => p !== parts[i])) return fill(translated.join('; '), vars);
  }
  return fill(text, vars);
}

const TEXT_FIELDS = ['error', 'message', 'details', 'detail', 'warning', 'reason', 'hint'];

function translateBody(locale: Locale, body: any): any {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  let out = body;
  for (const field of TEXT_FIELDS) {
    const v = body[field];
    if (typeof v === 'string') {
      const t = tr(locale, v);
      if (t !== v) {
        if (out === body) out = { ...body };
        out[field] = t;
      }
    } else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
      if (out === body) out = { ...body };
      out[field] = v.map((x: string) => tr(locale, x));
    }
  }
  for (const field of ['warnings', 'blockers', 'errors']) {
    const v = body[field];
    if (Array.isArray(v) && v.every((x: unknown) => typeof x === 'string')) {
      if (out === body) out = { ...body };
      out[field] = v.map((x: string) => tr(locale, x));
    } else if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      Object.values(v).every((x) => typeof x === 'string')
    ) {
      // Mapa campo → mensaje (validación por pregunta de los formularios).
      if (out === body) out = { ...body };
      out[field] = Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, tr(locale, x as string)]),
      );
    }
  }
  return out;
}

const QUERY_ERROR_MESSAGE = 'No se ha podido completar la operación.';

/** Un error de consulta lleva el SQL y sus parámetros: se queda en el log. */
export function hideQueryErrors<T>(body: T): T {
  const error = (body as any)?.error;
  if (typeof error !== 'string' || !error.startsWith('Failed query')) return body;
  console.error('[API] Error de consulta:', error);
  return { ...(body as any), error: QUERY_ERROR_MESSAGE };
}

/** Fija `req.locale` y traduce los campos de texto de las respuestas JSON. */
export function i18nMiddleware(req: Request, res: Response, next: NextFunction): void {
  const locale = parseLocale(req.headers['accept-language']);
  (req as any).locale = locale;
  const json = res.json.bind(res);
  res.json = (body?: any) => {
    const safe = hideQueryErrors(body);
    return json(locale === DEFAULT_LOCALE ? safe : translateBody(locale, safe));
  };
  next();
}
