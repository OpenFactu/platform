import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { resolveRouteMeta } from '../components/tabs/RouteRegistry';
import { canRead, type NavUser } from '../modules/permissions';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'openfactu_tabs';

export interface Tab {
  id: string;
  path: string;
  title: string;
  iconName?: string;
}

interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
}

interface TabsContextValue extends TabsState {
  openTab: (
    path: string,
    opts?: { title?: string; iconName?: string; focusExisting?: boolean },
  ) => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabPath: (id: string, newPath: string) => void;
  updateTabTitle: (id: string, title: string) => void;
  resetTabs: (path?: string) => void;
}

// Lazy screens can retain a previous module instance during a hot update.
// Keep both context identities so mounted providers and refreshed hooks agree.
const TabsContext: React.Context<TabsContextValue | null> =
  import.meta.hot?.data.tabsContext ?? createContext<TabsContextValue | null>(null);

/** Debajo del breakpoint `md`, donde la barra de pestañas no se muestra. */
const MOBILE_QUERY = '(max-width: 767px)';
const MOBILE_MAX_TABS = 5;

const genId = () => `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function pathnameOf(url: string): string {
  const qIdx = url.indexOf('?');
  return qIdx === -1 ? url : url.slice(0, qIdx);
}

function loadStorage(): TabsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { tabs: [], activeTabId: null };
    const data = JSON.parse(raw);
    if (!Array.isArray(data.tabs)) return { tabs: [], activeTabId: null };
    return { tabs: data.tabs, activeTabId: data.activeTabId ?? null };
  } catch {
    return { tabs: [], activeTabId: null };
  }
}

function saveStorage(state: TabsState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

/**
 * ¿Se puede restaurar esta pestaña?
 *
 * Las pestañas viven en `localStorage`, así que sobreviven a que a alguien le
 * quiten un permiso: al volver a entrar seguía con "Facturas Venta" abierta y
 * al pulsarla la aplicación la echaba. Una ruta sin `permissionPath` no está
 * bajo control de permisos (la portada, el perfil, la app del repartidor) y se
 * conserva — mismo criterio que usa `TabsHost` para envolver o no en
 * `PermittedRoute`.
 */
function canRestoreTab(path: string, user: NavUser | null | undefined): boolean {
  const meta = resolveRouteMeta(pathnameOf(path));
  if (!meta) return false;
  if (!meta.permissionPath) return true;
  return canRead(user, meta.permissionPath);
}

function computeInitialState(user: NavUser | null | undefined): TabsState {
  const persisted = loadStorage();
  const browserPathname = window.location.pathname;
  const browserSearch = window.location.search;
  const browserPath = browserPathname + browserSearch;

  let tabs = persisted.tabs.filter((t) => canRestoreTab(t.path, user));
  let activeTabId: string | null = persisted.activeTabId;
  if (activeTabId && !tabs.some((t) => t.id === activeTabId)) {
    activeTabId = tabs[0]?.id ?? null;
  }

  const dashboardMeta = resolveRouteMeta('/');
  const makeDashTab = (): Tab => ({
    id: genId(),
    path: '/',
    title: dashboardMeta?.title ?? 'home.nav.dashboard',
    iconName: dashboardMeta?.iconName,
  });

  if (tabs.length === 0) {
    const initialPath = browserPathname && browserPathname !== '/' ? browserPath : '/';
    const meta = canRestoreTab(initialPath, user)
      ? resolveRouteMeta(pathnameOf(initialPath))
      : null;
    if (meta) {
      const tab: Tab = {
        id: genId(),
        path: initialPath,
        title: meta.title,
        iconName: meta.iconName,
      };
      tabs = [tab];
      activeTabId = tab.id;
    } else {
      const tab = makeDashTab();
      tabs = [tab];
      activeTabId = tab.id;
    }
  } else if (browserPathname !== '/' && !tabs.some((t) => pathnameOf(t.path) === browserPathname)) {
    const meta = canRestoreTab(browserPathname, user) ? resolveRouteMeta(browserPathname) : null;
    if (meta) {
      const tab: Tab = {
        id: genId(),
        path: browserPath,
        title: meta.title,
        iconName: meta.iconName,
      };
      tabs = [...tabs, tab];
      activeTabId = tab.id;
    }
  }

  if (!activeTabId && tabs.length > 0) activeTabId = tabs[0].id;

  return { tabs, activeTabId };
}

export const TabsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // El usuario ya está resuelto: `TabsProvider` solo se monta en la rama
  // autenticada de `App`. Hace falta para no restaurar pestañas guardadas de
  // pantallas a las que ya no se tiene acceso.
  const { user } = useAuth();
  const [state, setState] = useState<TabsState>(() => computeInitialState(user));

  useEffect(() => {
    saveStorage(state);
  }, [state]);

  useEffect(() => {
    const active = state.tabs.find((t) => t.id === state.activeTabId);
    if (!active) return;
    const currentUrl = window.location.pathname + window.location.search;
    if (currentUrl !== active.path) {
      window.history.replaceState(null, '', active.path);
    }
  }, [state.tabs, state.activeTabId]);

  const openTab = useCallback<TabsContextValue['openTab']>((path, opts = {}) => {
    const focusExisting = opts.focusExisting ?? true;
    const newPathname = pathnameOf(path);
    const meta = resolveRouteMeta(newPathname);
    const title = opts.title ?? meta?.title ?? newPathname;
    const iconName = opts.iconName ?? meta?.iconName;

    let resultId = '';
    setState((prev) => {
      if (focusExisting) {
        const existing = prev.tabs.find((t) => pathnameOf(t.path) === newPathname);
        if (existing) {
          resultId = existing.id;
          const nextTabs =
            existing.path === path
              ? prev.tabs
              : prev.tabs.map((t) => (t.id === existing.id ? { ...t, path } : t));
          return { tabs: nextTabs, activeTabId: existing.id };
        }
      }
      const id = genId();
      resultId = id;
      const newTab: Tab = { id, path, title, iconName };
      let tabs = [...prev.tabs, newTab];
      // En móvil la barra de pestañas está oculta y no hay forma de cerrarlas:
      // se acota el número y se descartan las más antiguas que no están activas.
      if (window.matchMedia(MOBILE_QUERY).matches) {
        while (tabs.length > MOBILE_MAX_TABS) {
          const oldest = tabs.findIndex((t) => t.id !== id && t.id !== prev.activeTabId);
          if (oldest === -1) break;
          tabs = tabs.filter((_, i) => i !== oldest);
        }
      }
      return { tabs, activeTabId: id };
    });
    return resultId;
  }, []);

  const closeTab = useCallback((id: string) => {
    setState((prev) => {
      const idx = prev.tabs.findIndex((t) => t.id === id);
      if (idx === -1) return prev;
      const nextTabs = prev.tabs.filter((t) => t.id !== id);
      let nextActive = prev.activeTabId;
      if (prev.activeTabId === id) {
        const adjacent = nextTabs[idx] ?? nextTabs[idx - 1] ?? null;
        nextActive = adjacent?.id ?? null;
      }
      if (nextTabs.length === 0) {
        const dashboardMeta = resolveRouteMeta('/');
        const dash: Tab = {
          id: genId(),
          path: '/',
          title: dashboardMeta?.title ?? 'home.nav.dashboard',
          iconName: dashboardMeta?.iconName,
        };
        return { tabs: [dash], activeTabId: dash.id };
      }
      return { tabs: nextTabs, activeTabId: nextActive };
    });
  }, []);

  const setActiveTab = useCallback((id: string) => {
    setState((prev) => (prev.activeTabId === id ? prev : { ...prev, activeTabId: id }));
  }, []);

  const updateTabPath = useCallback((id: string, newPath: string) => {
    setState((prev) => {
      const tab = prev.tabs.find((t) => t.id === id);
      if (!tab || tab.path === newPath) return prev;
      const meta = resolveRouteMeta(pathnameOf(newPath));
      return {
        ...prev,
        tabs: prev.tabs.map((t) =>
          t.id === id
            ? {
                ...t,
                path: newPath,
                title: meta?.title ?? t.title,
                iconName: meta?.iconName ?? t.iconName,
              }
            : t,
        ),
      };
    });
  }, []);

  const resetTabs = useCallback((path: string = '/') => {
    const meta = resolveRouteMeta(pathnameOf(path));
    const tab: Tab = {
      id: genId(),
      path,
      title: meta?.title ?? 'home.nav.dashboard',
      iconName: meta?.iconName,
    };
    setState({ tabs: [tab], activeTabId: tab.id });
  }, []);

  const updateTabTitle = useCallback((id: string, title: string) => {
    setState((prev) => {
      const tab = prev.tabs.find((t) => t.id === id);
      if (!tab || tab.title === title) return prev;
      return { ...prev, tabs: prev.tabs.map((t) => (t.id === id ? { ...t, title } : t)) };
    });
  }, []);

  const value: TabsContextValue = {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    openTab,
    closeTab,
    setActiveTab,
    updateTabPath,
    updateTabTitle,
    resetTabs,
  };

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
};

export const useTabs = (): TabsContextValue => {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('useTabs must be used within TabsProvider');
  return ctx;
};

const CurrentTabContext: React.Context<string | null> =
  import.meta.hot?.data.currentTabContext ?? createContext<string | null>(null);

if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.tabsContext = TabsContext;
    data.currentTabContext = CurrentTabContext;
  });
}

export const CurrentTabProvider: React.FC<{ tabId: string; children: React.ReactNode }> = ({
  tabId,
  children,
}) => <CurrentTabContext.Provider value={tabId}>{children}</CurrentTabContext.Provider>;

export interface CurrentTab {
  id: string;
  close: () => void;
  rename: (title: string) => void;
  navigateTab: (path: string) => void;
}

/** Id de la pestaña que contiene al componente, o `null` fuera de una pestaña. */
export const useCurrentTabId = (): string | null => useContext(CurrentTabContext);

export const useCurrentTab = (): CurrentTab => {
  const id = useContext(CurrentTabContext);
  const { closeTab, updateTabTitle, updateTabPath } = useTabs();
  if (!id) throw new Error('useCurrentTab must be used within a tab subtree');
  return useMemo(
    () => ({
      id,
      close: () => closeTab(id),
      rename: (title: string) => updateTabTitle(id, title),
      navigateTab: (path: string) => updateTabPath(id, path),
    }),
    [id, closeTab, updateTabTitle, updateTabPath],
  );
};
