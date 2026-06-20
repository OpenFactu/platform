import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { sql } from 'drizzle-orm';
import { loadPlugins } from './plugins/loader';
import setupRouter from './api/setup';
import pluginsRouter from './api/plugins';
import customFieldsRouter from './api/customFields';
import userTablesRouter from './api/userTables';
import userModulesRouter from './api/userModules';
import automationsRouter from './api/automations';
import logisticsRouter, { publicTrackRouter } from './api/logistics';
import apiTokensRouter from './api/apiTokens';
import { apiTokenMiddleware } from './api/middleware/apiToken';
import { AutomationRunner } from './core/automations/AutomationRunner';
import devKeysRouter from './api/devKeys';
import authRouter from './api/auth';
import usersRouter from './api/users';
import itemsRouter from './api/items';
import categoriesRouter from './api/categories';
import uomRouter from './api/uom';
import partnersRouter from './api/partners';
import pricelistsRouter from './api/pricelists';
import zonesRouter from './api/zones';
import warehousesRouter from './api/warehouses';
import {
  transferNotesRouter,
  goodsReceiptsRouter,
  goodsIssuesRouter,
  stockLookupRouter,
} from './api/stockMovements';
import carriersRouter from './api/carriers';
import { bootstrapCarrierAdapters } from './core/carriers/bootstrap';
import webhooksRouter from './api/webhooks';
import partnerGroupsRouter from './api/partnerGroups';
import periodsRouter from './api/periods';
import chartOfAccountsRouter from './api/chartOfAccounts';
import costCentersRouter from './api/costCenters';
import profitCentersRouter from './api/profitCenters';
import internalOrdersRouter from './api/internalOrders';
import journalEntriesRouter from './api/journalEntries';
import accountMappingsRouter from './api/accountMappings';
import documentLinksRouter from './api/documentLinks';
import companySignatureRouter from './api/companySignature';
import userProfileRouter from './api/userProfile';
import reportsRouter from './api/reports';
import hrEmployeesRouter from './api/hr/employees';
import hrDepartmentsRouter from './api/hr/departments';
import hrPayrollsRouter from './api/hr/payrolls';
import hrContractsRouter from './api/hr/contracts';
import hrCollectiveAgreementsRouter from './api/hr/collectiveAgreements';
import hrEvaluationsRouter from './api/hr/evaluations';
import hrCommissionsRouter from './api/hr/commissions';
import hrTasksRouter from './api/hr/tasks';
import hrPayrollConceptsRouter from './api/hr/payrollConcepts';
import hrIncidentTypesRouter from './api/hr/incidentTypes';
import hrIncidentsRouter from './api/hr/incidents';
import hrShiftTemplatesRouter from './api/hr/shiftTemplates';
import hrShiftPatternsRouter from './api/hr/shiftPatterns';
import hrShiftAssignmentsRouter from './api/hr/shiftAssignments';
import hrTimeclockRouter from './api/hr/timeclock';
import hrKiosksRouter from './api/hr/kiosks';
import seriesRouter from './api/series';
import purchasesRouter from './api/purchases';
import purchaseDeliveryNotesRouter from './api/purchaseDeliveryNotes';
import purchaseInvoicesRouter from './api/purchaseInvoices';
import salesOrdersRouter from './api/salesOrders';
import salesDeliveryNotesRouter from './api/salesDeliveryNotes';
import salesInvoicesRouter from './api/salesInvoices';
import paymentsRouter from './api/payments';
import {
  currenciesRouter,
  documentTypesRouter,
  paymentMethodsRouter,
  paymentTermsRouter,
} from './api/fiscalLookups';
import taxesRouter from './api/taxes';
import auditLogsRouter from './api/auditLogs';
import membershipsRouter from './api/memberships';
import documentTemplatesRouter from './api/documentTemplates';
import attachmentsRouter from './api/attachments';
import adminRouter from './api/admin';
import systemRouter from './api/system';
import emailRouter from './api/email';
import notificationsRouter from './api/notifications';
import companyRouter from './api/company';
import dashboardRouter from './api/dashboard';
import tenantsRouter from './api/tenants';
import configRouter from './api/config';
import searchRouter from './api/search';
import geoRouter from './api/geo';
import factuApiRouter from './api/factuapi';
import { tenantContextMiddleware } from './api/middleware/tenantContext';
import { MigrationManager } from './core/tenant/MigrationManager';
import { startPeriodCloseCron } from './core/cron/periodCloseCron';
import { startEventSocket, broadcastEvent } from './core/realtime/EventSocket';
import { notifyTenant } from './core/realtime/notifyTenant';
import { HookManager } from './core/plugins/HookManager';
import { invalidateDashboardCache } from './api/dashboard';
import { bootstrapAdmin } from './core/auth/bootstrap';
import { ClientFactory } from './core/tenant/ClientFactory';
import { seedGeo } from './core/geo/seedGeo';
import { PdfRenderer } from '@openfactu/pdf';
import { requestCounterMiddleware } from './core/system/RequestCounter';
import { getServerVersion } from './core/system/SystemMetrics';
import { register, httpRequestsTotal, httpRequestDurationSeconds } from './core/metrics/prometheus';

// El `.env` real vive en el root del monorepo (no hay uno propio en apps/server).
// Primero intenta el CWD por si alguien lo ha duplicado; luego cae al del root.
dotenv.config();
dotenv.config({ path: require('path').join(__dirname, '../../../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// Límite amplio: las pruebas de entrega (PoD) suben firma + foto en base64
// (puede rondar 200–500 KB cada foto tras redimensionar). También cualquier
// otro upload inline que pudiera aparecer en el futuro.
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
// Contador global de peticiones — alimenta el cockpit (/api/system/metrics).
// Va antes de las rutas para contar absolutamente todo, incluidos 404.
app.use(requestCounterMiddleware);

// Middleware de métricas Prometheus — mide duración y cuenta requests
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path || '/';
    const method = req.method;
    const status = res.statusCode.toString();
    httpRequestsTotal.inc({ method, route, status });
    httpRequestDurationSeconds.observe({ method, route, status }, duration);
  });
  next();
});

// Endpoint de métricas para Prometheus (sin auth, antes del tenant context)
app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(String(err));
  }
});

// 1. Rutas de Configuración y Auth (Fuera del contexto de tenant obligatorio)
app.use('/api/setup', setupRouter);
app.use('/api/auth', authRouter);
// Endpoint público de tracking — no requiere auth; se identifica por token.
app.use('/api/logistics', publicTrackRouter);

// 1b. Middleware de tokens de API — antes del tenantContextMiddleware.
//     Si el Authorization es `Bearer tk_…`, resuelve tenantId + scopes.
app.use('/api', apiTokenMiddleware);

// 2. Middleware de Contexto (Inyecta Prisma Tenant en req)
app.use('/api', tenantContextMiddleware);

// 2b. Gestión de tokens de API (solo admins).
app.use('/api/admin/api-tokens', apiTokensRouter);

// 3. Rutas de Plugins, Dev Keys y Negocio
app.use('/api/plugins', pluginsRouter);
app.use('/api/custom-fields', customFieldsRouter);
app.use('/api/user-tables', userTablesRouter);
app.use('/api/user-modules', userModulesRouter);
app.use('/api/automations', automationsRouter);
app.use('/api/logistics', logisticsRouter);
app.use('/api/dev-keys', devKeysRouter);
// 4. Rustas de creación y gestion de usarios
app.use('/api/users', usersRouter);
app.use('/api/items', itemsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/uom', uomRouter);
app.use('/api/partners', partnersRouter);
app.use('/api/pricelists', pricelistsRouter);
app.use('/api/zones', zonesRouter);
app.use('/api/warehouses', warehousesRouter);
app.use('/api/transfer-notes', transferNotesRouter);
app.use('/api/goods-receipts', goodsReceiptsRouter);
app.use('/api/goods-issues', goodsIssuesRouter);
app.use('/api/stock', stockLookupRouter);
app.use('/api/carriers', carriersRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/partnerGroups', partnerGroupsRouter);
app.use('/api/periods', periodsRouter);
app.use('/api/chart-of-accounts', chartOfAccountsRouter);
app.use('/api/cost-centers', costCentersRouter);
app.use('/api/profit-centers', profitCentersRouter);
app.use('/api/internal-orders', internalOrdersRouter);
app.use('/api/journal-entries', journalEntriesRouter);
app.use('/api/account-mappings', accountMappingsRouter);
app.use('/api/document-links', documentLinksRouter);
app.use('/api/company/signature', companySignatureRouter);
// userProfileRouter va ANTES de usersRouter para que /me capture primero.
// Pero usersRouter ya está montado arriba, así que usamos otro prefix.
app.use('/api/profile', userProfileRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/hr/employees', hrEmployeesRouter);
app.use('/api/hr/departments', hrDepartmentsRouter);
app.use('/api/hr/payrolls', hrPayrollsRouter);
app.use('/api/hr/contracts', hrContractsRouter);
app.use('/api/hr/collective-agreements', hrCollectiveAgreementsRouter);
app.use('/api/hr/evaluations', hrEvaluationsRouter);
app.use('/api/hr/commissions', hrCommissionsRouter);
app.use('/api/hr/tasks', hrTasksRouter);
app.use('/api/hr/payroll-concepts', hrPayrollConceptsRouter);
app.use('/api/hr/incident-types', hrIncidentTypesRouter);
app.use('/api/hr/incidents', hrIncidentsRouter);
app.use('/api/hr/shift-templates', hrShiftTemplatesRouter);
app.use('/api/hr/shift-patterns', hrShiftPatternsRouter);
app.use('/api/hr/shift-assignments', hrShiftAssignmentsRouter);
app.use('/api/hr/timeclock', hrTimeclockRouter);
app.use('/api/hr/kiosks', hrKiosksRouter);
app.use('/api/series', seriesRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/purchases/delivery-notes', purchaseDeliveryNotesRouter);
app.use('/api/purchases/invoices', purchaseInvoicesRouter);
app.use('/api/sales/delivery-notes', salesDeliveryNotesRouter);
app.use('/api/sales/invoices', salesInvoicesRouter);
app.use('/api/sales', salesOrdersRouter);
app.use('/api/taxes', taxesRouter);
app.use('/api/audit-logs', auditLogsRouter);
app.use('/api/memberships', membershipsRouter);
app.use('/api/document-templates', documentTemplatesRouter);
app.use('/api/attachments', attachmentsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/system', systemRouter);
// Correo saliente por tenant — lee/escribe config SMTP y envía emails.
app.use('/api/email', emailRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/company', companyRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/tenants', tenantsRouter);
app.use('/api/config', configRouter);
app.use('/api/search', searchRouter);
app.use('/api/geo', geoRouter);
app.use('/api/factuapi', factuApiRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/currencies', currenciesRouter);
app.use('/api/document-types', documentTypesRouter);
app.use('/api/payment-methods', paymentMethodsRouter);
app.use('/api/payment-terms', paymentTermsRouter);

// Health check para el instalador y Docker
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Servidor Keirost en línea' });
});

// Endpoint público con la versión del servidor — lo consume el front para
// mostrarla en el menú de usuario sin requerir privilegios elevados.
app.get('/api/version', (_req, res) => {
  res.json({ version: getServerVersion() });
});

/**
 * Espera a que la base de datos esté lista antes de continuar el arranque.
 */
async function waitForDatabase(retries = 10, delay = 2000) {
  const dbUrl = process.env.DATABASE_URL || '';
  const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ':***@');
  console.log(`[Server] Intentando conectar a: ${maskedUrl}`);

  const db = ClientFactory.getClient('public');
  for (let i = 0; i < retries; i++) {
    try {
      await db.execute(sql`SELECT 1`);
      console.log('   ✅ Base de datos lista.');
      return;
    } catch (err: any) {
      console.log(
        `   [Wait] Reintentando conexión a la base de datos (${i + 1}/${retries})... Error: ${err.message}`,
      );
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw new Error('No se pudo establecer conexión con la base de datos tras varios intentos.');
}

// Inicializar plugins y pasarles app para que inyecten rutas
const start = async () => {
  try {
    console.log('[Server] Iniciando Keirost...');
    await waitForDatabase();

    // Asegurar tablas del schema publico antes de cualquier operacion
    try {
      const publicDb = ClientFactory.getClient('public');
      await publicDb.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS "Tenant" (
          "id" TEXT PRIMARY KEY, "name" TEXT UNIQUE NOT NULL, "schemaName" TEXT UNIQUE NOT NULL,
          "config" TEXT, "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS "GlobalUser" (
          "id" TEXT PRIMARY KEY, "email" TEXT UNIQUE NOT NULL, "username" TEXT UNIQUE NOT NULL,
          "password" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'USER',
          "tenantId" TEXT REFERENCES "Tenant"("id"), "permissions" TEXT,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "signatureName" TEXT;
        ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "signatureRole" TEXT;
        ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "signatureImageUrl" TEXT;
        CREATE TABLE IF NOT EXISTS "UserTenantMembership" (
          "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "GlobalUser"("id") ON DELETE CASCADE,
          "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
          "role" TEXT NOT NULL DEFAULT 'USER', "permissions" TEXT,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE ("userId", "tenantId")
        );
        CREATE TABLE IF NOT EXISTS "AuditLog" (
          "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id"),
          "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL, "action" TEXT NOT NULL,
          "userId" TEXT REFERENCES "GlobalUser"("id"), "oldValue" JSONB, "newValue" JSONB,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS "PluginField" (
          "id" TEXT PRIMARY KEY, "pluginId" TEXT NOT NULL, "tableName" TEXT NOT NULL,
          "fieldName" TEXT NOT NULL, "fieldType" TEXT NOT NULL, "label" TEXT NOT NULL,
          "isManaged" BOOLEAN NOT NULL DEFAULT TRUE,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "options" JSONB;
        ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "required" BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
        ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "helpText" TEXT;
        ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "placeholder" TEXT;
        ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "defaultValue" TEXT;
        ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "readOnly" BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "width" TEXT NOT NULL DEFAULT 'half';
        ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "section" TEXT;
        ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "visibleIn" JSONB;
        ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "showInList" BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "readRoles" JSONB;
        ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "writeRoles" JSONB;
        ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "validation" JSONB;
        ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "refTable" TEXT;
        ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "refDisplayField" TEXT;
        CREATE TABLE IF NOT EXISTS "PluginTable" (
          "id" TEXT PRIMARY KEY, "pluginId" TEXT NOT NULL, "tableName" TEXT NOT NULL,
          "definition" TEXT NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        ALTER TABLE "PluginTable" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
        ALTER TABLE "PluginTable" ADD COLUMN IF NOT EXISTS "label" TEXT;
        ALTER TABLE "PluginTable" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'master';
        ALTER TABLE "PluginTable" ADD COLUMN IF NOT EXISTS "iconName" TEXT;
        ALTER TABLE "PluginTable" ADD COLUMN IF NOT EXISTS "menuModule" TEXT;
        ALTER TABLE "PluginTable" ADD COLUMN IF NOT EXISTS "displayField" TEXT;
        ALTER TABLE "PluginTable" ADD COLUMN IF NOT EXISTS "description" TEXT;
        CREATE TABLE IF NOT EXISTS "TenantPlugin" (
          "id" TEXT PRIMARY KEY,
          "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
          "pluginId" TEXT NOT NULL,
          "isActive" BOOLEAN NOT NULL DEFAULT FALSE,
          "config" TEXT,
          "activatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "deactivatedAt" TIMESTAMP,
          UNIQUE ("tenantId", "pluginId")
        );
        CREATE TABLE IF NOT EXISTS "DevApiKey" (
          "id" TEXT PRIMARY KEY,
          "clientId" TEXT UNIQUE NOT NULL,
          "clientSecret" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "createdBy" TEXT NOT NULL REFERENCES "GlobalUser"("id"),
          "tenantId" TEXT REFERENCES "Tenant"("id"),
          "permissions" TEXT DEFAULT 'plugin:push,plugin:reload',
          "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
          "lastUsedAt" TIMESTAMP,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS "UserModule" (
          "id" TEXT PRIMARY KEY,
          "tenantId" TEXT NOT NULL,
          "label" TEXT NOT NULL,
          "iconName" TEXT NOT NULL DEFAULT 'Folder',
          "moduleOrder" INTEGER NOT NULL DEFAULT 100,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        ALTER TABLE "PluginTable" ADD COLUMN IF NOT EXISTS "userModuleId" TEXT;
        CREATE TABLE IF NOT EXISTS "Automation" (
          "id" TEXT PRIMARY KEY,
          "tenantId" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
          "triggerType" TEXT NOT NULL,
          "triggerConfig" JSONB,
          "actionType" TEXT NOT NULL,
          "actionConfig" JSONB,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS "AutomationRun" (
          "id" TEXT PRIMARY KEY,
          "automationId" TEXT NOT NULL,
          "tenantId" TEXT NOT NULL,
          "status" TEXT NOT NULL,
          "startedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "finishedAt" TIMESTAMP,
          "durationMs" INTEGER,
          "outputText" TEXT,
          "errorText" TEXT,
          "triggerSource" TEXT,
          "contextJson" JSONB
        );
      `));
      console.log('[Bootstrap] Tablas del schema publico verificadas.');
    } catch (err: any) {
      console.warn('[Bootstrap] No se pudieron verificar tablas publicas:', err.message);
    }

    await bootstrapAdmin();
    console.log('[Bootstrap] Administrador verificado.');

    // Seed de datos geográficos (países, provincias, municipios)
    try {
      await seedGeo(ClientFactory.getClient('public'));
    } catch (err: any) {
      console.warn('[Bootstrap] Seed geográfico falló:', err.message);
    }

    // Sincronizar esquemas de todos los tenants
    console.log('[Bootstrap] Sincronizando esquemas de empresas...');
    await MigrationManager.syncAllTenants();
    console.log('[Bootstrap] Esquemas sincronizados.');

    await loadPlugins(app);

    // Cron de cierre de período — notifica a los admins cuando un periodo
    // vence pero NO cierra automáticamente (requiere confirmación UI).
    startPeriodCloseCron();

    const server = app.listen(PORT, () => {
      console.log(`[Server] Keirost escuchando en puerto ${PORT}`);
    });

    // Arrancar el runner de automatizaciones (schedule + hooks).
    AutomationRunner.start();

    // Registro de adapters de transportista (manual + los que se añadan).
    bootstrapCarrierAdapters();

    // WebSocket de eventos de negocio (tiempo real para el dashboard).
    startEventSocket(server);
    const DOC_TITLES: Record<string, string> = {
      salesInvoice: 'Nueva factura de venta',
      purchaseInvoice: 'Nueva factura de compra',
      salesOrder: 'Nuevo pedido de venta',
      purchaseOrder: 'Nuevo pedido de compra',
      salesDeliveryNote: 'Nuevo albarán de venta',
      purchaseDeliveryNote: 'Nuevo albarán de compra',
    };
    const DOC_LINKS: Record<string, string> = {
      salesInvoice: '/sales/invoices',
      purchaseInvoice: '/purchases/invoices',
      salesOrder: '/sales-orders',
      purchaseOrder: '/purchase-orders',
      salesDeliveryNote: '/sales/delivery-notes',
      purchaseDeliveryNote: '/purchases/delivery-notes',
    };
    for (const prefix of Object.keys(DOC_TITLES)) {
      // Registramos sin pluginId → se usa '__core__' y siempre dispara.
      HookManager.register(`${prefix}.afterCreate`, async (ctx: any) => {
        if (!ctx?.tenantId) return;
        invalidateDashboardCache(ctx.tenantId);
        // 1) Broadcast WebSocket (dashboard se refresca en vivo).
        broadcastEvent(ctx.tenantId, {
          type: `${prefix}.created`,
          payload: {
            id: ctx.data?.id,
            docNum: ctx.data?.docNum,
            total: ctx.data?.total,
            partnerId: ctx.data?.partnerId,
          },
        });
        // 2) Notificación persistente para todos los miembros del tenant.
        //    Incluye al creador para que vea en su propia campana la confirmación
        //    (mismo patrón que los emails "Factura enviada").
        const docNum = ctx.data?.docNum ? String(ctx.data.docNum).padStart(6, '0') : '';
        await notifyTenant({
          tenantId: ctx.tenantId,
          tenantClient: ctx.db,
          title: `${DOC_TITLES[prefix]} nº ${docNum}`,
          body: ctx.data?.total
            ? `Importe ${Number(ctx.data.total).toFixed(2)} €`
            : undefined,
          level: 'success',
          link: ctx.data?.id ? `${DOC_LINKS[prefix]}/${ctx.data.id}` : DOC_LINKS[prefix],
        });
      });
    }

    // Hot reload de plugins en desarrollo
    if (process.env.NODE_ENV !== 'production') {
      try {
        const { startDevSocket } = require('./plugins/devSocket');
        const { startPluginWatcher } = require('./plugins/watcher');
        startDevSocket(server);
        startPluginWatcher();
      } catch (err: any) {
        console.warn('[DevMode] No se pudo activar hot reload:', err.message);
      }
    }
  } catch (err) {
    console.error('[Bootstrap] Error al iniciar el servidor:', err);
    process.exit(1);
  }
};

// Cerrar Puppeteer al recibir señal de apagado
const shutdown = async () => {
  console.log('[Server] Cerrando recursos...');
  try {
    await PdfRenderer.shutdown();
  } catch {
    /* noop */
  }
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();
