import { coreApi } from '@/shared/api';
import React, { useEffect, useState, useCallback } from 'react';
import { Card, Badge, Button, useToast } from '@openfactu/ui';
import { Shield, Key, Copy, Trash2, Eye, EyeOff, Plus } from 'lucide-react';

interface DevKey {
  id: string;
  clientId: string;
  name: string;
  permissions: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export const DevKeysPanel: React.FC<{ token: string | null; user: any }> = ({ token, user }) => {
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : undefined);
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
