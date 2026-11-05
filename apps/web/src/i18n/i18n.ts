/**
 * Núcleo de i18n, sin React: lo usan el `I18nProvider`, el `ApiClient`
 * (cabecera Accept-Language) y cualquier código fuera de componentes
 * (columnas de tablas, mapas de estados, toasts lanzados desde hooks…).
 *
 * Los textos viven en `locales/<idioma>/<namespace>.json`. Cada fichero se
 * fusiona en la raíz, así que por convención cada uno tiene una sola clave
 * raíz igual a su nombre (`hr.json` → `{ "hr": { … } }`), salvo los
 * históricos de `documents.json` (`invoice`, `line`, `payment`).
 *
 * Los plugins activos en la empresa añaden los suyos (`setPluginTranslations`):
 * claves propias y hasta idiomas enteros. Lo del núcleo siempre gana.
 */

/** Los que trae la aplicación, más cualquiera que aporte un plugin. */
export type Locale = 'es' | 'en' | (string & {});
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

const MESSAGES: Record<string, Messages> = { es: {}, en: {} };
for (const [path, content] of Object.entries(modules)) {
  const locale = path.split('/')[2] as Locale;
  if (MESSAGES[locale]) deepMerge(MESSAGES[locale], content);
}

/** Lo que aportan los plugins, por idioma. Se reemplaza entero al cambiar de empresa. */
let pluginMessages: Record<string, Messages> = {};

function lookup(obj: Messages, path: string): string | undefined {
  let cur: unknown = obj;
  for (const k of path.split('.')) {
    if (cur && typeof cur === 'object' && k in (cur as Messages)) cur = (cur as Messages)[k];
    else return undefined;
  }
  return typeof cur === 'string' ? cur : undefined;
}

/** Términos de la normativa de la empresa; sin ella, los genéricos de cada idioma. */
let localizationTerms: TranslateVars | null = null;
let termsVersion = 0;

function genericTerm(locale: Locale, key: string): string | undefined {
  return resolve(locale, `app.localization.${key}`);
}

const TERM_KEYS = new Set([
  'tax',
  'taxId',
  'withholding',
  'incomeTax',
  'socialEmployee',
  'socialEmployer',
]);

function interpolate(locale: Locale, template: string, vars?: TranslateVars): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    if (vars && key in vars) return String(vars[key]);
    if (TERM_KEYS.has(key)) {
      const term = localizationTerms?.[key] ?? genericTerm(locale, key);
      if (term != null) return String(term);
    }
    return `{${key}}`;
  });
}

const LOCALE_CODE = /^[a-z]{2,3}(-[A-Z]{2})?$/;

function detectInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LOCALE_CODE.test(stored)) return stored;
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

/**
 * Fija las traducciones de los plugins activos. Dispara un re-render igual que los
 * términos; con null, solo queda lo de la aplicación.
 */
export function setPluginTranslations(translations: Record<string, Messages> | null): void {
  pluginMessages = translations ?? {};
  termsVersion++;
  listeners.forEach((fn) => fn());
}

/** Fija los términos de la normativa activa, o null para volver a los genéricos. */
export function setLocalizationTerms(terms: TranslateVars | null): void {
  localizationTerms = terms;
  termsVersion++;
  listeners.forEach((fn) => fn());
}

/** Cambia con los términos, para que `t` y lo que dependa de ella se recalculen. */
export function getTermsVersion(): number {
  return termsVersion;
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Idiomas en los que buscar, del pedido a los de reserva. */
function fallbackChain(locale: Locale): Locale[] {
  return [...new Set([locale, 'en', DEFAULT_LOCALE])];
}

function lookupIn(locale: Locale, path: string): string | undefined {
  const core = MESSAGES[locale];
  const fromCore = core ? lookup(core, path) : undefined;
  if (fromCore != null) return fromCore;
  const fromPlugins = pluginMessages[locale];
  return fromPlugins ? lookup(fromPlugins, path) : undefined;
}

function resolve(locale: Locale, path: string, count?: number): string | undefined {
  for (const language of fallbackChain(locale)) {
    if (count != null) {
      const plural = lookupIn(language, `${path}_${count === 1 ? 'one' : 'other'}`);
      if (plural != null) return plural;
    }
    const text = lookupIn(language, path);
    if (text != null) return text;
  }
  return undefined;
}

/**
 * Traduce `path`. Si `vars.count` es un número busca antes `path_one` /
 * `path_other`. Cae a inglés y a español y, si tampoco existe, devuelve la clave.
 */
export function translate(locale: Locale, path: string, vars?: TranslateVars): string {
  const count = typeof vars?.count === 'number' ? vars.count : undefined;
  const text = resolve(locale, path, count);
  return text != null ? interpolate(locale, text, vars) : path;
}

/** `t` para código fuera de React; usa el idioma activo en el momento de la llamada. */
export function t(path: string, vars?: TranslateVars): string {
  return translate(current, path, vars);
}

/** Etiqueta BCP 47 para `Intl` (`es-ES`, `en-GB`). */
export function intlLocale(l: Locale = current): string {
  if (l === 'en') return 'en-GB';
  if (l === 'es') return 'es-ES';
  return l;
}
