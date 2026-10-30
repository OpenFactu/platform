import { Spinner } from '@openfactu/ui';
import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { t } from '@/i18n/i18n';

/**
 * Renderiza un componente React que Keiro generó en el propio turno
 * (`render_component`) — mismo mecanismo que los widgets de dashboard tipo
 * 'code' (esbuild server-side vía `transpileSource`, imports externos
 * reescritos a las URLs del SDK del propio server), pero SIN persistir nada:
 * el JS ya compilado llega como texto en el output de la tool y se carga
 * desde una Blob URL — `import()` dinámico admite blob: igual que una URL
 * http normal, así que no hace falta una ruta de servidor ni guardar en BD.
 */
export const ComponentRenderer: React.FC<{ compiledCode: string }> = ({ compiledCode }) => {
  const [Component, setComponent] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setComponent(null);
    setError(null);

    const blob = new Blob([compiledCode], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);

    import(/* @vite-ignore */ url)
      .then((module) => {
        if (!isMounted) return;
        const Loaded =
          module.default ||
          module.Component ||
          Object.values(module).find((v) => typeof v === 'function');
        if (!Loaded) throw new Error(t('ai.component.noExport'));
        setComponent(() => Loaded);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : t('ai.component.loadError'));
      })
      .finally(() => URL.revokeObjectURL(url));

    return () => {
      isMounted = false;
    };
  }, [compiledCode]);

  if (error) {
    return (
      <div className="flex items-center gap-2 text-rose-600 dark:text-rose-300 text-xs p-2 rounded-md border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20">
        <AlertCircle size={14} className="shrink-0" /> {error}
      </div>
    );
  }
  if (!Component) {
    return (
      <div className="flex items-center justify-center py-6 text-slate-400">
        <Spinner size="md" tone="inherit" />
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border-default p-3 overflow-x-auto">
      <Component />
    </div>
  );
};
