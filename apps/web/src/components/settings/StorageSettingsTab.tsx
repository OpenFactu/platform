/**
 * Tab "Almacenamiento" dentro de Configuración. Permite elegir el backend de
 * adjuntos del tenant: local, Google Drive, OneDrive. La estructura es
 * adapter-based en backend, así que cambiar el provider es solo cambiar este
 * dropdown — los archivos viejos siguen accesibles porque cada fila Attachment
 * recuerda con qué provider se subió.
 *
 * Para Drive y OneDrive el flujo de OAuth llegará en sus respectivas fases.
 * Por ahora dejamos los inputs de credenciales preparados pero la conexión
 * real solo funciona con `local`.
 */

import React, { useEffect, useState } from 'react';
import { Card, Button, Input, useToast } from '@openfactu/ui';
import { HardDrive, Cloud, CheckCircle2, AlertTriangle, Save } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

type Provider = 'local' | 'gdrive' | 'onedrive';

interface StorageConfig {
  provider?: Provider;
  local?: { basePath?: string };
  gdrive?: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    rootFolderId?: string;
  };
  onedrive?: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    rootFolderId?: string;
  };
}

export const StorageSettingsTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [config, setConfig] = useState<StorageConfig>({ provider: 'local' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState<{ ok: boolean; provider: string; detail?: string } | null>(
    null,
  );

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token ?? ''}`,
    'x-tenant-id': user?.tenantId ?? '',
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/config/storage', { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const cfg = await res.json();
        setConfig({ provider: 'local', ...cfg });
      } catch {
        toast.error('No se pudo cargar la configuración de almacenamiento');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/config/storage', {
        method: 'PUT',
        headers,
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Configuración guardada');
    } catch (e: any) {
      toast.error(e?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const runHealth = async () => {
    setHealth(null);
    try {
      const res = await fetch('/api/config/storage/healthcheck', {
        method: 'POST',
        headers,
      });
      const body = await res.json();
      setHealth(body);
    } catch (e: any) {
      setHealth({ ok: false, provider: 'unknown', detail: e?.message });
    }
  };

  if (loading)
    return (
      <Card>
        <div className="p-6 text-sm text-slate-400 italic">Cargando…</div>
      </Card>
    );

  const provider = config.provider || 'local';
  const updateProvider = (p: Provider) => setConfig((c) => ({ ...c, provider: p }));

  return (
    <div className="space-y-6">
      <Card>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <HardDrive size={18} />
            <h2 className="text-lg font-bold">Backend de almacenamiento</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-snug">
            Elige dónde se guardan los archivos adjuntos del ERP. Puedes cambiarlo en cualquier
            momento — los archivos ya subidos seguirán descargándose desde su backend original.
          </p>

          <div className="grid grid-cols-3 gap-2">
            <ProviderCard
              icon={<HardDrive size={18} />}
              label="Local"
              active={provider === 'local'}
              ready
              onClick={() => updateProvider('local')}
            />
            <ProviderCard
              icon={<Cloud size={18} />}
              label="Google Drive"
              active={provider === 'gdrive'}
              ready={false}
              onClick={() => updateProvider('gdrive')}
            />
            <ProviderCard
              icon={<Cloud size={18} />}
              label="OneDrive"
              active={provider === 'onedrive'}
              ready={false}
              onClick={() => updateProvider('onedrive')}
            />
          </div>
        </div>
      </Card>

      {provider === 'local' && (
        <Card>
          <div className="p-6 space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Configuración local
            </h3>
            <Input
              label="Ruta base (opcional)"
              placeholder="Por defecto: <repo>/storage/uploads"
              value={config.local?.basePath ?? ''}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  local: { ...c.local, basePath: e.target.value || undefined },
                }))
              }
            />
            <p className="text-[11px] text-slate-400 leading-snug">
              Si dejas vacío usa la carpeta por defecto montada en el contenedor server. Útil si
              quieres apuntar a un volumen externo (NAS, disco dedicado, etc.).
            </p>
          </div>
        </Card>
      )}

      {(provider === 'gdrive' || provider === 'onedrive') && (
        <Card>
          <div className="p-6 space-y-3">
            <div className="rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/20 p-4 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                El adapter de <strong>{provider === 'gdrive' ? 'Google Drive' : 'OneDrive'}</strong>{' '}
                aún no está implementado. Mientras tanto, las subidas se guardan en local. Las
                credenciales que rellenes aquí se guardarán para cuando el adapter esté listo.
              </span>
            </div>
            <Input
              label="Client ID"
              value={(config as any)[provider]?.clientId ?? ''}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  [provider]: { ...(c as any)[provider], clientId: e.target.value },
                }))
              }
            />
            <Input
              label="Client Secret"
              type="password"
              value={(config as any)[provider]?.clientSecret ?? ''}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  [provider]: { ...(c as any)[provider], clientSecret: e.target.value },
                }))
              }
            />
            <Input
              label="Refresh token"
              type="password"
              value={(config as any)[provider]?.refreshToken ?? ''}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  [provider]: { ...(c as any)[provider], refreshToken: e.target.value },
                }))
              }
            />
            <Input
              label="Carpeta raíz (ID)"
              placeholder="ID de la carpeta donde colgar los archivos"
              value={(config as any)[provider]?.rootFolderId ?? ''}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  [provider]: { ...(c as any)[provider], rootFolderId: e.target.value },
                }))
              }
            />
          </div>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          <Save size={16} className="mr-2" />
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
        <Button variant="secondary" onClick={runHealth} disabled={saving}>
          Probar conexión
        </Button>
        {health && (
          <span
            className={`text-xs flex items-center gap-1 ${
              health.ok
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-500 dark:text-rose-400'
            }`}
          >
            {health.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            {health.provider} — {health.ok ? 'OK' : 'falla'}
            {health.detail && ` · ${health.detail}`}
          </span>
        )}
      </div>
    </div>
  );
};

const ProviderCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  ready: boolean;
  onClick: () => void;
}> = ({ icon, label, active, ready, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-sm font-bold ${
      active
        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200'
        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
    }`}
  >
    {icon}
    <span>{label}</span>
    {!ready && (
      <span className="text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
        en desarrollo
      </span>
    )}
  </button>
);
