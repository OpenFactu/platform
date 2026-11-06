/**
 * Avisos a un plugin cuando una empresa lo activa o lo desactiva, para que
 * prepare o retire lo suyo sin esperar al siguiente arranque.
 */
export interface PluginLifecycleContext {
  tenantId: string;
  db: any;
}

type LifecycleHandler = (ctx: PluginLifecycleContext) => Promise<void> | void;

const handlers = new Map<
  string,
  { activate: LifecycleHandler[]; deactivate: LifecycleHandler[] }
>();

function entryOf(pluginId: string) {
  if (!handlers.has(pluginId)) handlers.set(pluginId, { activate: [], deactivate: [] });
  return handlers.get(pluginId)!;
}

export const PluginLifecycle = {
  onActivate(pluginId: string, handler: LifecycleHandler): void {
    entryOf(pluginId).activate.push(handler);
  },
  onDeactivate(pluginId: string, handler: LifecycleHandler): void {
    entryOf(pluginId).deactivate.push(handler);
  },
  async notifyActivated(pluginId: string, ctx: PluginLifecycleContext): Promise<void> {
    for (const handler of handlers.get(pluginId)?.activate ?? []) await handler(ctx);
  },
  async notifyDeactivated(pluginId: string, ctx: PluginLifecycleContext): Promise<void> {
    for (const handler of handlers.get(pluginId)?.deactivate ?? []) await handler(ctx);
  },
  removePlugin(pluginId: string): void {
    handlers.delete(pluginId);
  },
};
