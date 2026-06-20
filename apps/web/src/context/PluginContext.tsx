import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useRef,
  useMemo,
} from 'react';
import { CORE_MODULES, findActiveModule, type Module, type SubTab } from '../modules/registry';
import { useAuth } from './AuthContext';

interface PluginRoute {
  path: string;
  title: string;
  type: 'table' | 'form' | 'custom' | 'dashboard';
  icon?: string;
  config?: any;
}

interface PluginMenuItem {
  label: string;
  path: string;
  icon: string;
}

interface PluginModuleManifest {
  id: string;
  label: string;
  icon: string;
  subTabs?: Array<{ label: string; path: string; icon?: string }>;
}

interface PluginSubTabManifest {
  moduleId: string;
  label: string;
  path: string;
  icon?: string;
}

export interface PluginDashboardWidget {
  id: string;
  title: string;
  subtitle?: string;
  /** Ruta al componente ESM del plugin (resuelve /api/plugins/load/{pluginId}/{component}). */
  component: string;
  /** Tamaño en la grid de 4 columnas: sm=1, md=2, lg=3, full=4. Default: md. */
  size?: 'sm' | 'md' | 'lg' | 'full';
  /** Orden sugerido (menor = antes). Default: 100. */
  order?: number;
}

export interface PluginThemePreset {
  id: string;
  label: string;
  description?: string;
  colorPrimary: string;
  colorAccent: string;
  themeMode: 'light' | 'dark';
}

interface PluginManifest {
  id: string;
  name: string;
  logo?: string;
  ui: {
    routes?: PluginRoute[];
    /** @deprecated mapped al módulo "plugins" */
    menuItems?: PluginMenuItem[];
    modules?: PluginModuleManifest[];
    subTabs?: PluginSubTabManifest[];
    /** Widgets a inyectar en el Dashboard principal. */
    dashboardWidgets?: PluginDashboardWidget[];
    /** Presets de tema extra que el plugin aporta al selector de Branding. */
    themes?: PluginThemePreset[];
  };
}

interface PluginContextType {
  manifests: PluginManifest[];
  loading: boolean;
  reload: () => void;
  /** Timestamp del ultimo reload — los componentes lo usan para cache-bust */
  reloadTimestamp: number;
  /** Módulos core + de plugins ya mergeados. */
  modules: Module[];
  /** Recarga las tablas de usuario (útil tras crear/editar/borrar desde la UI). */
  reloadUserTables: () => void;
}

/** Widget de dashboard junto al id del plugin que lo aporta. */
export interface DashboardWidgetEntry extends PluginDashboardWidget {
  pluginId: string;
}

const PluginContext = createContext<PluginContextType | undefined>(undefined);

export const PluginProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token: authToken, user: authUser } = useAuth();
  const [manifests, setManifests] = useState<PluginManifest[]>([]);
  const [userTables, setUserTables] = useState<
    Array<{
      tableName: string;
      label: string | null;
      iconName: string | null;
      kind: string;
      menuModule: string | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [reloadTimestamp, setReloadTimestamp] = useState(Date.now());
  const wsRef = useRef<WebSocket | null>(null);

  const fetchManifests = useCallback(async () => {
    try {
      const token = localStorage.getItem('openfactu_token');
      const fetchHeaders: Record<string, string> = {};
      if (token) fetchHeaders['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/plugins/manifests', { headers: fetchHeaders });
      if (!res.ok) {
        setManifests([]);
        return;
      }
      const text = await res.text();
      if (!text.trim()) {
        setManifests([]);
        return;
      }
      try {
        const data = JSON.parse(text);
        setManifests(Array.isArray(data) ? data : []);
      } catch {
        setManifests([]);
      }
    } catch {
      setManifests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchManifests();
  }, [fetchManifests]);

  // Cargar también las tablas de usuario del tenant actual para inyectar en el menú.
  const fetchUserTables = useCallback(() => {
    if (!authToken || !authUser?.tenantId) {
      setUserTables([]);
      return;
    }
    fetch('/api/user-tables/menu', {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'x-tenant-id': authUser.tenantId,
      },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setUserTables(Array.isArray(d) ? d : []))
      .catch(() => setUserTables([]));
  }, [authToken, authUser?.tenantId]);

  useEffect(() => {
    fetchUserTables();
  }, [fetchUserTables]);

  // WebSocket de desarrollo para hot reload — solo en dev
  useEffect(() => {
    if (import.meta.env.PROD) return;

    const wsUrl = `ws://${window.location.hostname}:3000/ws/plugins`;
    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped) return;
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'plugin:reload') {
              console.log(`[HotReload] Plugin ${data.pluginId} recargado`);
              if (data.manifests) {
                setManifests(data.manifests);
              } else {
                fetchManifests();
              }
              setReloadTimestamp(Date.now());
            }
          } catch {}
        };

        ws.onclose = () => {
          if (stopped) return;
          reconnectTimer = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        /* noop */
      }
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [fetchManifests]);

  const reload = useCallback(() => {
    fetchManifests();
    setReloadTimestamp(Date.now());
  }, [fetchManifests]);

  // Mergear módulos core + módulos/sub-tabs aportados por plugins
  const modules = useMemo<Module[]>(() => {
    // Clone para no mutar
    const merged: Module[] = CORE_MODULES.map((m) => ({ ...m, subTabs: [...m.subTabs] }));

    for (const manifest of manifests) {
      // 1) Módulos top-level del plugin → añadir si no existen ya
      for (const pmod of manifest.ui?.modules || []) {
        if (merged.some((m) => m.id === pmod.id)) continue;
        merged.push({
          id: pmod.id,
          label: pmod.label,
          icon: pmod.icon,
          subTabs: (pmod.subTabs || []).map((s) => ({
            id: `${manifest.id}__${s.path}`,
            label: s.label,
            path: s.path,
            icon: s.icon,
          })),
        });
      }

      // 2) Sub-tabs inyectados en módulos existentes
      for (const sub of manifest.ui?.subTabs || []) {
        const target = merged.find((m) => m.id === sub.moduleId);
        if (!target) continue;
        target.subTabs.push({
          id: `${manifest.id}__${sub.path}`,
          label: sub.label,
          path: sub.path,
          icon: sub.icon,
        });
      }

      // 3) Legacy menuItems → mapear todos al módulo "plugins"
      const legacyTarget = merged.find((m) => m.id === 'plugins');
      if (legacyTarget) {
        for (const item of manifest.ui?.menuItems || []) {
          legacyTarget.subTabs.push({
            id: `${manifest.id}__legacy__${item.path}`,
            label: item.label,
            path: item.path,
            icon: item.icon,
          });
        }
      }
    }

    // 4) Tablas de usuario → inyectar como subtabs en el módulo indicado.
    //    Si no se indicó módulo, se añaden a uno nuevo "custom" al final.
    for (const ut of userTables) {
      const modId = ut.menuModule || 'custom';
      let target = merged.find((m) => m.id === modId);
      if (!target) {
        target = {
          id: 'custom',
          label: 'Personalizado',
          icon: 'Wrench',
          subTabs: [],
        };
        merged.push(target);
      }
      const pathName = ut.tableName.replace(/^pt_/, '');
      target.subTabs.push({
        id: `usertable__${ut.tableName}`,
        label: ut.label || pathName,
        path: `/u/${pathName}`,
        icon: ut.iconName || 'Table',
      });
    }

    return merged;
  }, [manifests, userTables]);

  return (
    <PluginContext.Provider
      value={{
        manifests,
        loading,
        reload,
        reloadTimestamp,
        modules,
        reloadUserTables: fetchUserTables,
      }}
    >
      {children}
    </PluginContext.Provider>
  );
};

export const usePlugins = () => {
  const context = useContext(PluginContext);
  if (!context) throw new Error('usePlugins must be used within PluginProvider');
  return context;
};

/** Devuelve la lista combinada de módulos core + plugins. */
export const useModules = (): Module[] => {
  const { modules } = usePlugins();
  return modules;
};

/**
 * Devuelve el módulo activo dado un pathname.
 * El pathname se pasa explícitamente para evitar acoplar este hook a TabsContext
 * (los consumidores leen useTabs() ellos mismos).
 */
export const useActiveModule = (pathname: string): Module | null => {
  const modules = useModules();
  return findActiveModule(modules, pathname);
};

export type { SubTab };

/** Devuelve todos los widgets de dashboard declarados por plugins, ordenados. */
export const useDashboardWidgets = (): DashboardWidgetEntry[] => {
  const { manifests } = usePlugins();
  return useMemo(() => {
    const all: DashboardWidgetEntry[] = [];
    for (const m of manifests) {
      for (const w of m.ui?.dashboardWidgets || []) {
        all.push({ ...w, pluginId: m.id });
      }
    }
    return all.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  }, [manifests]);
};

/** Devuelve todos los presets de tema aportados por plugins. */
export const usePluginThemePresets = (): PluginThemePreset[] => {
  const { manifests } = usePlugins();
  return useMemo(() => {
    const all: PluginThemePreset[] = [];
    for (const m of manifests) {
      for (const t of m.ui?.themes || []) all.push(t);
    }
    return all;
  }, [manifests]);
};
