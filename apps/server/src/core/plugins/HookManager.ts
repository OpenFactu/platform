import { TenantPluginCache } from './TenantPluginCache';

type HookHandler = (context: any) => Promise<void> | void;

interface HookEntry {
  pluginId: string;
  handler: HookHandler;
}

export class HookManager {
  private static hooks: Map<string, HookEntry[]> = new Map();

  /**
   * Registra una función para ser ejecutada en un evento específico.
   * Si pluginId es '__core__' o no se proporciona, el hook se ejecuta siempre.
   * Si tiene pluginId, solo se ejecuta si el plugin está activo para el tenant.
   */
  public static register(event: string, handler: HookHandler, pluginId?: string) {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }
    this.hooks.get(event)?.push({
      pluginId: pluginId || '__core__',
      handler,
    });
    console.log(`[HookManager] Hook registrado para ${event} (plugin: ${pluginId || 'core'})`);
  }

  /**
   * Elimina todos los hooks registrados por un plugin.
   * Se usa para hot reload — limpiar antes de re-registrar.
   */
  public static unregisterPlugin(pluginId: string) {
    for (const [event, entries] of this.hooks) {
      this.hooks.set(
        event,
        entries.filter((e) => e.pluginId !== pluginId),
      );
    }
    console.log(`[HookManager] Hooks de ${pluginId} eliminados`);
  }

  /**
   * Dispara los hooks registrados para un evento.
   * Filtra por activación del plugin en el tenant actual (context.tenantId).
   */
  public static async trigger(event: string, context: any) {
    const entries = this.hooks.get(event) || [];
    const tenantId = context?.tenantId;

    for (const entry of entries) {
      if (entry.pluginId === '__core__') {
        await entry.handler(context);
      } else if (tenantId && TenantPluginCache.isActive(tenantId, entry.pluginId)) {
        await entry.handler(context);
      } else if (!tenantId) {
        await entry.handler(context);
      }
    }
  }
}
