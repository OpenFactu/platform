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
 */
import fs from 'fs';
import path from 'path';
import type { NextFunction, Request, Response } from 'express';

export type Locale = 'es' | 'en';
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

function load(locale: Locale): void {
  exact[locale] = new Map();
  patterns[locale] = [];
  const dir = path.join(__dirname, 'messages', locale);
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    if (!/\.(ts|js)$/.test(file) || file.endsWith('.d.ts')) continue;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(path.join(dir, file));
    const catalog: Catalog = mod.default || mod;
    for (const [from, to] of Object.entries(catalog)) {
      if (/\{\d+\}/.test(from)) {
        const source = escapeRe(from).replace(/\\\{(\d+)\\\}/g, '(?<v$1>[\\s\\S]+?)');
        const literal = from.replace(/\{\d+\}/g, '').length;
        patterns[locale].push({ re: new RegExp(`^${source}$`), to, literal });
      } else {
        exact[locale].set(from, to);
      }
    }
  }
  // Los más específicos (más texto fijo) primero: «…para ver {0}.» antes que «…para {0} {1}.».
  patterns[locale].sort((a, b) => b.literal - a.literal);
}

load('en');

export function parseLocale(header: string | undefined | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  const first = header.split(',')[0].trim().slice(0, 2).toLowerCase();
  return first === 'en' ? 'en' : DEFAULT_LOCALE;
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
  const hit = exact[locale]?.get(text);
  if (hit != null) return fill(hit, vars);
  for (const p of patterns[locale] || []) {
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

/** Fija `req.locale` y traduce los campos de texto de las respuestas JSON. */
export function i18nMiddleware(req: Request, res: Response, next: NextFunction): void {
  const locale = parseLocale(req.headers['accept-language']);
  (req as any).locale = locale;
  if (locale !== DEFAULT_LOCALE) {
    const json = res.json.bind(res);
    res.json = (body?: any) => json(translateBody(locale, body));
  }
  next();
}
