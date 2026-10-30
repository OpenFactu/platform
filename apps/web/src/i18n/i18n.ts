/**
 * Núcleo de i18n, sin React: lo usan el `I18nProvider`, el `ApiClient`
 * (cabecera Accept-Language) y cualquier código fuera de componentes
 * (columnas de tablas, mapas de estados, toasts lanzados desde hooks…).
 *
 * Los textos viven en `locales/<idioma>/<namespace>.json`. Cada fichero se
 * fusiona en la raíz, así que por convención cada uno tiene una sola clave
 * raíz igual a su nombre (`hr.json` → `{ "hr": { … } }`), salvo los
 * históricos de `documents.json` (`invoice`, `line`, `payment`).
 */

export type Locale = 'es' | 'en';
export const LOCALES: Locale[] = ['es', 'en'];
export const DEFAULT_LOCALE: Locale = 'es';

type Messages = Record<string, unknown>;
export type TranslateVars = Record<string, string | number>;

const STORAGE_KEY = 'keirost_locale';

function deepMerge(target: Messages, source: Messages): Messages {
  for (const [k, v] of Object.entries(source)) {
    const cur = target[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object') {
      deepMerge(cur as Messages, v as Messages);
    } else {
      target[k] = v;
    }
  }
  return target;
}

const modules = import.meta.glob<Messages>('./locales/*/*.json', {
  eager: true,
  import: 'default',
});

const MESSAGES: Record<Locale, Messages> = { es: {}, en: {} };
for (const [path, content] of Object.entries(modules)) {
  const locale = path.split('/')[2] as Locale;
  if (MESSAGES[locale]) deepMerge(MESSAGES[locale], content);
}

function lookup(obj: Messages, path: string): string | undefined {
  let cur: unknown = obj;
  for (const k of path.split('.')) {
    if (cur && typeof cur === 'object' && k in (cur as Messages)) cur = (cur as Messages)[k];
    else return undefined;
  }
  return typeof cur === 'string' ? cur : undefined;
}

function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? String(vars[key]) : `{${key}}`));
}

function detectInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'es' || stored === 'en') return stored;
  } catch {
    /* noop */
  }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'es')
    .slice(0, 2)
    .toLowerCase();
  return nav === 'en' ? 'en' : DEFAULT_LOCALE;
}

let current: Locale = detectInitialLocale();
const listeners = new Set<() => void>();

if (typeof document !== 'undefined') document.documentElement.lang = current;

export function getLocale(): Locale {
  return current;
}

export function setLocale(l: Locale): void {
  if (l === current) return;
  current = l;
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* noop */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  listeners.forEach((fn) => fn());
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function resolve(locale: Locale, path: string, count?: number): string | undefined {
  if (count != null) {
    const plural = lookup(MESSAGES[locale], `${path}_${count === 1 ? 'one' : 'other'}`);
    if (plural != null) return plural;
  }
  return lookup(MESSAGES[locale], path);
}

/**
 * Traduce `path`. Si `vars.count` es un número busca antes `path_one` /
 * `path_other`. Cae a español y, si tampoco existe, devuelve la clave.
 */
export function translate(locale: Locale, path: string, vars?: TranslateVars): string {
  const count = typeof vars?.count === 'number' ? vars.count : undefined;
  const text = resolve(locale, path, count) ?? resolve(DEFAULT_LOCALE, path, count);
  return text != null ? interpolate(text, vars) : path;
}

/** `t` para código fuera de React; usa el idioma activo en el momento de la llamada. */
export function t(path: string, vars?: TranslateVars): string {
  return translate(current, path, vars);
}

/** Etiqueta BCP 47 para `Intl` (`es-ES`, `en-GB`). */
export function intlLocale(l: Locale = current): string {
  return l === 'en' ? 'en-GB' : 'es-ES';
}
