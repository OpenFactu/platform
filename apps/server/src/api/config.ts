import { Router } from 'express';
import { getConfigSection, setConfigSection } from '../core/config/systemConfigSection';
import { adminMiddleware } from './middleware/adminAuth';
import {
  BRANDING_DEFAULTS,
  FORMAT_DEFAULTS,
  FLAGS_DEFAULTS,
  APP_DEFAULTS,
  type BrandingConfig,
  type FormatConfig,
  type FlagsConfig,
  type AppConfig,
} from '../core/config/appConfig';
import { getStorageConfigRedacted, setStorageConfig } from '../core/config/storageConfig';
import { BACKUP_DEFAULTS, type BackupConfig } from '../core/backup/backupConfig';
import { StorageResolver } from '../core/storage/StorageResolver';
import { logAudit } from '../utils/audit';
import storageOAuthRouter from './storageOAuth';

const router = Router();

// Flujo OAuth de Google Drive / OneDrive (conectar, callback, estado)
router.use('/storage/oauth', storageOAuthRouter);

function mount<T extends Record<string, any>>(section: string, defaults: T, entityType: string) {
  router.get(`/${section}`, async (req: any, res) => {
    // Sin tenant no hay SystemConfig — devolvemos defaults en vez de romper
    if (!req.tenantId) {
      return res.json(defaults);
    }
    try {
      const cfg = await getConfigSection(req.tenantClient, section, defaults);
      res.json(cfg);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.put(`/${section}`, adminMiddleware, async (req: any, res) => {
    if (!req.tenantId) {
      return res.status(400).json({ error: 'Se requiere tenant para modificar configuración' });
    }
    try {
      const before = await getConfigSection(req.tenantClient, section, defaults);
      const after = await setConfigSection(req.tenantClient, section, defaults, req.body || {});
      res.json(after);
      logAudit({
        tenantClient: req.tenantClient,
        tenantId: req.tenantId || '',
        userId: req.user?.id,
        entityType,
        entityId: section,
        action: 'UPDATE',
        oldValue: before,
        newValue: after,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}

mount<BrandingConfig>('branding', BRANDING_DEFAULTS, 'BrandingConfig');
mount<FormatConfig>('format', FORMAT_DEFAULTS, 'FormatConfig');
mount<FlagsConfig>('flags', FLAGS_DEFAULTS, 'FlagsConfig');
mount<AppConfig>('app', APP_DEFAULTS, 'AppConfig');

// Sección fiscal — agrupa las claves SystemConfig añadidas en la mig 032
// (IBAN, SWIFT, régimen fiscal, pie legal, color del PDF…).
interface FiscalConfig {
  company_iban: string;
  company_bank_name: string;
  company_bank_swift: string;
  company_fiscal_regime: string;
  company_invoice_footer: string;
  company_invoice_color: string;
  // Firma / representante legal — aparece en el PDF de la factura
  signature_name: string; // nombre del firmante (p.ej. "Juan García Pérez")
  signature_role: string; // cargo (p.ej. "Administrador único")
  signature_image_url: string; // URL a la imagen (rubrica escaneada)
  signature_show_in_pdf: string; // 'true' | 'false' — flag textual
}
const FISCAL_DEFAULTS: FiscalConfig = {
  company_iban: '',
  company_bank_name: '',
  company_bank_swift: '',
  company_fiscal_regime: '',
  company_invoice_footer: '',
  company_invoice_color: '#0D9488',
  signature_name: '',
  signature_role: '',
  signature_image_url: '',
  signature_show_in_pdf: 'false',
};
mount<FiscalConfig>('fiscal', FISCAL_DEFAULTS, 'FiscalConfig');

// Backups automáticos — programación por tenant (el cron vive en
// core/cron/backupCron.ts y el historial en /api/backups).
mount<BackupConfig>('backup', BACKUP_DEFAULTS, 'BackupConfig');

/**
 * GET /api/config/storage — devuelve la config de almacenamiento del tenant
 *   { provider: 'local'|'gdrive'|'onedrive', local: {basePath?}, gdrive: {...}, onedrive: {...} }
 */
router.get('/storage', async (req: any, res) => {
  if (!req.tenantId) return res.json({ provider: 'local' });
  try {
    // Los secretos (clientSecret/refreshToken) salen redactados como __SET__
    const cfg = await getStorageConfigRedacted(req.tenantClient);
    res.json(cfg);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al leer config de storage' });
  }
});

router.put('/storage', async (req: any, res) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: 'Se requiere tenant para modificar configuración' });
  }
  try {
    const before = await getStorageConfigRedacted(req.tenantClient);
    // setStorageConfig ya descarta los centinelas __SET__ y cifra los secretos
    await setStorageConfig(req.tenantClient, req.body || {});
    const after = await getStorageConfigRedacted(req.tenantClient);
    res.json(after);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'StorageConfig',
      entityId: 'storage',
      action: 'UPDATE',
      oldValue: before,
      newValue: after,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al guardar config de storage' });
  }
});

/**
 * POST /api/config/storage/healthcheck — diagnóstico del adapter activo.
 */
router.post('/storage/healthcheck', async (req: any, res) => {
  if (!req.tenantId) return res.status(400).json({ error: 'tenant requerido' });
  try {
    const tenantSchema = req.tenantSchema || '';
    const adapter = await StorageResolver.forTenant(req.tenantClient, tenantSchema);
    const r = await adapter.healthCheck();
    res.json({ provider: adapter.id, ...r });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al comprobar' });
  }
});

export default router;
