import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@openfactu/ui';
import { ChevronDown } from 'lucide-react';
import { useActiveModule } from '../../context/PluginContext';
import { useTabs } from '../../context/TabsContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { PluginIcon } from '../PluginIcon';
import type { SubTab } from '../../modules/registry';

const STATUS_STYLE: Record<string, string> = {
  alpha: 'text-purple-700 dark:text-purple-300 bg-purple-500/10 border border-purple-500/30',
  beta: 'text-sky-700 dark:text-sky-300 bg-sky-500/10 border border-sky-500/30',
  dev: 'text-rose-700 dark:text-rose-300 bg-rose-500/10 border border-rose-500/30',
};
const StatusPill: React.FC<{ status?: string }> = ({ status }) => {
  if (!status || !STATUS_STYLE[status]) return null;
  const label = status[0].toUpperCase() + status.slice(1);
  return (
    <span
      className={cn(
        'text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded-xs',
        STATUS_STYLE[status],
      )}
    >
      {label}
    </span>
  );
};

/**
 * Barra horizontal de sub-tabs del módulo activo. Aparece justo debajo del
 * TopHeader y antes del TabBar de pestañas dinámicas.
 *
 * Soporta agrupación: los sub-tabs con el mismo `group` se colapsan en un
 * desplegable. Si el sub-tab activo pertenece a un grupo, se resalta el
 * desplegable correspondiente.
 */
export const ModuleTabBar: React.FC = () => {
  const { openTab, tabs, activeTabId } = useTabs();
  const { user } = useAuth();
  const activeTabPath = tabs.find((t) => t.id === activeTabId)?.path?.split('?')[0] || '/';
  const active = useActiveModule(activeTabPath);
  const { flags } = useTheme();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERUSER';
  const subTabs: SubTab[] = active
    ? active.subTabs.filter((s) => {
        if (!isAdmin && s.adminOnly) return false;
        if (s.featureFlag && !(flags as any)[s.featureFlag]) return false;
        return true;
      })
    : [];

  const inlineTabs = subTabs.filter((t) => !t.group);
  const grouped = subTabs.reduce<Record<string, SubTab[]>>((acc, t) => {
    if (t.group) {
      acc[t.group] = acc[t.group] || [];
      acc[t.group].push(t);
    }
    return acc;
  }, {});

  if (!active || subTabs.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-bg-card border-b border-border-default overflow-x-auto overflow-y-visible">
      <span className="text-xs font-bold uppercase tracking-wider text-ink-400 dark:text-ink-500 mr-3 px-2">
        {active.label}
      </span>
      {inlineTabs.map((tab) => {
        const isActive = tab.path === activeTabPath;
        return (
          <button
            key={tab.id}
            onClick={() => openTab(tab.path)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xs text-xs font-medium whitespace-nowrap',
              'transition-colors duration-150',
              isActive
                ? 'bg-accent/10 text-accent dark:bg-accent/20 dark:text-accent'
                : 'text-ink-700 dark:text-ink-400 hover:bg-bg-hover hover:text-accent dark:hover:text-accent',
            )}
          >
            {tab.icon && <PluginIcon iconName={tab.icon} size={14} />}
            {tab.label}
            <StatusPill status={(tab as any).status} />
          </button>
        );
      })}
      {Object.entries(grouped).map(([group, items]) => (
        <GroupDropdown
          key={group}
          group={group}
          items={items}
          activeTabPath={activeTabPath}
          openTab={openTab}
        />
      ))}
    </div>
  );
};

const GroupDropdown: React.FC<{
  group: string;
  items: SubTab[];
  activeTabPath: string;
  openTab: (path: string) => void;
}> = ({ group, items, activeTabPath, openTab }) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const isActive = items.some((t) => t.path === activeTabPath);

  // Calcular posición del menú (fixed) cuando se abre.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const update = () => {
      const r = btnRef.current!.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  // Click fuera cierra el menú.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        btnRef.current &&
        !btnRef.current.contains(t) &&
        menuRef.current &&
        !menuRef.current.contains(t)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-xs text-xs font-medium whitespace-nowrap',
          'transition-colors duration-150',
          isActive
            ? 'bg-accent/10 text-accent dark:bg-accent/20 dark:text-accent'
            : 'text-ink-700 dark:text-ink-400 hover:bg-bg-hover hover:text-accent dark:hover:text-accent',
        )}
      >
        {group}
        <ChevronDown size={12} className={open ? 'rotate-180 transition' : 'transition'} />
      </button>
      {open && pos && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 1000 }}
          className="min-w-[200px] rounded-lg shadow-lg border border-border-default bg-bg-card py-1"
        >
          {items.map((tab) => {
            const tabActive = tab.path === activeTabPath;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  openTab(tab.path);
                  setOpen(false);
                }}
                className={cn(
                  'w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs font-medium whitespace-nowrap',
                  tabActive
                    ? 'bg-accent/10 text-accent dark:bg-accent/20 dark:text-accent'
                    : 'text-fg-body hover:bg-bg-hover hover:text-accent',
                )}
              >
                {tab.icon && <PluginIcon iconName={tab.icon} size={14} />}
                {tab.label}
                <StatusPill status={(tab as any).status} />
              </button>
            );
          })}
        </div>
      )}
    </>
  );
};
