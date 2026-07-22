/**
 * Tab "Almacenamiento" dentro de Configuración. Permite elegir el backend de
 * adjuntos del tenant: local, Google Drive, OneDrive. La estructura es
 * adapter-based en backend, así que cambiar el provider es solo cambiar este
 * dropdown — los archivos viejos siguen accesibles porque cada fila Attachment
 * recuerda con qué provider se subió.
 *
 * Google Drive y OneDrive se conectan por OAuth: el botón "Conectar" abre un
 * popup del proveedor y el server guarda el refresh token cifrado. Por defecto
 * se usa la app OAuth global del servidor; opcionalmente el tenant puede usar
 * credenciales propias (sección avanzada).
 *
 * Importante: "qué panel se está viendo" (`viewProvider`) y "qué backend está
 * realmente activo" (`config.provider`, lo que usan las subidas) son cosas
 * distintas. Clicar una pestaña de Drive/OneDrive solo cambia la vista — el
 * backend activo NUNCA pasa a un proveedor cloud sin conexión OAuth real:
 * o bien se conecta con éxito (se activa solo, automáticamente), o bien ya
 * estaba conectado de antes y el usuario pulsa Guardar para volver a él.
 * Antes de este ajuste, pulsar "Conectar" persistía `provider=onedrive` de
 * inmediato — si el popup se cancelaba o fallaba, el tenant se quedaba con
 * el backend activo apuntando a una conexión que nunca se completó.
 */

import { coreApi } from '@/shared/api';
import React, { useEffect, useRef, useState } from 'react';
import { Card, Button, Input, useToast } from '@openfactu/ui';
import { HardDrive, Cloud, CheckCircle2, AlertTriangle, Save, Link2, Unlink } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

type Provider = 'local' | 'gdrive' | 'onedrive';
type CloudProvider = 'gdrive' | 'onedrive';

interface CloudSectionConfig {
  clientId?: string;
  clientSecret?: string;
  rootFolderId?: string;
}

interface StorageConfig {
  provider?: Provider;
  local?: { basePath?: string };
  gdrive?: CloudSectionConfig;
  onedrive?: CloudSectionConfig;
}

interface OAuthProviderStatus {
  connected: boolean;
  status: string;
  credSource: string;
  connectedEmail: string;
  connectedAt: string;
  globalAvailable: boolean;
  tenantCredsSet: boolean;
}

type OAuthStatus = Record<CloudProvider, OAuthProviderStatus>;

const PROVIDER_LABELS: Record<CloudProvider, string> = {
  gdrive: 'Google Drive',
  onedrive: 'OneDrive',
};

/** Centinela que el server devuelve en lugar de un secreto ya guardado. */
const SECRET_SET = '__SET__';

export const StorageSettingsTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [config, setConfig] = useState<StorageConfig>({ provider: 'local' });
  // Panel que se está viendo/editando — independiente del backend realmente
  // activo (config.provider). Ver comentario de cabecera.
  const [viewProvider, setViewProvider] = useState<Provider>('local');
  const [oauth, setOauth] = useState<OAuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [health, setHealth] = useState<{ ok: boolean; provider: string; detail?: string } | null>(
    null,
  );
  const popupRef = useRef<Window | null>(null);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token ?? ''}`,
    'x-tenant-id': user?.tenantId ?? '',
  };

  const loadOauthStatus = async (): Promise<OAuthStatus | null> => {
    try {
      const res = await coreApi.raw('GET', '/api/config/storage/oauth/status');
      if (!res.ok) return null;
      const body = res.data;
      setOauth(body);
      return body;
    } catch {
      // el estado OAuth es informativo; no rompemos la pantalla
      return null;
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await coreApi.raw('GET', '/api/config/storage');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const cfg = res.data;
        setConfig({ provider: 'local', ...cfg });
        setViewProvider(cfg.provider || 'local');
        await loadOauthStatus();
      } catch {
        toast.error('No se pudo cargar la configuración de almacenamiento');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** PUT parcial — el server solo toca las claves incluidas en el body. */
  const patchConfig = async (patch: Record<string, any>): Promise<StorageConfig | null> => {
    const res = await coreApi.raw('PUT', '/api/config/storage', patch);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cfg = res.data;
    setConfig({ provider: 'local', ...cfg });
    return cfg;
  };

  // Resultado del popup OAuth (postMessage desde el callback del server)
  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== 'keirost-oauth') return;
      setConnecting(false);
      popupRef.current = null;
      const provider = data.provider as CloudProvider;
      if (data.ok) {
        toast.success(`${PROVIDER_LABELS[provider] || provider} conectado`);
        const status = await loadOauthStatus();
        // Se acaba de conectar de verdad: ahora sí, activarlo como backend.
        if (status?.[provider]?.connected) {
          try {
            await patchConfig({ provider });
            setViewProvider(provider);
          } catch {
            toast.error('Conectado, pero no se pudo activar como backend activo — pulsa Guardar');
          }
        }
      } else {
        toast.error(`Error al conectar: ${data.detail || 'desconocido'}`);
        await loadOauthStatus();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const patch: Record<string, any> =
        viewProvider === 'local'
          ? { local: config.local }
          : { [viewProvider]: config[viewProvider] };
      // Solo activamos el proveedor visto si es local, o si el cloud ya está
      // conectado de antes (volver a un backend previamente autorizado no
      // requiere pasar por OAuth otra vez).
      if (viewProvider === 'local' || oauth?.[viewProvider as CloudProvider]?.connected) {
        patch.provider = viewProvider;
      }
      await patchConfig(patch);
      toast.success('Configuración guardada');
    } catch (e: any) {
      toast.error(e?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const connect = async (p: CloudProvider) => {
    // Abrimos el popup ya (dentro del gesto de usuario, antes de cualquier
    // await) para que el bloqueador de popups no lo mate.
    const popup = window.open('about:blank', 'keirost-oauth', 'width=560,height=680');
    popupRef.current = popup;
    setConnecting(true);
    try {
      // Persistimos solo la sección de credenciales (NO `provider`) por si
      // hay clientId/clientSecret propios recién escritos — el backend activo
      // no cambia hasta que la conexión OAuth termine con éxito.
      await patchConfig({ [p]: config[p] });
      const res = await coreApi.raw('GET', `/api/config/storage/oauth/${p}/url`);
      const body = res.data;
      if (!res.ok || !body.url) throw new Error(body.error || `HTTP ${res.status}`);
      if (popup) popup.location.href = body.url;
      else toast.error('El navegador bloqueó la ventana de conexión');
    } catch (e: any) {
      popup?.close();
      setConnecting(false);
      toast.error(e?.message || 'Error al iniciar la conexión');
    }
  };

  const disconnect = async (p: CloudProvider) => {
    if (
      !window.confirm(
        `¿Desconectar ${PROVIDER_LABELS[p]}? Los backups y subidas a este proveedor dejarán de funcionar.`,
      )
    ) {
      return;
    }
    try {
      const res = await coreApi.raw('POST', `/api/config/storage/oauth/${p}/disconnect`);
      if (!res.ok) throw new Error((res.data)?.error || `HTTP ${res.status}`);
      toast.success(`${PROVIDER_LABELS[p]} desconectado`);
      const cfgRes = await coreApi.raw('GET', '/api/config/storage');
      if (cfgRes.ok) {
        const cfg = cfgRes.data;
        setConfig({ provider: 'local', ...cfg });
        setViewProvider(cfg.provider || 'local');
      }
      await loadOauthStatus();
    } catch (e: any) {
      toast.error(e?.message || 'Error al desconectar');
    }
  };

  const runHealth = async () => {
    setHealth(null);
    try {
      const res = await coreApi.raw('POST', '/api/config/storage/healthcheck');
      const body = res.data;
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

  const activeProvider = config.provider || 'local';
  const updateCloudField = (p: CloudProvider, field: keyof CloudSectionConfig, value: string) =>
    setConfig((c) => ({ ...c, [p]: { ...(c as any)[p], [field]: value } }));

  return (
    <div className="space-y-6">
      <Card>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <HardDrive size={18} />
            <h2 className="text-lg font-bold">Backend de almacenamiento</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-snug">
            Backend activo ahora mismo:{' '}
            <strong>
              {activeProvider === 'local'
                ? 'Local'
                : PROVIDER_LABELS[activeProvider as CloudProvider]}
            </strong>
            . Puedes explorar los otros paneles sin cambiar nada — solo se activa un backend nuevo
            al conectarlo (o al pulsar Guardar si ya estaba conectado).
          </p>

          <div className="grid grid-cols-3 gap-2">
            <ProviderCard
              icon={<HardDrive size={18} />}
              label="Local"
              active={activeProvider === 'local'}
              viewing={viewProvider === 'local'}
              onClick={() => setViewProvider('local')}
            />
            <ProviderCard
              icon={<Cloud size={18} />}
              label="Google Drive"
              active={activeProvider === 'gdrive'}
              viewing={viewProvider === 'gdrive'}
              connected={oauth?.gdrive?.connected}
              onClick={() => setViewProvider('gdrive')}
            />
            <ProviderCard
              icon={<Cloud size={18} />}
              label="OneDrive"
              active={activeProvider === 'onedrive'}
              viewing={viewProvider === 'onedrive'}
              connected={oauth?.onedrive?.connected}
              onClick={() => setViewProvider('onedrive')}
            />
          </div>
        </div>
      </Card>

      {viewProvider === 'local' && (
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

      {(viewProvider === 'gdrive' || viewProvider === 'onedrive') && (
        <CloudProviderPanel
          provider={viewProvider}
          status={oauth?.[viewProvider]}
          section={(config as any)[viewProvider] || {}}
          connecting={connecting}
          onConnect={() => connect(viewProvider)}
          onDisconnect={() => disconnect(viewProvider)}
          onFieldChange={(field, value) => updateCloudField(viewProvider, field, value)}
        />
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

const CloudProviderPanel: React.FC<{
  provider: CloudProvider;
  status?: OAuthProviderStatus;
  section: CloudSectionConfig;
  connecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onFieldChange: (field: keyof CloudSectionConfig, value: string) => void;
}> = ({ provider, status, section, connecting, onConnect, onDisconnect, onFieldChange }) => {
  const label = PROVIDER_LABELS[provider];
  const canConnect =
    Boolean(status?.globalAvailable || status?.tenantCredsSet) ||
    Boolean(section.clientId && section.clientSecret && section.clientSecret !== SECRET_SET);

  return (
    <Card>
      <div className="p-6 space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
          Conexión con {label}
        </h3>

        {status?.status === 'revoked' && (
          <div className="rounded-lg border-2 border-dashed border-rose-300 dark:border-rose-700 bg-rose-50/50 dark:bg-rose-900/20 p-4 text-rose-700 dark:text-rose-200 text-xs flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              La autorización de {label} fue revocada o caducó. Vuelve a conectar la cuenta para
              seguir subiendo archivos y backups.
            </span>
          </div>
        )}

        {status?.connected ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 size={13} />
              Conectado{status.connectedEmail ? ` como ${status.connectedEmail}` : ''}
            </span>
            <span className="text-[11px] text-slate-400">
              {status.credSource === 'tenant'
                ? 'Credenciales propias'
                : 'App global de la plataforma'}
            </span>
            <Button variant="secondary" onClick={onDisconnect}>
              <Unlink size={14} className="mr-1.5" />
              Desconectar
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Button onClick={onConnect} disabled={connecting || !canConnect}>
              <Link2 size={15} className="mr-2" />
              {connecting ? 'Conectando…' : `Conectar con ${label}`}
            </Button>
            {!canConnect && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-snug">
                No hay credenciales OAuth disponibles: el servidor no tiene configurada la app
                global de {label}. Introduce unas credenciales propias abajo o pide al administrador
                de la plataforma que configure las globales.
              </p>
            )}
          </div>
        )}

        <Input
          label="Carpeta raíz (nombre, opcional)"
          placeholder="Ej: Keirost o Backups/Keirost"
          value={section.rootFolderId ?? ''}
          onChange={(e) => onFieldChange('rootFolderId', e.target.value)}
        />
        <p className="text-[11px] text-slate-400 leading-snug -mt-2">
          Nombre de carpeta (o ruta separada por «/») dentro de tu {label} donde se guardarán los
          archivos. Se crea automáticamente si no existe. Déjalo vacío para usar la raíz.
        </p>

        <details className="group">
          <summary className="cursor-pointer text-xs font-bold text-slate-500 dark:text-slate-400 select-none">
            Usar credenciales OAuth propias (avanzado)
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-[11px] text-slate-400 leading-snug">
              Si prefieres no depender de la app global de la plataforma, registra tu propia app
              OAuth ({provider === 'gdrive' ? 'Google Cloud Console' : 'Azure Portal'}) y pega aquí
              sus credenciales. Guarda y luego pulsa «Conectar».
            </p>
            <Input
              label="Client ID"
              value={section.clientId ?? ''}
              onChange={(e) => onFieldChange('clientId', e.target.value)}
            />
            <Input
              label="Client Secret"
              type="password"
              placeholder={section.clientSecret === SECRET_SET ? '(guardado)' : ''}
              value={section.clientSecret === SECRET_SET ? '' : (section.clientSecret ?? '')}
              onChange={(e) => onFieldChange('clientSecret', e.target.value)}
            />
          </div>
        </details>
      </div>
    </Card>
  );
};

const ProviderCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  viewing: boolean;
  connected?: boolean;
  onClick: () => void;
}> = ({ icon, label, active, viewing, connected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-sm font-bold ${
      viewing
        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200'
        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
    }`}
  >
    {active && (
      <span
        className="absolute top-2 right-2 h-2 w-2 rounded-full bg-emerald-500"
        title="Backend activo"
      />
    )}
    {icon}
    <span>{label}</span>
    {connected !== undefined && (
      <span
        className={`text-[9px] uppercase tracking-wider ${
          connected
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-slate-400 dark:text-slate-500'
        }`}
      >
        {connected ? 'conectado' : 'sin conectar'}
      </span>
    )}
  </button>
);
