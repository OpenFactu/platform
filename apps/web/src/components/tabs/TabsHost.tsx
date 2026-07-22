import React, { useEffect, useRef, useState } from 'react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTabs, CurrentTabProvider } from '../../context/TabsContext';
import { staticRoutes } from './RouteRegistry';
import { TabBridge } from './TabBridge';
import { PermittedRoute } from './PermittedRoute';
import { usePlugins } from '../../context/PluginContext';
import { PluginViewRenderer } from '@/modules/plugins/pages/PluginViewRenderer';

const MAX_MOUNTED_TABS = 3;

const NotFound: React.FC = () => (
  <div className="p-8 text-slate-500 dark:text-slate-400">
    <h2 className="text-lg font-bold mb-2">Ruta no encontrada</h2>
    <p className="text-sm">La pestaña apunta a una ruta que ya no existe.</p>
  </div>
);

export const TabsHost: React.FC = () => {
  const { tabs, activeTabId } = useTabs();
  const { manifests } = usePlugins();
  const [mountedIds, setMountedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!activeTabId) return;
    setMountedIds((prev) => {
      const next = [activeTabId, ...prev.filter((id) => id !== activeTabId)].slice(
        0,
        MAX_MOUNTED_TABS,
      );
      return next;
    });
  }, [activeTabId]);

  return (
    <div className="relative flex-1 min-h-0">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isMounted = mountedIds.includes(tab.id);
        if (!isMounted) return null;
        return (
          <div
            key={tab.id}
            className="absolute inset-0 overflow-auto"
            style={{ display: isActive ? 'block' : 'none' }}
          >
            <MemoryRouter initialEntries={[tab.path]}>
              <CurrentTabProvider tabId={tab.id}>
                <TabBridge tabId={tab.id} />
                <Routes>
                  {staticRoutes.map((r) => {
                    const element = r.permissionPath ? (
                      <PermittedRoute path={r.permissionPath}>
                        <r.Component />
                      </PermittedRoute>
                    ) : (
                      <r.Component />
                    );
                    return <Route key={r.pattern} path={r.pattern} element={element} />;
                  })}
                  {manifests.map((m) =>
                    (m.ui?.routes ?? []).map((route) => {
                      const routePath = route.path.startsWith('/') ? route.path : `/${route.path}`;
                      return (
                        <Route
                          key={`${m.id}-${route.path}`}
                          path={routePath}
                          element={
                            <PluginViewRenderer
                              pluginId={m.id}
                              type={route.type}
                              config={route.config}
                              title={route.title}
                            />
                          }
                        />
                      );
                    }),
                  )}
                  <Route path="/setup" element={<Navigate to="/" replace />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </CurrentTabProvider>
            </MemoryRouter>
          </div>
        );
      })}
    </div>
  );
};
