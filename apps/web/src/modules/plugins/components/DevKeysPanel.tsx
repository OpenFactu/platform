import React, { useEffect, useState, useCallback } from 'react';
import { Card, Badge, Button, Input, EmptyState, useToast, CopyButton } from '@openfactu/ui';
import { Shield, Key, Trash2, Eye, EyeOff, Plus } from 'lucide-react';
import { ApiError } from '@/shared/http';
import { devKeysApi } from '../api';
import type { DevKey } from '../domain/DevKeys';
import { useI18n } from '@/i18n/I18nContext';
import { formatDate } from '@/i18n/format';

export const DevKeysPanel: React.FC<{ token: string | null; user: any }> = ({ token, user }) => {
  const toast = useToast();
  const { t } = useI18n();
  const [keys, setKeys] = useState<DevKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKey, setNewKey] = useState<{ clientId: string; clientSecret: string } | null>(null);

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
      toast.error(t('plugins.devKeys.nameRequired'));
      return;
    }
    setCreating(true);
    try {
      const data = await devKeysApi.create(newKeyName);
      setNewKey({ clientId: data.clientId, clientSecret: data.clientSecret });
      setNewKeyName('');
      fetchKeys();
      toast.success(t('plugins.devKeys.generated'));
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('plugins.devKeys.generateError'));
    } finally {
      setCreating(false);
    }
  };

  const deleteKey = async (id: string) => {
    try {
      await devKeysApi.remove(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
      toast.success(t('plugins.devKeys.deleted'));
    } catch {
      toast.error(t('plugins.devKeys.deleteError'));
    }
  };

  const toggleKey = async (id: string) => {
    try {
      const data = await devKeysApi.toggle(id);
      setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, isActive: data.isActive } : k)));
    } catch {
      toast.error(t('plugins.devKeys.toggleError'));
    }
  };

  return (
    <div>
      {/* Nuevo key generado — mostrar una sola vez */}
      {newKey && (
        <div className="mb-6 p-5 rounded-lg border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={18} className="text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-bold text-emerald-900 dark:text-emerald-100">
              {t('plugins.devKeys.generated')}
            </h3>
          </div>
          <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-4">
            {t('plugins.devKeys.saveSecretNow')}
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
                <CopyButton
                  value={newKey.clientId}
                  variant="ghost"
                  iconOnly
                  label={t('plugins.devKeys.copyClientId')}
                />
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
                <CopyButton
                  value={newKey.clientSecret}
                  variant="ghost"
                  iconOnly
                  label={t('plugins.devKeys.copySecret')}
                />
              </div>
            </div>
          </div>
          <div className="mt-4 p-3 bg-bg-card rounded-lg">
            <p className="text-xs text-emerald-700 dark:text-emerald-300 font-mono">
              openfactu plugin push --server http://{t('plugins.devKeys.serverPlaceholder')}:3000
              --client-id {newKey.clientId} --client-secret {newKey.clientSecret}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setNewKey(null)}
            className="mt-3"
          >
            {t('plugins.devKeys.savedAck')}
          </Button>
        </div>
      )}

      {/* Crear nueva key */}
      <Card title={t('plugins.devKeys.title')} subtitle={t('plugins.devKeys.subtitle')}>
        <div className="flex gap-3 mb-6">
          <Input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder={t('plugins.devKeys.namePlaceholder')}
            containerClassName="flex-1"
            onKeyDown={(e) => e.key === 'Enter' && createKey()}
          />
          <Button variant="primary" onClick={createKey} isLoading={creating}>
            {!creating && <Plus size={14} />}
            {creating ? t('plugins.devKeys.generating') : t('plugins.devKeys.generate')}
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
            title={t('plugins.devKeys.emptyTitle')}
            hint={t('plugins.devKeys.emptyHint')}
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
                      <CopyButton
                        value={k.clientId}
                        variant="ghost"
                        iconOnly
                        label={t('plugins.devKeys.copyClientId')}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {k.lastUsedAt && (
                    <span className="text-[10px] text-fg-subtle">
                      {t('plugins.devKeys.lastUsed', { date: formatDate(k.lastUsedAt) })}
                    </span>
                  )}
                  <Badge variant={k.isActive ? 'success' : 'neutral'}>
                    {k.isActive ? t('plugins.devKeys.active') : t('plugins.devKeys.inactive')}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleKey(k.id)}
                    title={
                      k.isActive ? t('plugins.devKeys.deactivate') : t('plugins.devKeys.activate')
                    }
                  >
                    {k.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteKey(k.id)}
                    title={t('plugins.devKeys.delete')}
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
        <h4 className="font-semibold text-sm text-fg-default mb-3">
          {t('plugins.devKeys.howToTitle')}
        </h4>
        <div className="space-y-2 text-xs text-fg-muted font-mono">
          <p># {t('plugins.devKeys.howToPush')}</p>
          <p className="text-fg-body">
            openfactu plugin push ./{t('plugins.devKeys.pluginPlaceholder')} --server http://
            {t('plugins.devKeys.serverPlaceholder')}:3000 --client-id ofk_... --client-secret
            ofs_...
          </p>
          <p className="mt-3"># {t('plugins.devKeys.howToLink')}</p>
          <p className="text-fg-body">
            openfactu plugin link ./{t('plugins.devKeys.pluginPlaceholder')}
          </p>
          <p className="text-fg-body">
            openfactu plugin dev {t('plugins.devKeys.pluginPlaceholder')}
          </p>
        </div>
      </div>
    </div>
  );
};
