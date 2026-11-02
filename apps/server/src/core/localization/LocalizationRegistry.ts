import { TenantScopedRegistry } from '../plugins/TenantScopedRegistry';
import { parseLocalizationPack } from './packSchema';
import type { LocalizationPack, LocalizationTerminology } from './types';

/** Lo que se ve sin ningún paquete: términos genéricos, sin país. */
const NEUTRAL_TERMINOLOGY: Record<string, Required<LocalizationTerminology>> = {
  es: {
    tax: 'Impuesto',
    taxId: 'Identificación fiscal',
    withholding: 'Retención',
    incomeTax: 'Retención sobre la renta',
    socialEmployee: 'Cotización del trabajador',
    socialEmployer: 'Cotización de la empresa',
  },
  en: {
    tax: 'Tax',
    taxId: 'Tax ID',
    withholding: 'Withholding',
    incomeTax: 'Income tax withholding',
    socialEmployee: 'Employee social contribution',
    socialEmployer: 'Employer social contribution',
  },
};

const packs = new TenantScopedRegistry<LocalizationPack>();

export const LocalizationRegistry = {
  register(pluginId: string, input: unknown): LocalizationPack {
    const pack = parseLocalizationPack(input);
    const clash = packs.allWithPlugin().find((e) => e.value.id === pack.id);
    if (clash && clash.pluginId !== pluginId) {
      throw new Error(
        `El paquete "${pack.id}" ya lo registró el plugin ${clash.pluginId}; elige otro id.`,
      );
    }
    packs.removePlugin(pluginId);
    packs.add(pluginId, pack);
    return pack;
  },

  /** Paquetes activos en esta empresa. */
  activeFor(tenantId: string | undefined): LocalizationPack[] {
    return packs.activeFor(tenantId);
  },

  /** Todos los instalados en el servidor, con el plugin que los aporta. */
  installed(): Array<{ pluginId: string; pack: LocalizationPack }> {
    return packs.allWithPlugin().map((e) => ({ pluginId: e.pluginId, pack: e.value }));
  },

  /** Términos para esa empresa e idioma: los genéricos, y encima los de sus paquetes. */
  terminologyFor(tenantId: string | undefined, locale = 'es'): Required<LocalizationTerminology> {
    const lang = String(locale).slice(0, 2).toLowerCase();
    const result = { ...(NEUTRAL_TERMINOLOGY[lang] ?? NEUTRAL_TERMINOLOGY.en) };
    for (const pack of packs.activeFor(tenantId)) {
      Object.assign(result, pack.terminology?.[lang] ?? {});
    }
    return result;
  },

  /** Textos legales que deben figurar en este tipo de documento. */
  legalTextsFor(tenantId: string | undefined, docType: string, locale = 'es'): string[] {
    const lang = String(locale).slice(0, 2).toLowerCase();
    return packs.activeFor(tenantId).flatMap((pack) =>
      (pack.legalTexts ?? [])
        .filter((t) => !t.docTypes || t.docTypes.includes(docType))
        .filter((t) => !t.locale || t.locale === lang)
        .map((t) => t.text),
    );
  },
};
