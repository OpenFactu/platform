import { coreApi, type RawResult } from '@/shared/api';
import React, { useEffect, useState, useCallback } from 'react';
import { Card, Badge, Button, useToast } from '@openfactu/ui';
import {
  Puzzle,
  Database,
  RefreshCw,
  Shield,
  Zap,
  Power,
  Key,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  Plus,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { usePlugins } from '@/context/PluginContext';
import { PluginIcon } from '@/components/PluginIcon';

interface PluginInfo {
  id: string;
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  logo?: string;
  isActive: boolean;
  ui?: any;
}

interface PluginField {
  pluginId: string;
  tableName: string;
  fieldName: string;
  fieldType: string;
  label: string;
}

interface PluginTable {
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
    } catch (err: any) {
      toast.error(err.message || 'Error al cambiar estado del plugin');
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

// ── Dev Keys Panel ────────────────────────────────────────────

interface DevKey {
  id: string;
  clientId: string;
  name: string;
  permissions: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

const DevKeysPanel: React.FC<{ token: string | null; user: any }> = ({ token, user }) => {
  const toast = useToast();
  const [keys, setKeys] = useState<DevKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKey, setNewKey] = useState<{ clientId: string; clientSecret: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
  };

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await coreApi.raw('GET', '/api/dev-keys');
      if (res.ok) setKeys(res.data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const createKey = async () => {
    if (!newKeyName.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    setCreating(true);
    try {
      const res = await coreApi.raw('POST', '/api/dev-keys', { name: newKeyName });
      const data = res.data;
      if (res.ok) {
        setNewKey({ clientId: data.clientId, clientSecret: data.clientSecret });
        setNewKeyName('');
        fetchKeys();
        toast.success('API Key generada');
      } else {
        toast.error(data.error);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const deleteKey = async (id: string) => {
    try {
      const res = await coreApi.raw('DELETE', `/api/dev-keys/${id}`);
      if (res.ok) {
        setKeys((prev) => prev.filter((k) => k.id !== id));
        toast.success('Key eliminada');
      }
    } catch {}
  };

  const toggleKey = async (id: string) => {
    try {
      const res = await coreApi.raw('PATCH', `/api/dev-keys/${id}/toggle`);
      const data = res.data;
      if (res.ok) {
        setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, isActive: data.isActive } : k)));
      }
    } catch {}
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div>
      {/* Nuevo key generado — mostrar una sola vez */}
      {newKey && (
        <div className="mb-6 p-5 rounded-xl border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={18} className="text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-bold text-emerald-900 dark:text-emerald-100">API Key generada</h3>
          </div>
          <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-4">
            Guarda el Client Secret ahora. No se puede recuperar despues.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Client ID
              </label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 dark:text-slate-200 select-all">
                  {newKey.clientId}
                </code>
                <button
                  onClick={() => copyToClipboard(newKey.clientId, 'clientId')}
                  className="p-2 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-800 transition-colors"
                >
                  <Copy
                    size={14}
                    className={copiedField === 'clientId' ? 'text-emerald-500' : 'text-slate-400'}
                  />
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Client Secret
              </label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 dark:text-slate-200 select-all">
                  {newKey.clientSecret}
                </code>
                <button
                  onClick={() => copyToClipboard(newKey.clientSecret, 'clientSecret')}
                  className="p-2 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-800 transition-colors"
                >
                  <Copy
                    size={14}
                    className={
                      copiedField === 'clientSecret' ? 'text-emerald-500' : 'text-slate-400'
                    }
                  />
                </button>
              </div>
            </div>
          </div>
          <div className="mt-4 p-3 bg-white/50 dark:bg-slate-900/50 rounded-lg">
            <p className="text-xs text-emerald-700 dark:text-emerald-300 font-mono">
              openfactu plugin push --server http://tu-servidor:3000 --client-id {newKey.clientId}{' '}
              --client-secret {newKey.clientSecret}
            </p>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className="mt-3 text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            Entendido, ya lo he guardado
          </button>
        </div>
      )}

      {/* Crear nueva key */}
      <Card
        title="Credenciales de desarrollo"
        subtitle="Genera API Keys para desarrollar y subir plugins desde otros equipos."
      >
        <div className="flex gap-3 mb-6">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Nombre de la key (ej: Mi PC de desarrollo)"
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400"
            onKeyDown={(e) => e.key === 'Enter' && createKey()}
          />
          <Button variant="primary" onClick={createKey} disabled={creating} className="gap-2">
            <Plus size={14} />
            {creating ? 'Generando...' : 'Generar Key'}
          </Button>
        </div>

        {/* Lista de keys */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-16 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : keys.length === 0 ? (
          <div className="text-center py-12 text-slate-400 dark:text-slate-500">
            <Key size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No hay API Keys generadas</p>
            <p className="text-xs mt-1">Genera una para poder subir plugins desde otros equipos</p>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map((k) => (
              <div
                key={k.id}
                className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                  k.isActive
                    ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50'
                    : 'border-slate-200/50 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 opacity-60'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      k.isActive
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-500'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Key size={16} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                      {k.name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <code className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                        {k.clientId}
                      </code>
                      <button
                        onClick={() => copyToClipboard(k.clientId, k.id)}
                        className="text-slate-300 hover:text-slate-500 transition-colors"
                      >
                        <Copy size={10} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {k.lastUsedAt && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      Ultimo uso: {new Date(k.lastUsedAt).toLocaleDateString('es-ES')}
                    </span>
                  )}
                  <Badge variant={k.isActive ? 'success' : 'neutral'}>
                    {k.isActive ? 'Activa' : 'Inactiva'}
                  </Badge>
                  <button
                    onClick={() => toggleKey(k.id)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-400 hover:text-slate-600"
                    title={k.isActive ? 'Desactivar' : 'Activar'}
                  >
                    {k.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button
                    onClick={() => deleteKey(k.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors text-slate-400 hover:text-red-500"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Instrucciones */}
      <div className="mt-6 p-5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700">
        <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 mb-3">
          Como usar las API Keys
        </h4>
        <div className="space-y-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
          <p># Desde otro ordenador, sube tu plugin al servidor:</p>
          <p className="text-slate-700 dark:text-slate-300">
            openfactu plugin push ./mi-plugin --server http://tu-servidor:3000 --client-id ofk_...
            --client-secret ofs_...
          </p>
          <p className="mt-3"># O enlaza un plugin local para desarrollo:</p>
          <p className="text-slate-700 dark:text-slate-300">openfactu plugin link ./mi-plugin</p>
          <p className="text-slate-700 dark:text-slate-300">openfactu plugin dev mi-plugin</p>
        </div>
      </div>
    </div>
  );
};

// ── Plugin Card Component ────────────────────────────────────

interface PluginCardProps {
  plugin: PluginInfo;
  fields: PluginField[];
  tables: PluginTable[];
  onToggle: () => void;
  isToggling: boolean;
}

const PluginCard: React.FC<PluginCardProps> = ({
  plugin,
  fields,
  tables,
  onToggle,
  isToggling,
}) => {
  const extensionCount = fields.length + tables.length;

  return (
    <div
      className={`
        relative bg-white dark:bg-slate-900 rounded-xl border transition-all duration-200
        ${
          plugin.isActive
            ? 'border-emerald-300 dark:border-emerald-700 shadow-sm shadow-emerald-100 dark:shadow-none'
            : 'border-slate-200 dark:border-slate-800 opacity-75'
        }
      `}
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`
                w-11 h-11 rounded-xl flex items-center justify-center border shadow-sm overflow-hidden p-2
                ${
                  plugin.isActive
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-700'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                }
              `}
            >
              <PluginIcon
                iconName={plugin.logo}
                size={24}
                className={
                  plugin.isActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400 dark:text-slate-500'
                }
              />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 leading-tight">
                {plugin.name || plugin.id}
              </h3>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                {plugin.id}
              </span>
            </div>
          </div>

          {/* Toggle */}
          <button
            onClick={onToggle}
            disabled={isToggling}
            className={`
              relative w-12 h-7 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2
              ${isToggling ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
              ${
                plugin.isActive
                  ? 'bg-emerald-500 focus:ring-emerald-400'
                  : 'bg-slate-300 dark:bg-slate-600 focus:ring-slate-400'
              }
            `}
            title={plugin.isActive ? 'Desactivar plugin' : 'Activar plugin'}
          >
            <span
              className={`
                absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-200
                ${plugin.isActive ? 'translate-x-5.5 left-auto right-0.5' : 'left-0.5'}
              `}
              style={{
                transform: plugin.isActive ? 'translateX(0)' : 'translateX(0)',
                left: plugin.isActive ? 'auto' : '2px',
                right: plugin.isActive ? '2px' : 'auto',
              }}
            />
          </button>
        </div>

        {/* Description */}
        {plugin.description && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">
            {plugin.description}
          </p>
        )}

        {/* Footer info */}
        <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
          {plugin.version && (
            <span className="flex items-center gap-1">
              <Shield size={12} />v{plugin.version}
            </span>
          )}
          {extensionCount > 0 && (
            <span className="flex items-center gap-1">
              <Database size={12} />
              {extensionCount} {extensionCount === 1 ? 'extensión' : 'extensiones'} BD
            </span>
          )}
          {plugin.ui?.routes?.length > 0 && (
            <span className="flex items-center gap-1">
              <Power size={12} />
              {plugin.ui.routes.length} {plugin.ui.routes.length === 1 ? 'vista' : 'vistas'} UI
            </span>
          )}
          <span
            className={`
              ml-auto flex items-center gap-1 font-semibold
              ${plugin.isActive ? 'text-emerald-500' : 'text-slate-400 dark:text-slate-500'}
            `}
          >
            {plugin.isActive ? 'Activo' : 'Inactivo'}
          </span>
        </div>
      </div>
    </div>
  );
};
