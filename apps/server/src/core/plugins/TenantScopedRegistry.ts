import { TenantPluginCache } from './TenantPluginCache';

const CORE_PLUGIN = '__core__';

const registries = new Set<TenantScopedRegistry<any>>();

/**
 * Lista de aportaciones de plugins que se consultan por empresa: una aportación
 * solo cuenta en las empresas que tienen ese plugin activado, igual que los
 * hooks de `HookManager`. Lo de `__core__` cuenta siempre.
 */
export class TenantScopedRegistry<T> {
  private entries: Array<{ pluginId: string; value: T }> = [];

  constructor() {
    registries.add(this);
  }

  add(pluginId: string | undefined, value: T): void {
    this.entries.push({ pluginId: pluginId || CORE_PLUGIN, value });
  }

  removePlugin(pluginId: string): void {
    this.entries = this.entries.filter((e) => e.pluginId !== pluginId);
  }

  /** Todas las aportaciones, sin mirar la empresa. */
  all(): T[] {
    return this.entries.map((e) => e.value);
  }

  allWithPlugin(): Array<{ pluginId: string; value: T }> {
    return [...this.entries];
  }

  activeFor(tenantId: string | undefined): T[] {
    return this.entries
      .filter(
        (e) =>
          e.pluginId === CORE_PLUGIN ||
          (!!tenantId && TenantPluginCache.isActive(tenantId, e.pluginId)),
      )
      .map((e) => e.value);
  }

  /** Solo para los tests: deja el registro vacío. */
  clear(): void {
    this.entries = [];
  }
}

/** Retira de todos los registros lo que aportó un plugin (hot-reload). */
export function unregisterPluginContributions(pluginId: string): void {
  for (const registry of registries) registry.removePlugin(pluginId);
}
