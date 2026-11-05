import { Router } from 'express';
import { getRequestLocale } from '../i18n';
import { LocalizationRegistry } from '../core/localization/LocalizationRegistry';
import { PluginReports } from '../core/reports/PluginReports';
import { FiscalConnectors } from '../core/fiscal/FiscalConnectors';
import { PluginTranslations } from '../core/plugins/PluginTranslations';

const router = Router();

/**
 * GET /api/localization/active
 * Lo que la web necesita saber de la normativa de la empresa: cómo se llaman las
 * cosas, qué paquetes tiene activos y las traducciones de sus plugins. Sin
 * ninguno, los términos son genéricos.
 */
router.get('/active', (req: any, res) => {
  const packs = LocalizationRegistry.activeFor(req.tenantId);
  const locale = getRequestLocale(req);
  res.json({
    packs: packs.map(({ id, name, version, countries }) => ({
      id,
      name: PluginTranslations.text(req.tenantId, locale, name),
      version,
      countries,
    })),
    terminology: LocalizationRegistry.terminologyFor(req.tenantId, locale),
    languages: PluginTranslations.languagesFor(req.tenantId),
    translations: PluginTranslations.catalogsFor(req.tenantId, locale),
    hasPluginReports: PluginReports.activeFor(req.tenantId).length > 0,
    fiscalConnectors: FiscalConnectors.activeFor(req.tenantId).map(({ id, name }) => ({
      id,
      name,
    })),
  });
});

export default router;
