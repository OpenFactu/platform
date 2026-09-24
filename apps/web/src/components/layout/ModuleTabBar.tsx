import React, { useMemo } from 'react';
import { NavMenu } from '@openfactu/ui';
import type { NavMenuItem, NavStatus } from '@openfactu/ui';
import { useActiveModule } from '../../context/PluginContext';
import { useTabs } from '../../context/TabsContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { PluginIcon } from '../PluginIcon';
import type { SubTab } from '../../modules/registry';
import { visibleSubTabs } from '../../modules/permissions';
import { iconNameFor } from '../../modules/routeLookup';

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

  // Mismo criterio que el sidebar (rol, flags y permisos). Antes esta barra
  // solo miraba rol y flags, así que enseñaba pestañas en las que el usuario
  // no podía entrar.
  const subTabs: SubTab[] = useMemo(
    () => (active ? visibleSubTabs(active, { user, flags }) : []),
    [active, user, flags],
  );

  const items = useMemo<NavMenuItem[]>(
    () =>
      subTabs.map((t) => ({
        id: t.id,
        label: t.label,
        group: t.group,
        status: (t as any).status as NavStatus | undefined,
        // Si el sub-tab no declara icono —y ninguno lo hace— se coge el de su
        // ruta, que sí lo tiene. Antes esta línea no pintaba nunca nada.
        icon: (() => {
          const name = iconNameFor(t.path, t.icon);
          return name ? <PluginIcon iconName={name} size={14} /> : undefined;
        })(),
      })),
    [subTabs],
  );

  if (!active || subTabs.length === 0) return null;

  const activeId = subTabs.find((t) => t.path === activeTabPath)?.id;

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-bg-card border-b border-border-default overflow-x-auto overflow-y-visible">
      {/* El nombre del módulo se esconde en pantalla estrecha: son ~120 px
          fijos de información que ya dan el icono resaltado del sidebar y las
          propias pestañas. Donde sobra sitio, ayuda a orientarse; donde no,
          se come el ancho de lo que sí hace falta. */}
      <span className="hidden md:inline text-xs font-bold uppercase tracking-wider text-fg-subtle mr-3 px-2 whitespace-nowrap">
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
