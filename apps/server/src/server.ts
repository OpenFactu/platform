import dotenv from 'dotenv';
import './core/documents/registerDocumentTypes'; // MUST be first — registers all doc types before routers load
import express from 'express';
import cors from 'cors';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { loadPlugins } from './plugins/loader';
import setupRouter from './api/setup';
import pluginsRouter from './api/plugins';
import customFieldsRouter from './api/customFields';
import userTablesRouter from './api/userTables';
import userModulesRouter from './api/userModules';
import automationsRouter from './api/automations';
import dashboardWidgetsRouter from './api/dashboardWidgets';
import logisticsRouter, { publicTrackRouter } from './api/logistics';
import { publicSiteHostMiddleware, publicSiteRouter } from './api/publicSite';
import websiteRouter from './api/website';
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
import crmContactsRouter from './api/crm/contacts';
import crmOpportunitiesRouter from './api/crm/opportunities';
import crmStagesRouter from './api/crm/stages';
import crmActivitiesRouter from './api/crm/activities';
import crmSettingsRouter from './api/crm/settings';
import crmPartnersRouter from './api/crm/partners';
import membersRouter from './api/members';
import { registerCrmQuoteListener } from './core/crm/quoteListener';
import { startCrmCron } from './core/crm/crmCron';
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
import twoFactorRouter from './api/twofa';
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
import { mountTimeclockTerminals } from './api/hr/timeclockTerminal';
import timeclockDevicesRouter from './api/hr/timeclockDevices';
import timeclockCredentialsRouter from './api/hr/timeclockCredentials';
import hrKiosksRouter from './api/hr/kiosks';
import seriesRouter from './api/series';
import purchasesRouter from './api/documentos/purchases';
import purchaseDeliveryNotesRouter from './api/documentos/purchaseDeliveryNotes';
import purchaseInvoicesRouter from './api/documentos/purchaseInvoices';
import salesOrdersRouter from './api/documentos/salesOrders';
import salesDeliveryNotesRouter from './api/documentos/salesDeliveryNotes';
import salesInvoicesRouter from './api/documentos/salesInvoices';
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
import backupsRouter from './api/backups';
import dataImportRouter from './api/dataImport';
import permissionsRouter from './api/permissions';
import {
  mountApi,
  mountApiBySubpath,
  mountShared,
  mountPublic,
  denyUndeclared,
  mountReport,
  PUBLIC_SUBPATH,
} from './core/auth/apiMounts';
import systemRouter from './api/system';
import emailRouter from './api/email';
import notificationsRouter from './api/notifications';
import companyRouter from './api/company';
import dashboardRouter from './api/dashboard';
import tenantsRouter from './api/tenants';
import configRouter from './api/config';
import aiRouter from './api/ai';
import mcpRouter from './api/mcp';
import searchRouter from './api/search';
import geoRouter from './api/geo';
import factuApiRouter from './api/factuapi';
import documentRouter from './api/documentos/documentRouter';
import { tenantContextMiddleware } from './api/middleware/tenantContext';
import { MigrationManager } from './core/tenant/MigrationManager';
import { startPeriodCloseCron } from './core/cron/periodCloseCron';
import { startBackupCron } from './core/cron/backupCron';
import { startEventSocket, broadcastEvent } from './core/realtime/EventSocket';
import { adminMiddleware } from './api/middleware/adminAuth';
import { registerImportObjects } from './core/dataimport/registerImportObjects';
import { UploadStore } from './core/dataimport/UploadStore';
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

// ── Permisos ────────────────────────────────────────────────────────────────
// A partir de aquí los routers NO se montan con `app.use` a secas. Se usan
// `mountApi` (exige permiso de módulo), `mountShared` (basta con estar dentro
// de la empresa) y `mountPublic` (abierto), de modo que el permiso se lee al
// lado del montaje y `denyUndeclared` —al final del fichero— pueda devolver
// 403 a lo que se cuele sin declarar nada. Ver core/auth/apiMounts.ts.

// 1. Rutas de Configuración y Auth (Fuera del contexto de tenant obligatorio)
mountPublic(app, '/api/setup', 'alta inicial de la instalación', setupRouter);
mountPublic(app, '/api/auth', 'login y recuperación de contraseña', authRouter);
mountPublic(app, '/api/logistics', 'seguimiento de envío por token', publicTrackRouter);
// Webs públicas de tenants (módulo Website) — sin auth; resuelve por slug.
// El middleware de Host atiende subdominios/dominios propios registrados en
// WebsiteHost y no toca el resto de peticiones (cache TTL 60s, incl. negativos).
app.use(publicSiteHostMiddleware);
app.use('/site', publicSiteRouter);

// 1b. Middleware de tokens de API — antes del tenantContextMiddleware.
//     Si el Authorization es `Bearer tk_…`, resuelve tenantId + scopes.
app.use('/api', apiTokenMiddleware);

// 2. Middleware de Contexto (Inyecta Prisma Tenant en req)
app.use('/api', tenantContextMiddleware);

// 2b. Gestión de tokens de API (solo admins).
mountApi(app, '/api/admin/api-tokens', '/settings/api-tokens', apiTokensRouter);

// 3. Rutas de Plugins, Dev Keys y Negocio
// `/api/plugins` sirve además los componentes de plugin que carga CUALQUIER
// pantalla contribuida por un plugin, así que no puede exigir el permiso de
// la tienda de aplicaciones. Sus endpoints de activación ya comprueban rol
// dentro del propio router.
mountShared(
  app,
  '/api/plugins',
  'carga de componentes de plugin en cualquier pantalla',
  pluginsRouter,
);
mountApi(app, '/api/custom-fields', '/custom-fields', customFieldsRouter);
mountApi(app, '/api/user-tables', '/user-tables', userTablesRouter);
mountShared(app, '/api/user-modules', 'módulos propios que pintan el menú', userModulesRouter);
mountApi(app, '/api/automations', '/automations', automationsRouter);
// Dos motivos para no exigir aquí el permiso de la pantalla de ajustes:
// `GET /` alimenta el panel de inicio de CUALQUIER usuario, y
// `/:id/component.js` lo carga el navegador con un `import()` dinámico, que no
// puede adjuntar cabeceras (por eso ese endpoint acepta el tenant por query).
// Crear, editar y borrar ya exigen rol admin dentro del propio router.
mountShared(
  app,
  '/api/dashboard-widgets',
  'widgets del panel y su código, que carga el navegador sin cabeceras',
  dashboardWidgetsRouter,
);
mountApi(app, '/api/logistics', '/logistics', logisticsRouter);
mountApi(app, '/api/website', '/website/pages', websiteRouter);
mountApi(app, '/api/dev-keys', '/settings/api-tokens', devKeysRouter);
// 4. Rutas de creación y gestión de usuarios
mountApi(app, '/api/users', '/users', usersRouter);
mountApi(app, '/api/items', '/items', itemsRouter);
mountApi(app, '/api/categories', '/categories', categoriesRouter);
mountApi(app, '/api/uom', '/uom', uomRouter);
mountApi(app, '/api/partners', '/partners', partnersRouter);
mountApi(app, '/api/pricelists', '/pricelists', pricelistsRouter);
mountApi(app, '/api/zones', '/logistics/zones', zonesRouter);
mountApi(app, '/api/warehouses', '/warehouses', warehousesRouter);
mountApi(app, '/api/transfer-notes', '/logistics/stock-movements', transferNotesRouter);
mountApi(app, '/api/goods-receipts', '/logistics/stock-movements', goodsReceiptsRouter);
mountApi(app, '/api/goods-issues', '/logistics/stock-movements', goodsIssuesRouter);
mountShared(
  app,
  '/api/stock',
  'consulta de existencias que usan los documentos',
  stockLookupRouter,
);
mountApi(app, '/api/carriers', '/settings/carriers', carriersRouter);
mountApi(app, '/api/webhooks', '/settings/webhooks', webhooksRouter);
mountApi(app, '/api/partnerGroups', '/partner-groups', partnerGroupsRouter);
mountApi(app, '/api/crm/contacts', '/crm/contacts', crmContactsRouter);
mountApi(app, '/api/crm/opportunities', '/crm/opportunities', crmOpportunitiesRouter);
// Las etapas van con el embudo: quien ve oportunidades necesita leerlas para pintar el tablero.
mountApi(app, '/api/crm/stages', '/crm/opportunities', crmStagesRouter);
mountApi(app, '/api/crm/activities', '/crm/activities', crmActivitiesRouter);
// Ficha 360: cifras y línea de tiempo; dentro se recorta por permiso de cada documento.
mountApi(app, '/api/crm/partners', '/crm/activities', crmPartnersRouter);
// Leer los ajustes lo necesita cualquier formulario del CRM (motivos, orígenes);
// el PUT exige /crm/settings dentro del router.
mountShared(
  app,
  '/api/crm/settings',
  'catálogos del CRM que usan sus formularios',
  crmSettingsRouter,
);
mountShared(app, '/api/members', 'nombres de los miembros para elegir responsable', membersRouter);
registerCrmQuoteListener();
mountApi(app, '/api/periods', '/accounting-periods', periodsRouter);
mountApi(app, '/api/chart-of-accounts', '/chart-of-accounts', chartOfAccountsRouter);
mountApi(app, '/api/cost-centers', '/cost-centers', costCentersRouter);
mountApi(app, '/api/profit-centers', '/profit-centers', profitCentersRouter);
mountApi(app, '/api/internal-orders', '/internal-orders', internalOrdersRouter);
mountApi(app, '/api/journal-entries', '/journal-entries', journalEntriesRouter);
mountApi(app, '/api/account-mappings', '/chart-of-accounts', accountMappingsRouter);
mountShared(
  app,
  '/api/document-links',
  'trazabilidad entre documentos ya visibles',
  documentLinksRouter,
);
mountApi(app, '/api/company/signature', '/settings/company', companySignatureRouter);
// userProfileRouter va ANTES de usersRouter para que /me capture primero.
// Pero usersRouter ya está montado arriba, así que usamos otro prefix.
mountShared(app, '/api/profile', 'perfil del propio usuario', userProfileRouter);
mountShared(app, '/api/2fa', 'doble factor del propio usuario', twoFactorRouter);
// Un permiso POR INFORME: el libro de IVA y el coste laboral no son lo mismo
// que la rotación de stock. Antes este router no pedía ninguno.
mountApiBySubpath(
  app,
  '/api/reports',
  {
    '/journal': '/reports/accounting/journal',
    '/ledger': '/reports/accounting/ledger',
    '/trial-balance': '/reports/accounting/trial-balance',
    '/pl': '/reports/accounting/pl',
    '/balance-sheet': '/reports/accounting/balance-sheet',
    '/vat': '/reports/accounting/vat',
    '/profit-customer': '/reports/management/profit-customer',
    '/profit-item': '/reports/management/profit-item',
    '/profit-project': '/reports/management/profit-project',
    '/profit-cost-center': '/reports/management/profit-cost-center',
    '/executive': '/reports/management/executive',
    '/aging-receivables': '/reports/management/aging-receivables',
    '/aging-payables': '/reports/management/aging-payables',
    '/cashflow': '/reports/management/cashflow',
    '/payslip': '/reports/hr/payslip',
    '/labor-cost': '/reports/hr/labor-cost',
    '/headcount': '/reports/hr/headcount',
    '/hr/labor-cost': '/reports/hr/labor-cost',
    '/hr/productivity': '/reports/hr/headcount',
    '/hr/commissions': '/hr/commissions',
    '/stock-valuation': '/reports/stock/valuation',
    '/stock-rotation': '/reports/stock/rotation',
    '/stock-movements': '/reports/stock/movements',
  },
  reportsRouter,
);
mountApi(app, '/api/hr/employees', '/hr/employees', hrEmployeesRouter);
mountApi(app, '/api/hr/departments', '/hr/departments', hrDepartmentsRouter);
mountApi(app, '/api/hr/payrolls', '/hr/payrolls', hrPayrollsRouter);
mountApi(app, '/api/hr/contracts', '/hr/contracts', hrContractsRouter);
mountApi(
  app,
  '/api/hr/collective-agreements',
  '/hr/collective-agreements',
  hrCollectiveAgreementsRouter,
);
mountApi(app, '/api/hr/evaluations', '/hr/evaluations', hrEvaluationsRouter);
mountApi(app, '/api/hr/commissions', '/hr/commissions', hrCommissionsRouter);
mountApi(app, '/api/hr/tasks', '/hr/tasks', hrTasksRouter);
mountApi(app, '/api/hr/payroll-concepts', '/hr/payroll-concepts', hrPayrollConceptsRouter);
mountApi(app, '/api/hr/incident-types', '/hr/incident-types', hrIncidentTypesRouter);
mountApi(app, '/api/hr/incidents', '/hr/incidents', hrIncidentsRouter);
mountApi(app, '/api/hr/shift-templates', '/hr/shift-templates', hrShiftTemplatesRouter);
mountApi(app, '/api/hr/shift-patterns', '/hr/shift-patterns', hrShiftPatternsRouter);
mountApi(app, '/api/hr/shift-assignments', '/hr/planning', hrShiftAssignmentsRouter);
mountTimeclockTerminals(app);
mountApi(app, '/api/hr/timeclock-devices', '/hr/kiosks', timeclockDevicesRouter);
mountApi(app, '/api/hr/timeclock-credentials', '/hr/employees', timeclockCredentialsRouter);
mountApi(app, '/api/hr/timeclock', '/hr/timeclock', hrTimeclockRouter);
mountApi(app, '/api/hr/kiosks', '/hr/kiosks', hrKiosksRouter);
mountApi(app, '/api/series', '/document-series', seriesRouter);
mountApi(app, '/api/purchases', '/purchase-orders', purchasesRouter);
mountApi(
  app,
  '/api/purchases/delivery-notes',
  '/purchases/delivery-notes',
  purchaseDeliveryNotesRouter,
);
mountApi(app, '/api/purchases/invoices', '/purchases/invoices', purchaseInvoicesRouter);
mountApi(app, '/api/sales/delivery-notes', '/sales/delivery-notes', salesDeliveryNotesRouter);
mountApi(app, '/api/sales/invoices', '/sales/invoices', salesInvoicesRouter);
mountApi(app, '/api/sales', '/sales-orders', salesOrdersRouter);
// Generic document router (new unified API)
mountApi(app, '/api/documents', '/documents', documentRouter);
mountApi(app, '/api/taxes', '/taxes', taxesRouter);
mountApi(app, '/api/audit-logs', '/audit-logs', auditLogsRouter);
// El selector de empresa del login vive aquí y se consulta ANTES de que haya
// sesión: si se mete entero detrás del permiso de usuarios, no se puede ni
// entrar en la aplicación. El resto del router sí es de administración.
mountApiBySubpath(
  app,
  '/api/memberships',
  { '/tenants-for-user': PUBLIC_SUBPATH, '': '/users' },
  membershipsRouter,
);
mountApi(app, '/api/document-templates', '/document-templates', documentTemplatesRouter);
mountShared(
  app,
  '/api/attachments',
  'adjuntos de registros que ya se pueden ver',
  attachmentsRouter,
);
mountApi(app, '/api/admin', '/system/cockpit', adminRouter);
mountApi(app, '/api/backups', '/settings/company', backupsRouter);
// Importador de datos — herramienta de administración: ADMIN o SUPERUSER.
// Dentro, el catálogo se filtra además por permiso de módulo y feature flags.
mountApi(app, '/api/data-import', '/data-import', adminMiddleware, dataImportRouter);
mountApi(app, '/api/system', '/system/cockpit', systemRouter);
// Correo saliente por tenant — lee/escribe config SMTP y envía emails.
mountApi(app, '/api/email', '/settings/company', emailRouter);
mountShared(app, '/api/notifications', 'avisos del propio usuario', notificationsRouter);
// La ficha de la empresa la LEE cualquier pantalla (logo, nombre, formato de
// fecha). Escribirla ya exige rol admin dentro del router.
mountShared(app, '/api/company', 'datos de empresa que pinta toda la interfaz', companyRouter);
mountShared(app, '/api/dashboard', 'panel de inicio del propio usuario', dashboardRouter);
mountApi(app, '/api/tenants', '/settings/company', tenantsRouter);
mountShared(
  app,
  '/api/config',
  'marca, formato y flags que necesita toda la interfaz',
  configRouter,
);
mountApi(app, '/api/ai', '/ai/chat', aiRouter);
mountApi(app, '/api/mcp', '/ai/chat', mcpRouter);
// Mira doce entidades a la vez, así que no puede exigir UN permiso: recorta
// su propia respuesta a lo que el usuario pueda ver (ver api/search.ts).
mountShared(
  app,
  '/api/search',
  'buscador global — filtra sus resultados por permiso',
  searchRouter,
);
mountShared(app, '/api/geo', 'países, provincias y localidades', geoRouter);
mountApi(app, '/api/factuapi', '/documents', factuApiRouter);
mountApi(app, '/api/payments', '/payments', paymentsRouter);
mountShared(app, '/api/currencies', 'catálogo de divisas', currenciesRouter);
mountShared(app, '/api/document-types', 'catálogo de tipos de documento', documentTypesRouter);
mountShared(app, '/api/payment-methods', 'catálogo de formas de pago', paymentMethodsRouter);
mountShared(app, '/api/payment-terms', 'catálogo de plazos de pago', paymentTermsRouter);
mountApi(app, '/api/permissions', '/users', permissionsRouter);

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
/**
 * Aplica el esquema del schema `public`: crea las tablas que falten y añade a
 * las que ya estén las columnas nuevas.
 *
 * Es lo que pone al día una instalación existente al actualizar, sin lo cual
 * habría que acordarse de ejecutar `db:push:public` a mano en cada despliegue.
 */
async function aplicarEsquemaPublico(): Promise<void> {
  // Junto al `dist` compilado en producción, y en `apps/server` al ejecutar
  // con ts-node.
  const candidatos = [
    path.join(__dirname, 'sql', 'public-schema.sql'),
    path.join(__dirname, '..', 'sql', 'public-schema.sql'),
  ];
  const fichero = candidatos.find((ruta) => fs.existsSync(ruta));
  if (!fichero) {
    throw new Error(
      `no se encontró public-schema.sql (buscado en ${candidatos.join(' y ')}). ` +
        'Se genera al compilar con scripts/generate-public-schema.mjs.',
    );
  }

  const publicDb = ClientFactory.getClient('public');
  await publicDb.execute(sql.raw(fs.readFileSync(fichero, 'utf8')));
}

const start = async () => {
  try {
    console.log('[Server] Iniciando Keirost...');
    await waitForDatabase();

    // Asegurar tablas del schema publico antes de cualquier operacion.
    //
    // El SQL lo genera `scripts/generate-public-schema.mjs` desde el propio
    // `schema.ts` al compilar. Antes vivía escrito a mano justo aquí, 185
    // líneas, y en `push-public.ts`, donde ya se había quedado atrás: diez
    // columnas para «GlobalUser» donde el esquema tiene dieciocho. Un esquema
    // incompleto no falla al aplicarse; falla mucho después, al consultarlo,
    // con un error que no menciona ninguna columna.
    try {
      await aplicarEsquemaPublico();
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

    // Cierre por defecto. Va DESPUÉS de los plugins a propósito: ellos también
    // montan rutas y hacerlo antes las dejaría inalcanzables. Cualquier
    // petición a /api que llegue hasta aquí sin haber pasado por un gate se
    // deniega — es lo que impide que el próximo router montado a mano quede
    // abierto sin que nadie se entere.
    //
    // Contrapartida: un plugin que registre rutas nuevas en un hot-reload
    // queda por detrás de este middleware hasta que se reinicie el servidor.
    app.use(denyUndeclared());
    console.log(mountReport());

    // Cron de cierre de período — notifica a los admins cuando un periodo
    // vence pero NO cierra automáticamente (requiere confirmación UI).
    startPeriodCloseCron();

    // Avisos del CRM (presupuestos caducados, recordatorios…) — solo empresas con el CRM activo.
    startCrmCron();

    // Cron de backups automáticos — ejecuta los backups programados por
    // tenant (sección `backup` de SystemConfig) y aplica retención.
    startBackupCron();

    // Catálogo de objetos importables (ver core/dataimport/ImportRegistry).
    registerImportObjects();

    // Ficheros que alguien subió al importador y nunca llegó a procesar.
    // Al arrancar y una vez por hora, para que el temporal no crezca sin fin.
    const sweepUploads = () => {
      const removed = UploadStore.sweepExpired();
      if (removed > 0) console.log(`[DataImport] ${removed} fichero(s) temporal(es) caducado(s).`);
    };
    sweepUploads();
    setInterval(sweepUploads, 60 * 60 * 1000).unref();

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
          body: ctx.data?.total ? `Importe ${Number(ctx.data.total).toFixed(2)} €` : undefined,
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
