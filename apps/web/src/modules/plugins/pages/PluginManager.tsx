import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
import { useI18n } from '@/i18n/I18nContext';

/** Nombre de tabla/campo en monoespaciada, como en el resto de vistas técnicas. */
const codeCell = (text: string) => (
  <code className="bg-bg-muted px-1.5 py-0.5 rounded text-xs">{text}</code>
);

// Las cabeceras guardan la CLAVE de i18n; se traducen al pintar (ver `fieldColumns`).
const FIELD_COLUMNS: TableColumn<PluginField>[] = [
  { header: 'plugins.manager.columns.plugin', accessor: 'pluginId' },
  { header: 'plugins.manager.columns.table', accessor: 'tableName' },
  { header: 'plugins.manager.columns.field', cell: (f) => codeCell(f.fieldName) },
  {
    header: 'plugins.manager.columns.type',
    cell: (f) => <Badge variant="neutral">{f.fieldType}</Badge>,
  },
  {
    header: 'plugins.manager.columns.label',
    cell: (f) => <span className="text-fg-muted">{f.label}</span>,
  },
];

const TABLE_COLUMNS: TableColumn<PluginTable>[] = [
  { header: 'plugins.manager.columns.plugin', accessor: 'pluginId' },
  { header: 'plugins.manager.columns.table', cell: (t) => codeCell(t.tableName) },
  {
    header: 'plugins.manager.columns.structure',
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
  const { t } = useI18n();
  const fieldColumns = useMemo(
    () => FIELD_COLUMNS.map((c) => ({ ...c, header: t(c.header as string) })),
    [t],
  );
  const tableColumns = useMemo(
    () => TABLE_COLUMNS.map((c) => ({ ...c, header: t(c.header as string) })),
    [t],
  );

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
    // Se agrupa por la etiqueta YA traducida: dos módulos pueden usar claves
    // distintas para la misma categoría.
    const cat = t(m.category || 'plugins.manager.generalCategory');
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
      toast.error(t('plugins.manager.loadError'));
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
        currentlyActive
          ? t('plugins.manager.pluginDeactivated', { id: pluginId })
          : t('plugins.manager.pluginActivated', { id: pluginId }),
      );
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('plugins.manager.pluginToggleError'));
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
        currentlyEnabled
          ? t('plugins.manager.moduleDeactivated', { name: t(mod.label) })
          : t('plugins.manager.moduleActivated', { name: t(mod.label) }),
      );
    } catch {
      toast.error(t('plugins.manager.moduleToggleError'));
    } finally {
      setTogglingModule(null);
    }
  };

  const activeCount = plugins.filter((p) => p.isActive).length;

  // La pestaña de desarrollo sigue siendo sólo para ADMIN/SUPERUSER: se omite
  // del array en lugar de ocultarse con CSS.
  const tabItems: TabItem[] = [
    { key: 'plugins', label: t('plugins.manager.tabApps'), icon: <LayoutGrid size={15} /> },
    ...(user?.role === 'ADMIN' || user?.role === 'SUPERUSER'
      ? [{ key: 'dev', label: t('plugins.manager.tabDev'), icon: <Key size={15} /> }]
      : []),
  ];

  return (
    <div className="p-4">
      <PageHeader
        title={t('plugins.manager.title')}
        subtitle={t('plugins.manager.subtitle')}
        size="lg"
        className="mb-6"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-muted rounded-lg text-sm text-fg-body">
              <Zap size={14} />
              <span>
                <strong>{activeCount}</strong> / {plugins.length}{' '}
                {t('plugins.manager.activeSuffix')}
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
              {t('plugins.manager.refresh')}
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
          <h3 className="text-sm font-bold uppercase tracking-wide text-fg-muted mb-3">
            {t('plugins.manager.pluginsHeading')}
          </h3>
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
              icon={<Puzzle size={18} />}
              title={t('plugins.manager.emptyTitle')}
              hint={t('plugins.manager.emptyHint')}
              className="py-20"
            />
          )}

          {/* DB Extensions */}
          {fields.length > 0 && (
            <Card
              title={t('plugins.manager.fieldsTitle')}
              subtitle={t('plugins.manager.fieldsSubtitle')}
            >
              <div className="flex items-center gap-2 mb-4 p-3 bg-info-bg text-info-fg rounded-lg text-sm">
                <Database size={16} />
                <span>{t('plugins.manager.fieldsNotice')}</span>
              </div>
              <Table
                className="max-md:p-3"
                columns={fieldColumns}
                data={fields}
                rowKey={(_f, i) => i}
              />
            </Card>
          )}

          {tables.length > 0 && (
            <Card
              title={t('plugins.manager.tablesTitle')}
              subtitle={t('plugins.manager.tablesSubtitle')}
              className="mt-6"
            >
              <Table
                className="max-md:p-3"
                columns={tableColumns}
                data={tables}
                rowKey={(_t, i) => i}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
};
