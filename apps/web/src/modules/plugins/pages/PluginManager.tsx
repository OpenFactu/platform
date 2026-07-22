import { coreApi, type RawResult } from '@/shared/api';
import React, { useEffect, useState, useCallback } from 'react';
import { Card, Badge, Button, useToast } from '@openfactu/ui';
import { Puzzle, Database, RefreshCw, Zap, Key } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { usePlugins } from '@/context/PluginContext';
import { DevKeysPanel } from '../components/DevKeysPanel';
import { PluginCard } from '../components/PluginCard';

export interface PluginInfo {
  id: string;
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  logo?: string;
  isActive: boolean;
  ui?: any;
}

export interface PluginField {
  pluginId: string;
  tableName: string;
  fieldName: string;
  fieldType: string;
  label: string;
}

export interface PluginTable {
  pluginId: string;
  tableName: string;
  definition: string;
}

export const PluginManager: React.FC = () => {
  const { token, user } = useAuth();
  const { reload: reloadManifests } = usePlugins();
  const toast = useToast();

  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [fields, setFields] = useState<PluginField[]>([]);
  const [tables, setTables] = useState<PluginTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [tab, setTab] = useState<'plugins' | 'dev'>('plugins');

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
  };

  const parseArray = async <T,>(res: RawResult): Promise<T[]> => {
    if (!res.ok) return [];
    const data = res.data;
    return Array.isArray(data) ? (data as T[]) : [];
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pluginsRes, fieldsRes, tablesRes] = await Promise.all([
        coreApi.raw('GET', '/api/plugins/available'),
        coreApi.raw('GET', '/api/plugins/fields'),
        coreApi.raw('GET', '/api/plugins/tables'),
      ]);
      setPlugins(await parseArray<PluginInfo>(pluginsRes));
      setFields(await parseArray<PluginField>(fieldsRes));
      setTables(await parseArray<PluginTable>(tablesRes));
    } catch (err) {
      toast.error('Error al cargar datos de plugins');
    } finally {
      setLoading(false);
    }
  }, [token, user?.tenantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const togglePlugin = async (pluginId: string, currentlyActive: boolean) => {
    setToggling(pluginId);
    const action = currentlyActive ? 'deactivate' : 'activate';

    try {
      const res = await coreApi.raw('POST', `/api/plugins/${pluginId}/${action}`);

      if (!res.ok) {
        const data = res.data;
        throw new Error(data.error || 'Error desconocido');
      }

      // Actualizar estado local inmediatamente
      setPlugins((prev) =>
        prev.map((p) => (p.id === pluginId ? { ...p, isActive: !currentlyActive } : p)),
      );

      // Recargar manifests del contexto global (afecta sidebar)
      reloadManifests();

      // Recargar fields/tables (pueden cambiar con activación)
      const [fieldsRes, tablesRes] = await Promise.all([
        coreApi.raw('GET', '/api/plugins/fields'),
        coreApi.raw('GET', '/api/plugins/tables'),
      ]);
      setFields(await parseArray<PluginField>(fieldsRes));
      setTables(await parseArray<PluginTable>(tablesRes));

      toast.success(
        currentlyActive ? `Plugin "${pluginId}" desactivado` : `Plugin "${pluginId}" activado`,
      );
    } catch (err) {
      toast.error(
        (err instanceof Error ? err.message : undefined) || 'Error al cambiar estado del plugin',
      );
    } finally {
      setToggling(null);
    }
  };

  const activeCount = plugins.filter((p) => p.isActive).length;

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Gestor de Plugins
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Gestiona extensiones y credenciales de desarrollo.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm text-slate-600 dark:text-slate-300">
            <Zap size={14} />
            <span>
              <strong>{activeCount}</strong> / {plugins.length} activos
            </span>
          </div>
          <Button variant="outline" onClick={fetchData} disabled={loading} className="gap-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refrescar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-8 border-b border-line dark:border-ink-700">
        <button
          onClick={() => setTab('plugins')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'plugins'
              ? 'border-accent text-accent'
              : 'border-transparent text-ink-500 dark:text-ink-400 hover:text-accent dark:hover:text-accent'
          }`}
        >
          <span className="flex items-center gap-2">
            <Puzzle size={15} /> Plugins
          </span>
        </button>
        {(user?.role === 'ADMIN' || user?.role === 'SUPERUSER') && (
          <button
            onClick={() => setTab('dev')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'dev'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <Key size={15} /> Desarrollo
            </span>
          </button>
        )}
      </div>

      {tab === 'dev' ? (
        <DevKeysPanel token={token} user={user} />
      ) : (
        <>
          {/* Plugin Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mb-10">
            {loading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-48 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse"
                  />
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
            <div className="text-center py-20 text-slate-400 dark:text-slate-500">
              <Puzzle size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No hay plugins instalados</p>
              <p className="text-sm mt-1">
                Coloca plugins en la carpeta{' '}
                <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                  /plugins/
                </code>{' '}
                del servidor.
              </p>
            </div>
          )}

          {/* DB Extensions */}
          {fields.length > 0 && (
            <Card
              title="Campos de Base de Datos"
              subtitle="Campos inyectados por plugins activos en los esquemas de tenant."
            >
              <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-200 rounded-lg text-sm">
                <Database size={16} />
                <span>Solo se muestran campos de plugins activos para esta empresa.</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left py-2 px-3 font-semibold text-slate-600 dark:text-slate-300">
                        Plugin
                      </th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-600 dark:text-slate-300">
                        Tabla
                      </th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-600 dark:text-slate-300">
                        Campo
                      </th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-600 dark:text-slate-300">
                        Tipo
                      </th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-600 dark:text-slate-300">
                        Etiqueta
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f, i) => (
                      <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                          {f.pluginId}
                        </td>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                          {f.tableName}
                        </td>
                        <td className="py-2 px-3">
                          <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">
                            {f.fieldName}
                          </code>
                        </td>
                        <td className="py-2 px-3">
                          <Badge variant="neutral">{f.fieldType}</Badge>
                        </td>
                        <td className="py-2 px-3 text-slate-500 dark:text-slate-400">{f.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tables.length > 0 && (
            <Card
              title="Tablas de Plugins"
              subtitle="Tablas creadas por extensiones activas."
              className="mt-6"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left py-2 px-3 font-semibold text-slate-600 dark:text-slate-300">
                        Plugin
                      </th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-600 dark:text-slate-300">
                        Tabla
                      </th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-600 dark:text-slate-300">
                        Estructura
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tables.map((t, i) => (
                      <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                          {t.pluginId}
                        </td>
                        <td className="py-2 px-3">
                          <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">
                            {t.tableName}
                          </code>
                        </td>
                        <td className="py-2 px-3">
                          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate max-w-xs block">
                            {t.definition}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
