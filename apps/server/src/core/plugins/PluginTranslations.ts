/**
 * Traducciones que aporta un plugin, en `i18n/<idioma>.json`. Sirven para sus
 * propios textos (menús, informes, pantallas) y para añadir un idioma entero que
 * el núcleo no trae: un plugin de China puede poner la interfaz en chino.
 *
 * Reglas para que un plugin no pueda estropear nada:
 *  - Una traducción del núcleo siempre gana: un plugin solo añade lo que falta.
 *  - Un fichero mal escrito se ignora con un aviso; el plugin sigue cargando.
 *  - Lo que no esté traducido cae a inglés y luego a español, nunca a un hueco.
 *
 * La clave reservada `messages` del fichero son textos que el servidor devuelve
 * tal cual (errores que lanza el plugin), con el mismo formato que los catálogos
 * del núcleo: `{ "texto en español": "translation" }`.
 */
import fs from 'fs';
import path from 'path';
import { forgetPluginMessages, registerPluginLocale, registerPluginMessages } from '../../i18n';
import { TenantScopedRegistry } from './TenantScopedRegistry';

export type TranslationCatalog = { [key: string]: string | TranslationCatalog };
type Vars = Record<string, string | number>;

interface PluginCatalog {
  locale: string;
  catalog: TranslationCatalog;
}

const CORE_LOCALES = new Set(['es', 'en']);
const LOCALE_FILE = /^([a-z]{2,3}(?:-[A-Z]{2})?)\.json$/;

const catalogs = new TenantScopedRegistry<PluginCatalog>();

/** Idiomas en los que buscar un texto, del pedido a los de reserva. */
function fallbackChain(locale: string): string[] {
  return [...new Set([locale, 'en', 'es'])];
}

function lookup(catalog: TranslationCatalog, key: string): string | undefined {
  let current: string | TranslationCatalog | undefined = catalog;
  for (const part of key.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return typeof current === 'string' ? current : undefined;
}

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

function assertOnlyTexts(value: unknown, where: string): asserts value is TranslationCatalog {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${where} tiene que ser un objeto de textos`);
  }
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') continue;
    assertOnlyTexts(entry, `${where}.${key}`);
  }
}

function mergeMissing(target: TranslationCatalog, source: TranslationCatalog): void {
  for (const [key, value] of Object.entries(source)) {
    const current = target[key];
    if (current === undefined) {
      target[key] = typeof value === 'string' ? value : JSON.parse(JSON.stringify(value));
    } else if (typeof current === 'object' && typeof value === 'object') {
      mergeMissing(current, value);
    }
  }
}

function findIn(entries: PluginCatalog[], locale: string, key: string): string | undefined {
  for (const language of fallbackChain(locale)) {
    for (const entry of entries) {
      if (entry.locale !== language) continue;
      const hit = lookup(entry.catalog, key);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

export const PluginTranslations = {
  /** Registra un idioma de un plugin. Lanza si el catálogo está mal formado. */
  register(pluginId: string, locale: string, input: unknown): void {
    if (!LOCALE_FILE.test(`${locale}.json`)) {
      throw new Error(`"${locale}" no es un código de idioma válido (usa "zh" o "pt-BR")`);
    }
    assertOnlyTexts(input, locale);
    const { messages, ...catalog } = input;
    if (messages !== undefined) {
      registerPluginMessages(pluginId, locale, messages as Record<string, string>);
    }
    catalogs.add(pluginId, { locale, catalog });
    registerPluginLocale(locale);
  },

  /**
   * Carga `i18n/*.json`. Un fichero roto se avisa y se salta: no tumba el plugin.
   * Devuelve si ha cargado alguno: un plugin puede ser solo un paquete de idioma.
   */
  loadFromDirectory(pluginId: string, directory: string): boolean {
    if (!fs.existsSync(directory)) return false;
    let loaded = false;
    for (const file of fs.readdirSync(directory)) {
      const match = LOCALE_FILE.exec(file);
      if (!match) {
        if (file.endsWith('.json')) {
          console.warn(`[Plugins] ${pluginId}: se ignora i18n/${file}, el nombre no es un idioma`);
        }
        continue;
      }
      try {
        const content = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
        this.register(pluginId, match[1], content);
        loaded = true;
      } catch (err: any) {
        console.error(`[Plugins] ${pluginId}: se ignora i18n/${file}: ${err.message}`);
      }
    }
    return loaded;
  },

  /** Olvida las traducciones de un plugin (hot-reload). */
  removePlugin(pluginId: string): void {
    catalogs.removePlugin(pluginId);
    forgetPluginMessages(pluginId);
  },

  /** Idiomas que no trae el núcleo y aportan los plugins activos en la empresa. */
  languagesFor(tenantId: string | undefined): string[] {
    const found = catalogs
      .activeFor(tenantId)
      .map((entry) => entry.locale)
      .filter((locale) => !CORE_LOCALES.has(locale));
    return [...new Set(found)].sort();
  },

  /** Catálogos que necesita la web: el idioma pedido y los de reserva. */
  catalogsFor(tenantId: string | undefined, locale: string): Record<string, TranslationCatalog> {
    const result: Record<string, TranslationCatalog> = {};
    const entries = catalogs.activeFor(tenantId);
    for (const language of fallbackChain(locale)) {
      for (const entry of entries) {
        if (entry.locale !== language) continue;
        result[language] ??= {};
        mergeMissing(result[language], entry.catalog);
      }
    }
    return result;
  },

  /**
   * Traduce un texto que puede ser una clave o un literal: si no es una clave
   * conocida, se devuelve tal cual. Así un plugin puede escribir texto plano.
   */
  text(tenantId: string | undefined, locale: string, text: string, vars?: Vars): string {
    return fill(findIn(catalogs.activeFor(tenantId), locale, text) ?? text, vars);
  },

  /** Igual, con las traducciones de un plugin concreto, esté o no activo en la empresa. */
  textOf(pluginId: string, locale: string, text: string, vars?: Vars): string {
    const own = catalogs
      .allWithPlugin()
      .filter((entry) => entry.pluginId === pluginId)
      .map((entry) => entry.value);
    return fill(findIn(own, locale, text) ?? text, vars);
  },

  /** Etiquetas de los PDF en un idioma que el núcleo no trae (clave `pdf` del catálogo). */
  pdfLabelsFor(tenantId: string | undefined, locale: string): Record<string, string> {
    if (CORE_LOCALES.has(locale)) return {};
    const labels: Record<string, string> = {};
    const flatten = (node: TranslationCatalog, prefix: string) => {
      for (const [key, value] of Object.entries(node)) {
        if (typeof value === 'string') labels[`${prefix}${key}`] = value;
        else flatten(value, `${prefix}${key}.`);
      }
    };
    const pdf = this.catalogsFor(tenantId, locale)[locale]?.pdf;
    if (pdf && typeof pdf === 'object') flatten(pdf, '');
    return labels;
  },
};
