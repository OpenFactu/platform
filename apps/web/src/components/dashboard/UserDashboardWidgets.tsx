import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import { Card } from '@openfactu/ui';
import { Chart } from '@openfactu/ui/charts';
import { LayoutGrid, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getDynamicImportApiBase } from '../../utils/dynamicImportBase';

type QueryResult =
  | { error: string }
  | { chartType: 'kpi'; value: unknown; label?: string }
  | { chartType: 'bar'; rows: Array<{ x: unknown; y: unknown }> }
  | { chartType: 'table'; columns: string[]; rows: Record<string, unknown>[] };

interface UserDashboardWidget {
  id: string;
  title: string;
  subtitle: string | null;
  kind: 'metric' | 'code' | 'query';
  metricKey: string | null;
  metricLabel: string | null;
  size: 'sm' | 'md' | 'lg' | 'full';
  value: number | null;
  queryResult?: QueryResult;
  displayOrder: number;
}

const SIZE_TO_COLS: Record<string, string> = {
  sm: 'lg:col-span-1',
  md: 'lg:col-span-2',
  lg: 'lg:col-span-3',
  full: 'lg:col-span-4',
};

/**
 * Carga dinámicamente el componente ESM de un widget tipo 'code' (compilado
 * on-the-fly por el server desde el código guardado en BD). Mismo patrón que
 * `PluginComponentLoader`, pero apuntando a /api/dashboard-widgets en vez de
 * /api/plugins/load.
 */
const CodeWidgetRenderer: React.FC<{ widgetId: string; tenantId: string }> = ({
  widgetId,
  tenantId,
}) => {
  const [Component, setComponent] = useState<React.ComponentType<any> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setComponent(null);
    setError(null);

    const apiBase = getDynamicImportApiBase();
    // `import()` dinámico no puede adjuntar headers (Authorization/x-tenant-id),
    // así que el tenant viaja como query param — el server lo acepta como
    // fallback solo en esta ruta (ver dashboardWidgets.ts).
    const url = `${apiBase}/api/dashboard-widgets/${widgetId}/component.js?tenantId=${tenantId}&t=${Date.now()}`;

    import(/* @vite-ignore */ url)
      .then((module) => {
        if (!isMounted) return;
        const Loaded =
          module.default ||
          module.Component ||
          Object.values(module).find((v) => typeof v === 'function');
        if (!Loaded) throw new Error('El componente no exporta nada renderizable (default).');
        setComponent(() => Loaded);
      })
      .catch((err: any) => {
        if (!isMounted) return;
        setError(err.message || 'Error al cargar el componente.');
      });

    return () => {
      isMounted = false;
    };
  }, [widgetId, tenantId]);

  if (error) {
    return (
      <div className="flex items-center gap-2 text-danger-fg text-xs">
        <AlertCircle size={14} /> {error}
      </div>
    );
  }
  if (!Component) {
    return (
      <div className="flex items-center justify-center py-6 text-fg-subtle">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }
  return <Component />;
};

/**
 * Renderiza un widget declarativo (Fase 5): el resultado ya viene resuelto
 * desde el server (`resolveQueryWidget`), aquí solo se pinta según
 * `chartType`. Sin fetch propio — los datos llegan en `w.queryResult`.
 */
const QueryWidgetRenderer: React.FC<{ result?: QueryResult }> = ({ result }) => {
  if (!result || !('chartType' in result)) {
    return (
      <div className="flex items-center gap-2 text-danger-fg text-xs py-2">
        <AlertCircle size={14} /> {(result && 'error' in result && result.error) || 'Sin datos'}
      </div>
    );
  }

  if (result.chartType === 'kpi') {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="p-2.5 rounded-xs bg-accent/10 text-accent">
          <LayoutGrid size={18} />
        </div>
        <p className="text-3xl font-black text-fg-default tabular-nums">
          {String(result.value ?? '—')}
        </p>
      </div>
    );
  }

  if (result.chartType === 'bar') {
    // El Chart del paquete trae ejes, rejilla, tooltip y paleta ya tematizados.
    // Antes esto eran ocho componentes de recharts con los colores del modo
    // oscuro calculados a mano y la barra en un verde fijo (#10b981).
    return (
      <Chart
        type="bar"
        data={result.rows}
        xKey="x"
        series={[{ key: 'y' }]}
        height={192}
        aria-label="Resultado de la consulta"
      />
    );
  }

  // table
  return (
    <div className="overflow-x-auto max-h-56">
      <table className="text-xs w-full">
        <thead>
          <tr className="text-left text-fg-subtle border-b border-border-subtle">
            {result.columns.map((c) => (
              <th key={c} className="pr-3 py-1 font-bold uppercase tracking-wider text-[10px]">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i} className="border-b border-border-subtle last:border-0">
              {result.columns.map((c) => (
                <td key={c} className="pr-3 py-1 text-fg-body">
                  {String(row[c] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * Renderiza los widgets de dashboard: métricas del catálogo curado,
 * componentes React del usuario (compilados on-the-fly), o widgets
 * declarativos propuestos por el asistente de IA (kpi/bar/table sobre una
 * consulta de solo lectura).
 */
export const UserDashboardWidgets: React.FC = () => {
  const { token, user } = useAuth();
  const [widgets, setWidgets] = useState<UserDashboardWidget[]>([]);

  useEffect(() => {
    if (!user?.tenantId) return;
    coreApi.get('/api/dashboard-widgets')
      .catch(() => ([]))
      .then((d) => setWidgets(Array.isArray(d) ? d : []))
      .catch(() => setWidgets([]));
  }, [token, user?.tenantId]);

  if (widgets.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {widgets.map((w) => (
        <div key={w.id} className={SIZE_TO_COLS[w.size] || SIZE_TO_COLS.md}>
          <Card title={w.title} subtitle={w.subtitle || w.metricLabel || undefined}>
            {w.kind === 'code' ? (
              <CodeWidgetRenderer widgetId={w.id} tenantId={user?.tenantId || ''} />
            ) : w.kind === 'query' ? (
              <QueryWidgetRenderer result={w.queryResult} />
            ) : (
              <div className="flex items-center gap-3 py-2">
                <div className="p-2.5 rounded-xs bg-accent/10 text-accent">
                  <LayoutGrid size={18} />
                </div>
                <p className="text-3xl font-black text-fg-default tabular-nums">
                  {w.value ?? '—'}
                </p>
              </div>
            )}
          </Card>
        </div>
      ))}
    </div>
  );
};
