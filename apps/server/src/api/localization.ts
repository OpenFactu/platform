import { Router } from 'express';
import { getRequestLocale } from '../i18n';
import { LocalizationRegistry } from '../core/localization/LocalizationRegistry';
import { PluginReports } from '../core/reports/PluginReports';
import { FiscalConnectors } from '../core/fiscal/FiscalConnectors';

const router = Router();

/**
 * GET /api/localization/active
 * Lo que la web necesita saber de la normativa de la empresa: cómo se llaman las
 * cosas y qué paquetes tiene activos. Sin ninguno, los términos son genéricos.
 */
router.get('/active', (req: any, res) => {
  const packs = LocalizationRegistry.activeFor(req.tenantId);
  res.json({
    packs: packs.map(({ id, name, version, countries }) => ({ id, name, version, countries })),
    terminology: LocalizationRegistry.terminologyFor(req.tenantId, getRequestLocale(req)),
    hasPluginReports: PluginReports.activeFor(req.tenantId).length > 0,
    fiscalConnectors: FiscalConnectors.activeFor(req.tenantId).map(({ id, name }) => ({
      id,
      name,
    })),
  });
});

export default router;
