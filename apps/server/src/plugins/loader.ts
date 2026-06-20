import { Express } from 'express';
import fs from 'fs';
import path from 'path';
import { MigrationEngine } from '../core/plugins/MigrationEngine';
import { PluginContext } from './types';
import { HookManager } from '../core/plugins/HookManager';
import { FactuApi } from '../core/plugins/FactuApi';
import { TenantPluginCache } from '../core/plugins/TenantPluginCache';
import { CarrierRegistry } from '../core/carriers/CarrierRegistry';

// Almacén en memoria de plugins cargados (instalados globalmente)
export const activePlugins: string[] = [];
export const activePluginManifests: any[] = [];
const pluginsDir = path.join(__dirname, '../../../../plugins');

// Referencia al Express app para reloads
let _app: Express | null = null;

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
        const pluginModulePath = path.resolve(pluginPath, 'index.ts');
        const jsPluginModulePath = path.resolve(pluginPath, 'index.js');
        const manifestPath = path.resolve(pluginPath, 'manifest.json');

        // 1. Cargar Manifiesto de UI si existe
        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            activePluginManifests.push({ ...manifest, id: folder });
            console.log(`[Plugins] Manifiesto de UI cargado para: ${folder}`);
          } catch (e) {
            console.error(`[Plugins] Error al leer manifest.json de ${folder}`);
          }
        }

        // 2. Cargar Módulo de Servidor
        let pluginModule: any = null;

        if (fs.existsSync(pluginModulePath)) {
          console.log(`[Plugins] Intentando cargar archivo TS: ${pluginModulePath}`);
          pluginModule = require(pluginModulePath);
        } else if (fs.existsSync(jsPluginModulePath)) {
          console.log(`[Plugins] Intentando cargar archivo JS: ${jsPluginModulePath}`);
          pluginModule = require(jsPluginModulePath);
        }

        // Importante: Handle named export 'init'
        const initFn = pluginModule?.init || pluginModule?.default?.init;

        if (typeof initFn === 'function') {
          const context: PluginContext = {
            app,
            migration: {
              addCustomField: MigrationEngine.addCustomField.bind(MigrationEngine),
              createTable: MigrationEngine.createPluginTable.bind(MigrationEngine),
            },
            hooks: {
              register: (event: string, handler: any) => {
                HookManager.register(event, handler, folder);
              },
            },
            documents: {
              onBeforeCreate: (tableName: string, handler: any) => {
                const event = `${tableName.charAt(0).toLowerCase() + tableName.slice(1)}.beforeCreate`;
                HookManager.register(event, handler, folder);
              },
              onAfterCreate: (tableName: string, handler: any) => {
                const event = `${tableName.charAt(0).toLowerCase() + tableName.slice(1)}.afterCreate`;
                HookManager.register(event, handler, folder);
              },
            },
            factuApi: FactuApi,
            carriers: {
              register: (adapter) => CarrierRegistry.register(adapter),
            },
          };

          await initFn(context);
          activePlugins.push(folder);
          console.log(`[Plugins] Plugin cargado y activado exitosamente: ${folder}`);
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
    return { success: false, error: `Plugin ${pluginId} no encontrado` };
  }

  console.log(`[Plugins] Recargando plugin: ${pluginId}...`);

  try {
    // 1. Limpiar hooks
    HookManager.unregisterPlugin(pluginId);

    // 2. Limpiar require.cache
    const resolvedPath = path.resolve(pluginPath);
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
    }

    // 4. Re-ejecutar init()
    const pluginModulePath = path.resolve(pluginPath, 'index.ts');
    const jsPluginModulePath = path.resolve(pluginPath, 'index.js');

    let pluginModule: any = null;
    if (fs.existsSync(pluginModulePath)) {
      pluginModule = require(pluginModulePath);
    } else if (fs.existsSync(jsPluginModulePath)) {
      pluginModule = require(jsPluginModulePath);
    }

    const initFn = pluginModule?.init || pluginModule?.default?.init;

    if (typeof initFn === 'function' && _app) {
      const context: PluginContext = {
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
            const event = `${tableName.charAt(0).toLowerCase() + tableName.slice(1)}.beforeCreate`;
            HookManager.register(event, handler, pluginId);
          },
          onAfterCreate: (tableName: string, handler: any) => {
            const event = `${tableName.charAt(0).toLowerCase() + tableName.slice(1)}.afterCreate`;
            HookManager.register(event, handler, pluginId);
          },
        },
        factuApi: FactuApi,
        carriers: {
          register: (adapter) => CarrierRegistry.register(adapter),
        },
      };

      await initFn(context);
    }

    console.log(`[Plugins] ✓ Plugin ${pluginId} recargado`);
    return { success: true };
  } catch (err: any) {
    console.error(`[Plugins] ✗ Error recargando ${pluginId}:`, err.message);
    return { success: false, error: err.message };
  }
}

export { pluginsDir };
