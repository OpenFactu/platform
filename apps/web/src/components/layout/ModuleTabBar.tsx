import React, { useEffect, useMemo, useRef } from 'react';
import { NavMenu } from '@openfactu/ui';
import type { NavMenuItem, NavStatus } from '@openfactu/ui';
import { PluginIcon } from '../PluginIcon';
import { useModuleSubTabs } from './useModuleSubTabs';
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
  const { active, subTabs, activeId, openTab } = useModuleSubTabs();

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

  // En pantalla estrecha la barra scrollea; al cambiar de sección la activa se
  // centra para no quedar fuera de vista (p. ej. «Movimientos de stock»).
  const barRef = useRef<HTMLDivElement>(null);
  const activeKey = activeId;
  useEffect(() => {
    const el = barRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeKey, active?.id]);

  if (!active || subTabs.length === 0) return null;

  return (
    <div
      ref={barRef}
      className="hidden md:flex items-center gap-1 px-3 py-1.5 bg-bg-card border-b border-border-default overflow-x-auto overflow-y-visible scrollbar-hide"
    >
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
