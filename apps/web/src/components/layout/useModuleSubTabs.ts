import { useMemo } from 'react';
import { useActiveModule } from '../../context/PluginContext';
import { useTabs } from '../../context/TabsContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import type { SubTab } from '../../modules/registry';
import { visibleSubTabs } from '../../modules/permissions';

/**
 * Módulo activo y sus subsecciones visibles para el usuario. Lo comparten la
 * barra de subsecciones de escritorio (`ModuleTabBar`) y el selector móvil
 * (`MobileModuleSwitcher`), para que ambos apliquen el mismo criterio de rol,
 * flags y permisos.
 */
export function useModuleSubTabs() {
  const { openTab, tabs, activeTabId } = useTabs();
  const { user } = useAuth();
  const { flags } = useTheme();
  const activeTabPath = tabs.find((t) => t.id === activeTabId)?.path?.split('?')[0] || '/';
  const active = useActiveModule(activeTabPath);

  const subTabs: SubTab[] = useMemo(
    () => (active ? visibleSubTabs(active, { user, flags }) : []),
    [active, user, flags],
  );
  const activeId = subTabs.find((t) => t.path === activeTabPath)?.id;

  return { active, subTabs, activeId, activeTabPath, openTab };
}
