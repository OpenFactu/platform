import { Express } from 'express';
import fs from 'fs';
import path from 'path';
import { MigrationEngine } from '../core/plugins/MigrationEngine';
import { PluginContext, PluginDashboardWidgetInput } from './types';
import { HookManager } from '../core/plugins/HookManager';
import { FactuApi } from '../core/plugins/FactuApi';
import { TenantPluginCache } from '../core/plugins/TenantPluginCache';
import { CarrierRegistry } from '../core/carriers/CarrierRegistry';
import { DocumentRegistry } from '../core/documents/DocumentRegistry';
import { registerDocTypeMeta } from '@openfactu/common';
import { AiToolRegistry } from '../core/ai/AiToolRegistry';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { LocalizationRegistry } from '../core/localization/LocalizationRegistry';
import { readPackDirectory } from '../core/localization/packFiles';
import { TaxEngine } from '../core/tax/TaxEngine';
import { TaxIdValidators } from '../core/geo/TaxIdValidators';
import { PayrollCalculators } from '../core/hr/payrollCalculation';
import { PluginReports } from '../core/reports/PluginReports';
import { FiscalConnectors } from '../core/fiscal/FiscalConnectors';
import { LinkableObjects } from '../core/customFields/linkableObjects';
import { BankFormats } from '../core/banking/bankFormats';
import { PluginLifecycle } from '../core/plugins/PluginLifecycle';
import { PluginTranslations } from '../core/plugins/PluginTranslations';
import { unregisterPluginContributions } from '../core/plugins/TenantScopedRegistry';
import { pluginDbOperators } from './dbOperators';
import * as schema from '../db/schema';

// Almacén en memoria de plugins cargados (instalados globalmente)
export const activePlugins: string[] = [];
export const activePluginManifests: any[] = [];
const pluginsDir = path.join(__dirname, '../../../../plugins');

// Referencia al Express app para reloads
let _app: Express | null = null;

// Widgets de dashboard registrados programáticamente vía context.widgets.registerDashboard(),
// por plugin. Se resetea en cada buildPluginContext() (carga y reload) para que el
// hot-reload no acumule duplicados — el Map<id, widget> dedupe dentro de un mismo init().
const programmaticDashboardWidgets = new Map<string, Map<string, PluginDashboardWidgetInput>>();

// Widgets declarados estáticamente en manifest.json, cacheados aparte para poder
// mezclarlos con los programáticos sin perderlos ni duplicarlos entre reloads.
const manifestDashboardWidgetsCache = new Map<string, PluginDashboardWidgetInput[]>();

function resetDashboardWidgets(pluginId: string) {
  programmaticDashboardWidgets.set(pluginId, new Map());
}

// Invariante: un plugin está en activePlugins ⇔ su último init() terminó bien.
// La mantienen tanto loadPlugins() (arranque) como reloadPlugin() (hot-reload),
// para que un plugin que falló en el boot pero se arregla en caliente quede
// instalado sin reiniciar el servidor (y viceversa: uno roto salga de la lista).
function setPluginActive(pluginId: string, active: boolean) {
  const idx = activePlugins.indexOf(pluginId);
  if (active && idx < 0) activePlugins.push(pluginId);
  if (!active && idx >= 0) activePlugins.splice(idx, 1);
}

function registerDashboardWidget(pluginId: string, widget: PluginDashboardWidgetInput) {
  if (!programmaticDashboardWidgets.has(pluginId)) {
    programmaticDashboardWidgets.set(pluginId, new Map());
  }
  programmaticDashboardWidgets.get(pluginId)!.set(widget.id, widget);
  applyDashboardWidgetsToManifest(pluginId);
}

/** Punto de fusión: mezcla widgets de manifest.json + programáticos dentro de activePluginManifests. */
function applyDashboardWidgetsToManifest(pluginId: string) {
  const programmatic = Array.from(programmaticDashboardWidgets.get(pluginId)?.values() ?? []);
  const manifestOwn = manifestDashboardWidgetsCache.get(pluginId) ?? [];
  const programmaticIds = new Set(programmatic.map((w) => w.id));
  const merged = [
    ...manifestOwn.filter((w: any) => !programmaticIds.has(w.id)), // programático gana si hay choque de id
    ...programmatic,
  ];

  let entry = activePluginManifests.find((m: any) => m.id === pluginId);
  if (!entry) {
    if (merged.length === 0) return; // sin manifest ni nada programático aún -> no crear ruido
    entry = { id: pluginId, name: pluginId, ui: {} };
    activePluginManifests.push(entry);
  }
  entry.ui = entry.ui || {};
  entry.ui.dashboardWidgets = merged;
}

/**
 * Fichero de entrada de un plugin. El `index.ts` solo se puede cargar si hay un
 * compilador registrado (en desarrollo); el servidor compilado necesita el
 * `index.js`, y es mejor decirlo así que con un error de sintaxis de TypeScript.
 */
function resolvePluginEntry(pluginPath: string): string | null {
  const tsEntry = path.resolve(pluginPath, 'index.ts');
  const jsEntry = path.resolve(pluginPath, 'index.js');
  const canLoadTs = !!require.extensions['.ts'];
  if (canLoadTs && fs.existsSync(tsEntry)) return tsEntry;
  if (fs.existsSync(jsEntry)) return jsEntry;
  if (fs.existsSync(tsEntry)) {
    throw new Error(
      `${pluginPath} solo tiene index.ts y este servidor no compila TypeScript: compila el plugin a index.js.`,
    );
  }
  return null;
}

/** Registra el paquete de localización de `data/`, si el plugin trae uno. */
function registerPluginPack(pluginId: string, pluginPath: string): boolean {
  const pack = readPackDirectory(path.join(pluginPath, 'data'));
  if (!pack) return false;
  LocalizationRegistry.register(pluginId, pack);
  return true;
}

/** Eventos con nombre `{tabla}.{evento}` a partir del nombre PascalCase de la tabla. */
function documentEvent(tableName: string, suffix: string): string {
  return `${tableName.charAt(0).toLowerCase() + tableName.slice(1)}.${suffix}`;
}

/**
 * Construye el PluginContext que recibe init(). Compartido entre loadPlugins()
 * y reloadPlugin() para no duplicar la lista de capacidades en dos sitios.
 */
function buildPluginContext(pluginId: string): PluginContext {
  if (!_app) {
    throw new Error(
      '[Plugins] No se puede construir el contexto: la app Express aún no está lista',
    );
  }

  // Reset ANTES de ejecutar init(): así un reload que deja de registrar un widget
  // no lo deja "colgado", y uno que sigue registrando los mismos ids no los duplica.
  resetDashboardWidgets(pluginId);
  applyDashboardWidgetsToManifest(pluginId);

  return {
    app: _app,
    migration: {
      addCustomField: MigrationEngine.addCustomField.bind(MigrationEngine),
      createTable: MigrationEngine.createPluginTable.bind(MigrationEngine),
    },
    hooks: {
      register: (event: string, handler: any) => {
        HookManager.register(event, handler, pluginId);
      },
    },
    documents: {
      onBeforeCreate: (tableName: string, handler: any) => {
        HookManager.register(documentEvent(tableName, 'beforeCreate'), handler, pluginId);
      },
      onAfterCreate: (tableName: string, handler: any) => {
        HookManager.register(documentEvent(tableName, 'afterCreate'), handler, pluginId);
      },
      onBeforePost: (tableName: string, handler: any) => {
        HookManager.register(documentEvent(tableName, 'beforePost'), handler, pluginId);
      },
      onAfterPost: (tableName: string, handler: any) => {
        HookManager.register(documentEvent(tableName, 'afterPost'), handler, pluginId);
      },
      onBeforeCancel: (tableName: string, handler: any) => {
        HookManager.register(documentEvent(tableName, 'beforeCancel'), handler, pluginId);
      },
      onAfterCancel: (tableName: string, handler: any) => {
        HookManager.register(documentEvent(tableName, 'afterCancel'), handler, pluginId);
      },
      register: (config) => {
        if (!config?.docType) {
          throw new Error(`[Plugin ${pluginId}] documents.register: docType es obligatorio`);
        }
        if (DocumentRegistry.has(config.docType)) {
          throw new Error(
            `[Plugin ${pluginId}] documents.register: el tipo '${config.docType}' ya está registrado`,
          );
        }
        if (!config.schemaTable || !config.lineSchemaTable) {
          throw new Error(
            `[Plugin ${pluginId}] documents.register: schemaTable y lineSchemaTable son obligatorios (créalas con migration.createTable + pgTable de drizzle-orm)`,
          );
        }
        DocumentRegistry.register(config);
        registerDocTypeMeta({
          docType: config.docType,
          kind:
            config.category === 'delivery_note'
              ? 'deliveryNote'
              : config.category === 'invoice'
                ? 'invoice'
                : 'order',
          side: config.side === 'sales' ? 'sale' : 'purchase',
          label: config.label,
          labelPlural: config.labelPlural,
          apiEndpoint: config.apiPath,
          route: config.uiRoute,
          stockAction: config.stockAction,
        });
        console.log(`[Plugin ${pluginId}] Tipo de documento registrado: ${config.docType}`);
      },
    },
    factuApi: FactuApi,
    carriers: {
      register: (adapter) => CarrierRegistry.register(adapter),
    },
    db: {
      public: ClientFactory.getClient('public'),
      forTenant: (tenantId: string) => ClientFactory.getTenantClient(tenantId),
      schema,
      ops: pluginDbOperators,
    },
    localization: {
      register: (pack) => {
        LocalizationRegistry.register(pluginId, pack);
      },
    },
    taxes: {
      registerResolver: (resolver) => TaxEngine.registerResolver(pluginId, resolver),
    },
    taxIds: {
      registerValidator: (country, validate) =>
        TaxIdValidators.register(pluginId, country, validate),
    },
    payroll: {
      registerCalculator: (calculator) => PayrollCalculators.register(pluginId, calculator),
    },
    reports: {
      register: (definition) => PluginReports.register(pluginId, definition),
    },
    linkableObjects: {
      register: (object) => LinkableObjects.register(pluginId, object),
    },
    bankFormats: {
      registerStatementParser: (parser) => BankFormats.registerStatementParser(pluginId, parser),
      registerBatchExporter: (exporter) => BankFormats.registerBatchExporter(pluginId, exporter),
    },
    fiscal: {
      registerConnector: (connector) => FiscalConnectors.register(pluginId, connector),
    },
    i18n: {
      t: (locale, key, vars) => PluginTranslations.textOf(pluginId, locale, key, vars),
      register: (locale, catalog) => PluginTranslations.register(pluginId, locale, catalog),
    },
    lifecycle: {
      onActivate: (handler) => PluginLifecycle.onActivate(pluginId, handler),
      onDeactivate: (handler) => PluginLifecycle.onDeactivate(pluginId, handler),
    },
    widgets: {
      registerDashboard: (widget) => registerDashboardWidget(pluginId, widget),
    },
    aiTools: {
      register: (name, factory) => AiToolRegistry.register(name, factory, pluginId),
    },
  };
}

export const loadPlugins = async (app: Express) => {
  _app = app;
  console.log('[Plugins] Inicializando motor de plugins...');

  if (!fs.existsSync(pluginsDir)) {
    console.log('[Plugins] No se encontró la ruta global de plugins:', pluginsDir);
    return;
  }

  const pluginFolders = fs.readdirSync(pluginsDir);

  for (const folder of pluginFolders) {
    const pluginPath = path.join(pluginsDir, folder);

    // Solo procesar si es un directorio
    if (fs.statSync(pluginPath).isDirectory()) {
      try {
        const manifestPath = path.resolve(pluginPath, 'manifest.json');

        // 1. Cargar Manifiesto de UI si existe
        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            activePluginManifests.push({ ...manifest, id: folder });
            manifestDashboardWidgetsCache.set(folder, manifest.ui?.dashboardWidgets ?? []);
            console.log(`[Plugins] Manifiesto de UI cargado para: ${folder}`);
          } catch (e) {
            console.error(`[Plugins] Error al leer manifest.json de ${folder}`);
          }
        }

        // 2. Cargar Módulo de Servidor
        const hasTranslations = PluginTranslations.loadFromDirectory(
          folder,
          path.join(pluginPath, 'i18n'),
        );
        const hasPack = registerPluginPack(folder, pluginPath);

        const pluginEntry = resolvePluginEntry(pluginPath);
        if (pluginEntry) console.log(`[Plugins] Intentando cargar archivo: ${pluginEntry}`);
        const pluginModule: any = pluginEntry ? require(pluginEntry) : null;

        // Importante: Handle named export 'init'
        const initFn = pluginModule?.init || pluginModule?.default?.init;

        if (typeof initFn === 'function') {
          const context: PluginContext = buildPluginContext(folder);

          await initFn(context);
          setPluginActive(folder, true);
          console.log(`[Plugins] Plugin cargado y activado exitosamente: ${folder}`);
        } else if (hasPack || hasTranslations) {
          // Un plugin solo de datos es válido: ni una normativa ni un idioma necesitan código.
          setPluginActive(folder, true);
          console.log(`[Plugins] Plugin de datos cargado: ${folder}`);
        } else {
          console.warn(`[Plugins] El plugin ${folder} no exporta una función 'init'.`);
        }
      } catch (err: any) {
        console.error(`[Plugins] Error al cargar el plugin ${folder}:`, err);
      }
    }
  }

  // Cargar caché de activación por tenant
  try {
    await TenantPluginCache.loadAll();
  } catch (err) {
    console.warn(
      '[Plugins] No se pudo cargar la caché de TenantPlugin (tabla aún no existe?):',
      err,
    );
  }
};

/**
 * Recarga un plugin en caliente sin reiniciar el servidor.
 * 1. Limpia hooks del plugin
 * 2. Limpia require.cache
 * 3. Recarga manifest
 * 4. Re-ejecuta init()
 */
export async function reloadPlugin(
  pluginId: string,
): Promise<{ success: boolean; error?: string }> {
  const pluginPath = path.join(pluginsDir, pluginId);

  if (!fs.existsSync(pluginPath)) {
    setPluginActive(pluginId, false);
    return { success: false, error: `Plugin ${pluginId} no encontrado` };
  }

  console.log(`[Plugins] Recargando plugin: ${pluginId}...`);

  try {
    // 1. Limpiar hooks, tools de IA y el resto de aportaciones
    HookManager.unregisterPlugin(pluginId);
    AiToolRegistry.unregisterPlugin(pluginId);
    unregisterPluginContributions(pluginId);
    PluginLifecycle.removePlugin(pluginId);
    PluginTranslations.removePlugin(pluginId);

    // 2. Limpiar require.cache. Con la ruta real: si el plugin es un junction a
    // su propio repositorio, Node guarda los módulos bajo el destino del enlace.
    const resolvedPath = fs.realpathSync(pluginPath);
    Object.keys(require.cache).forEach((key) => {
      if (key.startsWith(resolvedPath)) {
        delete require.cache[key];
      }
    });

    // 3. Recargar manifest
    const manifestPath = path.resolve(pluginPath, 'manifest.json');
    const manifestIdx = activePluginManifests.findIndex((m: any) => m.id === pluginId);

    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const newManifest = { ...manifest, id: pluginId };
      if (manifestIdx >= 0) {
        activePluginManifests[manifestIdx] = newManifest;
      } else {
        activePluginManifests.push(newManifest);
      }
      manifestDashboardWidgetsCache.set(pluginId, manifest.ui?.dashboardWidgets ?? []);
    }

    // 4. Re-ejecutar init()
    const hasTranslations = PluginTranslations.loadFromDirectory(
      pluginId,
      path.join(pluginPath, 'i18n'),
    );
    const hasPack = registerPluginPack(pluginId, pluginPath);
    const pluginEntry = resolvePluginEntry(pluginPath);
    const pluginModule: any = pluginEntry ? require(pluginEntry) : null;

    const initFn = pluginModule?.init || pluginModule?.default?.init;

    if (typeof initFn === 'function' && _app) {
      const context: PluginContext = buildPluginContext(pluginId);

      await initFn(context);
      // Un reload con init() exitoso equivale a la carga del arranque: entra en
      // activePlugins aunque hubiera fallado en el boot o sea un plugin nuevo.
      setPluginActive(pluginId, true);
    } else if (hasPack || hasTranslations) {
      setPluginActive(pluginId, true);
    } else {
      setPluginActive(pluginId, false);
      console.warn(`[Plugins] El plugin ${pluginId} no exporta una función 'init'.`);
    }

    console.log(`[Plugins] ✓ Plugin ${pluginId} recargado`);
    return { success: true };
  } catch (err: any) {
    // El init() falló con los hooks ya desregistrados: el plugin no está operativo.
    setPluginActive(pluginId, false);
    console.error(`[Plugins] ✗ Error recargando ${pluginId}:`, err.message);
    return { success: false, error: err.message };
  }
}

export { pluginsDir, buildPluginContext };
