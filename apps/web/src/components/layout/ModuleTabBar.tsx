import React, { useMemo } from 'react';
import { NavMenu } from '@openfactu/ui';
import type { NavMenuItem, NavStatus } from '@openfactu/ui';
import { useActiveModule } from '../../context/PluginContext';
import { useTabs } from '../../context/TabsContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { PluginIcon } from '../PluginIcon';
import type { SubTab } from '../../modules/registry';

/**
 * Barra horizontal de sub-secciones del módulo activo, entre el TopHeader y las
 * pestañas dinámicas.
 *
 * El plegado por `group`, el desplegable, el resaltado del grupo que contiene
 * la sección activa y los distintivos de madurez los pone el `NavMenu` del
 * paquete, que está hecho para este mismo catálogo plano: aquí solo se traduce
 * `subTabs` a sus ítems y se resuelve el id de vuelta a una ruta.
 */
export const ModuleTabBar: React.FC = () => {
  const { openTab, tabs, activeTabId } = useTabs();
  const { user } = useAuth();
  const activeTabPath = tabs.find((t) => t.id === activeTabId)?.path?.split('?')[0] || '/';
  const active = useActiveModule(activeTabPath);
  const { flags } = useTheme();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERUSER';

  const subTabs: SubTab[] = useMemo(
    () =>
      active
        ? active.subTabs.filter((s) => {
            if (!isAdmin && s.adminOnly) return false;
            if (s.featureFlag && !(flags as any)[s.featureFlag]) return false;
            return true;
          })
        : [],
    [active, isAdmin, flags],
  );

  const items = useMemo<NavMenuItem[]>(
    () =>
      subTabs.map((t) => ({
        id: t.id,
        label: t.label,
        group: t.group,
        status: (t as any).status as NavStatus | undefined,
        icon: t.icon ? <PluginIcon iconName={t.icon} size={14} /> : undefined,
      })),
    [subTabs],
  );

  if (!active || subTabs.length === 0) return null;

  const activeId = subTabs.find((t) => t.path === activeTabPath)?.id;

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-bg-card border-b border-border-default overflow-x-auto overflow-y-visible">
      <span className="text-xs font-bold uppercase tracking-wider text-fg-subtle mr-3 px-2 whitespace-nowrap">
        {active.label}
      </span>
      <NavMenu
        items={items}
        value={activeId}
        size="sm"
        aria-label={active.label}
        onChange={(id) => {
          const tab = subTabs.find((t) => t.id === id);
          if (tab) openTab(tab.path);
        }}
      />
    </div>
  );
};
