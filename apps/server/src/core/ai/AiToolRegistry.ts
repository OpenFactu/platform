import type { ChatToolContext } from './tools';

/** Factory que un plugin registra: recibe el contexto por-request del chat
 * (mismo `ChatToolContext` que usan las tools del core: tenantClient,
 * tenantId, tenantSchema, user, apiBase) y devuelve el resultado de
 * `tool({...})` del paquete `ai`. Retorno `any` a propósito — ver el
 * comentario de `PluginContext.aiTools` en plugins/types.ts: tipar como
 * `ReturnType<typeof tool>` rechaza cualquier `tool({...})` con schema
 * concreto por cómo TS infiere sobrecargas genéricas. */
export type AiToolFactory = (ctx: ChatToolContext) => any;

interface RegistryEntry {
  pluginId: string;
  factory: AiToolFactory;
}

/**
 * Registro en memoria de tools de chat de IA aportadas por plugins.
 *
 * Mismo patrón que `HookManager`/`CarrierRegistry`: un singleton poblado en
 * el boot de cada plugin (`buildPluginContext` en plugins/loader.ts) y
 * consultado en cada request de chat (`buildChatTools` en tools/index.ts).
 * A diferencia de `HookManager` (que registra funciones sin per-request
 * context propio), aquí cada tool es una FACTORY porque `ChatToolContext`
 * cambia en cada mensaje (tenant/usuario de la request) — el registro
 * guarda cómo construir la tool, no una instancia ya construida.
 */
class Registry {
  private readonly map = new Map<string, RegistryEntry>();

  /** Registra una tool de plugin. Si el nombre ya existe (core u otro
   * plugin), se ignora el registro con un aviso — nunca se sobreescribe
   * silenciosamente una tool ya presente. */
  register(name: string, factory: AiToolFactory, pluginId: string) {
    const existing = this.map.get(name);
    if (existing) {
      console.warn(
        `[AiToolRegistry] Tool "${name}" ya registrada por "${existing.pluginId}" — se ignora el registro de "${pluginId}"`,
      );
      return;
    }
    this.map.set(name, { pluginId, factory });
  }

  /** Elimina todas las tools registradas por un plugin — se usa en hot reload,
   * limpiando antes de volver a ejecutar init(). */
  unregisterPlugin(pluginId: string) {
    for (const [name, entry] of this.map) {
      if (entry.pluginId === pluginId) this.map.delete(name);
    }
  }

  getAll(): Array<RegistryEntry & { name: string }> {
    return [...this.map.entries()].map(([name, entry]) => ({ name, ...entry }));
  }
}

export const AiToolRegistry = new Registry();
