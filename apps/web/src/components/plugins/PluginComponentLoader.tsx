import React, { useState, useEffect, Suspense } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { Card } from '@openfactu/ui';
import { usePlugins } from '../../context/PluginContext';
import { getDynamicImportApiBase } from '../../utils/dynamicImportBase';

interface PluginComponentLoaderProps {
  pluginId: string;
  componentPath: string;
  props?: any;
}

/**
 * Cargador de Alto Nivel para componentes de Plugins.
 * Utiliza importación dinámica de ESM para cargar componentes transpilados desde el servidor.
 */
export const PluginComponentLoader: React.FC<PluginComponentLoaderProps> = ({
  pluginId,
  componentPath,
  props,
}) => {
  const { reloadTimestamp } = usePlugins();
  const [Component, setComponent] = useState<React.ComponentType<any> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reset estado al recargar
    setComponent(null);
    setError(null);
    let isMounted = true;

    const loadComponent = async () => {
      try {
        // URL absoluta al servidor API para evitar que Vite intercepte el import() dinámico.
        // Vite no puede proxiar imports dinámicos de módulos ESM — solo HTTP fetch normal.
        const apiBase = getDynamicImportApiBase();
        const url = `${apiBase}/api/plugins/load/${pluginId}/${componentPath}?t=${reloadTimestamp}`;

        console.log(`[PluginLoader] Intentando importar módulo ESM desde: ${url}`);

        // Importación dinámica nativa bloqueada por Vite en build time,
        // pero resuelta perfectamente en runtime por el navegador.
        const module = await import(/* @vite-ignore */ url);

        if (!isMounted) return;

        // Estrategia de detección de componente (Default > Component > First Export)
        const LoadedComponent =
          module.default ||
          module.Component ||
          Object.values(module).find((v) => typeof v === 'function');

        if (!LoadedComponent) {
          throw new Error(
            'El módulo de plugin no exporta un componente válido (default o función).',
          );
        }

        setComponent(() => LoadedComponent);
      } catch (err: any) {
        if (!isMounted) return;
        console.error(`[PluginLoader] Fallo crítico al cargar ${componentPath}:`, err);
        setError(err.message || 'Error al descargar o transpilar el componente del plugin.');
      }
    };

    loadComponent();
    return () => {
      isMounted = false;
    };
  }, [pluginId, componentPath, reloadTimestamp]);

  if (error) {
    return (
      <Card className="border-rose-200 bg-rose-50 p-6 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <AlertCircle className="text-rose-500" size={24} />
          <h3 className="text-rose-900 font-bold">Error de Extensión</h3>
        </div>
        <div className="bg-white/50 p-3 rounded border border-rose-100 font-mono text-xs text-rose-800">
          {error}
        </div>
        <p className="text-rose-700 text-sm">
          Verifica que el archivo exista en la carpeta del plugin y sea válido.
        </p>
      </Card>
    );
  }

  if (!Component) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <div className="relative">
          <Loader2 className="animate-spin text-blue-500" size={40} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-1 h-1 bg-blue-500 rounded-full animate-ping" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-slate-900 font-medium tracking-tight">Cargando Componente Externo</p>
          <p className="text-slate-400 text-xs mt-1">Sincronizando con el Plugin SDK...</p>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-400">Renderizando...</div>}>
      <Component {...props} />
    </Suspense>
  );
};
