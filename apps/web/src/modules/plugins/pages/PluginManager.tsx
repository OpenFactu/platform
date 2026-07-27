import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Badge,
  Button,
  Tabs,
  Table,
  PageHeader,
  Skeleton,
  EmptyState,
  useToast,
} from '@openfactu/ui';
import type { TabItem, TableColumn } from '@openfactu/ui';
import { Puzzle, Database, RefreshCw, Zap, Key, LayoutGrid } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { usePlugins, useModules } from '@/context/PluginContext';
import { useTheme } from '@/context/ThemeContext';
import { ApiError } from '@/shared/http';
import { DevKeysPanel } from '../components/DevKeysPanel';
import { PluginCard } from '../components/PluginCard';
import { ModuleCard } from '../components/ModuleCard';
import { pluginsApi } from '../api';
import type { PluginInfo } from '../domain/PluginInfo';
import type { PluginField } from '../domain/PluginField';
import type { PluginTable } from '../domain/PluginTable';
import type { Module } from '@/modules';

/** Nombre de tabla/campo en monoespaciada, como en el resto de vistas técnicas. */
const codeCell = (text: string) => (
  <code className="bg-bg-muted px-1.5 py-0.5 rounded text-xs">{text}</code>
);

const FIELD_COLUMNS: TableColumn<PluginField>[] = [
  { header: 'Plugin', accessor: 'pluginId' },
  { header: 'Tabla', accessor: 'tableName' },
  { header: 'Campo', cell: (f) => codeCell(f.fieldName) },
  { header: 'Tipo', cell: (f) => <Badge variant="neutral">{f.fieldType}</Badge> },
  { header: 'Etiqueta', cell: (f) => <span className="text-fg-muted">{f.label}</span> },
];

const TABLE_COLUMNS: TableColumn<PluginTable>[] = [
  { header: 'Plugin', accessor: 'pluginId' },
  { header: 'Tabla', cell: (t) => codeCell(t.tableName) },
  {
    header: 'Estructura',
    cell: (t) => (
      <span className="text-xs font-mono text-fg-muted truncate max-w-xs block">
        {t.definition}
      </span>
    ),
  },
];

export const appsPluginManager: React.FC = () => {
  const { token, user } = useAuth();
  const { reload: reloadManifests } = usePlugins();
  const toast = useToast();

  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [fields, setFields] = useState<PluginField[]>([]);
  const [tables, setTables] = useState<PluginTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [togglingModule, setTogglingModule] = useState<string | null>(null);
  const [tab, setTab] = useState<'plugins' | 'dev'>('plugins');

  const allModules = useModules();
  const { flags, update } = useTheme();
  const activatableModules = allModules.filter((m) => Boolean(m.featureFlag));
  const modulesByCategory = activatableModules.reduce<Record<string, Module[]>>((acc, m) => {
    const cat = m.category || 'General';
    (acc[cat] = acc[cat] || []).push(m);
    return acc;
  }, {});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pluginsRes, fieldsRes, tablesRes] = await Promise.all([
        pluginsApi.list(),
        pluginsApi.fields(),
        pluginsApi.tables(),
      ]);
      setPlugins(Array.isArray(pluginsRes) ? pluginsRes : []);
      setFields(Array.isArray(fieldsRes) ? fieldsRes : []);
      setTables(Array.isArray(tablesRes) ? tablesRes : []);
    } catch {
      toast.error('Error al cargar datos de plugins');
    } finally {
      setLoading(false);
    }
  }, [user?.tenantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const togglePlugin = async (pluginId: string, currentlyActive: boolean) => {
    setToggling(pluginId);

    try {
      if (currentlyActive) {
        await pluginsApi.deactivate(pluginId);
      } else {
        await pluginsApi.activate(pluginId);
      }

      // Actualizar estado local inmediatamente
      setPlugins((prev) =>
        prev.map((p) => (p.id === pluginId ? { ...p, isActive: !currentlyActive } : p)),
      );

      // Recargar manifests del contexto global (afecta sidebar)
      reloadManifests();

      // Recargar fields/tables (pueden cambiar con activación)
      const [fieldsRes, tablesRes] = await Promise.all([pluginsApi.fields(), pluginsApi.tables()]);
      setFields(Array.isArray(fieldsRes) ? fieldsRes : []);
      setTables(Array.isArray(tablesRes) ? tablesRes : []);

      toast.success(
        currentlyActive ? `Plugin "${pluginId}" desactivado` : `Plugin "${pluginId}" activado`,
      );
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || 'Error al cambiar estado del plugin');
    } finally {
      setToggling(null);
    }
  };

  const toggleModule = async (mod: Module) => {
    if (!mod.featureFlag) return;
    const key = mod.featureFlag;
    const currentlyEnabled = !!(flags as unknown as Record<string, boolean>)[key];
    setTogglingModule(mod.id);
    try {
      await update('flags', { [key]: !currentlyEnabled });
      toast.success(
        currentlyEnabled ? `Módulo "${mod.label}" desactivado` : `Módulo "${mod.label}" activado`,
      );
    } catch {
      toast.error('Error al cambiar estado del módulo');
    } finally {
      setTogglingModule(null);
    }
  };

  const activeCount = plugins.filter((p) => p.isActive).length;

  // La pestaña de desarrollo sigue siendo sólo para ADMIN/SUPERUSER: se omite
  // del array en lugar de ocultarse con CSS.
  const tabItems: TabItem[] = [
    { key: 'plugins', label: 'Aplicaciones', icon: <LayoutGrid size={15} /> },
    ...(user?.role === 'ADMIN' || user?.role === 'SUPERUSER'
      ? [{ key: 'dev', label: 'Desarrollo', icon: <Key size={15} /> }]
      : []),
  ];

  return (
    <div className="p-4">
      <PageHeader
        title="Apps"
        subtitle="Activa o desactiva módulos y plugins para esta empresa."
        size="lg"
        className="mb-6"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-muted rounded-lg text-sm text-fg-body">
              <Zap size={14} />
              <span>
                <strong>{activeCount}</strong> / {plugins.length} activos
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={fetchData}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Refrescar
            </Button>
          </div>
        }
      />

      <Tabs
        items={tabItems}
        value={tab}
        onChange={(k) => setTab(k as 'plugins' | 'dev')}
        className="mb-8"
      />

      {tab === 'dev' ? (
        <DevKeysPanel token={token} user={user} />
      ) : (
        <>
          {/* Módulos core activables, agrupados por categoría */}
          {Object.entries(modulesByCategory).map(([category, mods]) => (
            <div key={category} className="mb-8">
              <h3 className="text-sm font-bold uppercase tracking-wide text-fg-muted mb-3">
                {category}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {mods.map((mod) => (
                  <ModuleCard
                    key={mod.id}
                    module={mod}
                    enabled={
                      !!(flags as unknown as Record<string, boolean>)[mod.featureFlag as string]
                    }
                    onToggle={() => toggleModule(mod)}
                    isToggling={togglingModule === mod.id}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Plugin Cards Grid */}
          <h3 className="text-sm font-bold uppercase tracking-wide text-fg-muted mb-3">Plugins</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mb-10">
            {loading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} variant="rect" height={192} radius="lg" delayMs={i * 80} />
                ))
              : plugins.map((plugin) => (
                  <PluginCard
                    key={plugin.id}
                    plugin={plugin}
                    fields={fields.filter((f) => f.pluginId === plugin.id)}
                    tables={tables.filter((t) => t.pluginId === plugin.id)}
                    onToggle={() => togglePlugin(plugin.id, plugin.isActive)}
                    isToggling={toggling === plugin.id}
                  />
                ))}
          </div>

          {plugins.length === 0 && !loading && (
            <EmptyState
              icon={<Puzzle size={48} />}
              title="No hay plugins instalados"
              hint="Coloca plugins en la carpeta /plugins/ del servidor."
              className="py-20"
            />
          )}

          {/* DB Extensions */}
          {fields.length > 0 && (
            <Card
              title="Campos de Base de Datos"
              subtitle="Campos inyectados por plugins activos en los esquemas de tenant."
            >
              <div className="flex items-center gap-2 mb-4 p-3 bg-info-bg text-info-fg rounded-lg text-sm">
                <Database size={16} />
                <span>Solo se muestran campos de plugins activos para esta empresa.</span>
              </div>
              <Table columns={FIELD_COLUMNS} data={fields} rowKey={(_f, i) => i} />
            </Card>
          )}

          {tables.length > 0 && (
            <Card
              title="Tablas de Plugins"
              subtitle="Tablas creadas por extensiones activas."
              className="mt-6"
            >
              <Table columns={TABLE_COLUMNS} data={tables} rowKey={(_t, i) => i} />
            </Card>
          )}
        </>
      )}
    </div>
  );
};
