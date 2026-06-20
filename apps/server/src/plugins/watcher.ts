import chokidar from 'chokidar';
import path from 'path';
import { reloadPlugin, pluginsDir } from './loader';
import { broadcastPluginReload } from './devSocket';

const DEBOUNCE_MS = 500;
const timers: Map<string, NodeJS.Timeout> = new Map();

/**
 * Observa cambios en /plugins y recarga automaticamente.
 * Solo activo en desarrollo.
 */
export function startPluginWatcher() {
  if (process.env.NODE_ENV === 'production') return;

  console.log('[PluginWatcher] Observando cambios en plugins...');

  const watcher = chokidar.watch(pluginsDir, {
    ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
    ignoreInitial: true,
    persistent: true,
  });

  const handleChange = (filePath: string) => {
    // Extraer pluginId de la ruta: /plugins/mi-plugin/algo.ts → mi-plugin
    const relative = path.relative(pluginsDir, filePath);
    const pluginId = relative.split(path.sep)[0];

    if (!pluginId) return;

    // Debounce por plugin
    const existing = timers.get(pluginId);
    if (existing) clearTimeout(existing);

    timers.set(
      pluginId,
      setTimeout(async () => {
        timers.delete(pluginId);
        console.log(`[PluginWatcher] Cambio detectado en ${pluginId}: ${path.basename(filePath)}`);

        const result = await reloadPlugin(pluginId);

        if (result.success) {
          broadcastPluginReload(pluginId);
        } else {
          console.error(`[PluginWatcher] Error: ${result.error}`);
        }
      }, DEBOUNCE_MS),
    );
  };

  watcher.on('change', handleChange);
  watcher.on('add', handleChange);
  watcher.on('unlink', handleChange);
}
