import React, { useEffect, useState, useCallback } from 'react';
import { Card, Badge, Button, Input, EmptyState, useToast } from '@openfactu/ui';
import { Shield, Key, Copy, Trash2, Eye, EyeOff, Plus } from 'lucide-react';
import { ApiError } from '@/shared/http';
import { devKeysApi } from '../api';
import type { DevKey } from '../domain/DevKeys';

export const DevKeysPanel: React.FC<{ token: string | null; user: any }> = ({ token, user }) => {
  const toast = useToast();
  const [keys, setKeys] = useState<DevKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKey, setNewKey] = useState<{ clientId: string; clientSecret: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const data = await devKeysApi.list();
      setKeys(Array.isArray(data) ? data : []);
    } catch {
      // silencioso: el panel se queda vacío, no es una acción del usuario
    } finally {
      setLoading(false);
    }
  }, [token, user?.tenantId]);

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
      const data = await devKeysApi.create(newKeyName);
      setNewKey({ clientId: data.clientId, clientSecret: data.clientSecret });
      setNewKeyName('');
      fetchKeys();
      toast.success('API Key generada');
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || 'Error al generar la key');
    } finally {
      setCreating(false);
    }
  };

  const deleteKey = async (id: string) => {
    try {
      await devKeysApi.remove(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
      toast.success('Key eliminada');
    } catch {
      toast.error('Error al eliminar la key');
    }
  };

  const toggleKey = async (id: string) => {
    try {
      const data = await devKeysApi.toggle(id);
      setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, isActive: data.isActive } : k)));
    } catch {
      toast.error('Error al cambiar el estado de la key');
    }
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
        <div className="mb-6 p-5 rounded-lg border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20">
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
                <code className="flex-1 bg-bg-card border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2 text-sm font-mono text-fg-default select-all">
                  {newKey.clientId}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(newKey.clientId, 'clientId')}
                  title="Copiar Client ID"
                >
                  <Copy
                    size={14}
                    className={copiedField === 'clientId' ? 'text-emerald-500' : undefined}
                  />
                </Button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Client Secret
              </label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 bg-bg-card border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2 text-sm font-mono text-fg-default select-all">
                  {newKey.clientSecret}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(newKey.clientSecret, 'clientSecret')}
                  title="Copiar Client Secret"
                >
                  <Copy
                    size={14}
                    className={copiedField === 'clientSecret' ? 'text-emerald-500' : undefined}
                  />
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-4 p-3 bg-bg-card rounded-lg">
            <p className="text-xs text-emerald-700 dark:text-emerald-300 font-mono">
              openfactu plugin push --server http://tu-servidor:3000 --client-id {newKey.clientId}{' '}
              --client-secret {newKey.clientSecret}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setNewKey(null)}
            className="mt-3"
          >
            Entendido, ya lo he guardado
          </Button>
        </div>
      )}

      {/* Crear nueva key */}
      <Card
        title="Credenciales de desarrollo"
        subtitle="Genera API Keys para desarrollar y subir plugins desde otros equipos."
      >
        <div className="flex gap-3 mb-6">
          <Input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Nombre de la key (ej: Mi PC de desarrollo)"
            containerClassName="flex-1"
            onKeyDown={(e) => e.key === 'Enter' && createKey()}
          />
          <Button variant="primary" onClick={createKey} isLoading={creating}>
            {!creating && <Plus size={14} />}
            {creating ? 'Generando...' : 'Generar Key'}
          </Button>
        </div>

        {/* Lista de keys */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 bg-bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : keys.length === 0 ? (
          <EmptyState
            icon={<Key size={32} />}
            title="No hay API Keys generadas"
            hint="Genera una para poder subir plugins desde otros equipos."
          />
        ) : (
          <div className="space-y-3">
            {keys.map((k) => (
              <div
                key={k.id}
                className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                  k.isActive
                    ? 'border-border-default bg-bg-card'
                    : 'border-border-default bg-bg-muted opacity-60'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      k.isActive
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-500'
                        : 'bg-bg-muted text-slate-400'
                    }`}
                  >
                    <Key size={16} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-fg-default">{k.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <code className="text-[11px] text-fg-subtle font-mono">{k.clientId}</code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(k.clientId, k.id)}
                        title="Copiar Client ID"
                      >
                        <Copy size={10} />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {k.lastUsedAt && (
                    <span className="text-[10px] text-fg-subtle">
                      Ultimo uso: {new Date(k.lastUsedAt).toLocaleDateString('es-ES')}
                    </span>
                  )}
                  <Badge variant={k.isActive ? 'success' : 'neutral'}>
                    {k.isActive ? 'Activa' : 'Inactiva'}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleKey(k.id)}
                    title={k.isActive ? 'Desactivar' : 'Activar'}
                  >
                    {k.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteKey(k.id)}
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Instrucciones */}
      <div className="mt-6 p-5 rounded-lg bg-bg-muted border border-border-default">
        <h4 className="font-semibold text-sm text-fg-default mb-3">Como usar las API Keys</h4>
        <div className="space-y-2 text-xs text-fg-muted font-mono">
          <p># Desde otro ordenador, sube tu plugin al servidor:</p>
          <p className="text-fg-body">
            openfactu plugin push ./mi-plugin --server http://tu-servidor:3000 --client-id ofk_...
            --client-secret ofs_...
          </p>
          <p className="mt-3"># O enlaza un plugin local para desarrollo:</p>
          <p className="text-fg-body">openfactu plugin link ./mi-plugin</p>
          <p className="text-fg-body">openfactu plugin dev mi-plugin</p>
        </div>
      </div>
    </div>
  );
};
