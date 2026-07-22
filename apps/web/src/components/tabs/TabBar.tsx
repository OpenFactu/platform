import React from 'react';
import * as LucideIcons from 'lucide-react';
import { cn } from '@openfactu/ui';
import { ContextMenu } from '../common/ContextMenu';
import { useContextMenu } from '../../hooks/useContextMenu';
import { Tab, useTabs } from '../../context/TabsContext';

const resolveIcon = (name?: string): React.ComponentType<any> => {
  if (name && (LucideIcons as any)[name]) return (LucideIcons as any)[name];
  return LucideIcons.FileText;
};

export const TabBar: React.FC = () => {
  const { tabs, activeTabId, setActiveTab, closeTab, resetTabs } = useTabs();
  const ctxMenu = useContextMenu<Tab>();

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(id);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, tab: Tab) => {
    e.preventDefault();
    e.stopPropagation();
    ctxMenu.open(e, tab);
  };

  const buildCtxItems = (tab: Tab) => {
    const idx = tabs.findIndex((t) => t.id === tab.id);
    const rightTabs = idx === -1 ? [] : tabs.slice(idx + 1);

    return [
      {
        label: 'Cerrar pestaña',
        icon: <LucideIcons.X size={14} />,
        onClick: () => closeTab(tab.id),
      },
      {
        label: 'Cerrar otras pestañas',
        icon: <LucideIcons.Layers size={14} />,
        onClick: () => tabs.filter((t) => t.id !== tab.id).forEach((other) => closeTab(other.id)),
        disabled: tabs.length <= 1,
      },
      {
        label: 'Cerrar pestañas a la derecha',
        icon: <LucideIcons.ChevronsRight size={14} />,
        onClick: () => rightTabs.forEach((other) => closeTab(other.id)),
        disabled: rightTabs.length === 0,
      },
      {
        label: 'Cerrar todas las pestañas',
        icon: <LucideIcons.Trash2 size={14} />,
        destructive: true,
        separatorBefore: true,
        onClick: () => resetTabs('/'),
      },
    ];
  };

  if (tabs.length === 0) return null;

  return (
    <>
      <div
        role="tablist"
        className="flex items-stretch h-10 bg-[#F1F5F9] dark:bg-[#0A1628] border-b border-[#E2E8F0] dark:border-[#2D3A4A] overflow-x-auto scrollbar-hide shrink-0 z-0"
      >
        {tabs.map((tab) => {
          const Icon = resolveIcon(tab.iconName);
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab)}
              onMouseDown={(e) => handleMouseDown(e, tab.id)}
              className={cn(
                'group relative flex items-center gap-2 pl-3 pr-2 h-full min-w-[140px] max-w-[240px] cursor-pointer border-r border-[#E2E8F0] dark:border-[#2D3A4A] transition-colors shrink-0 select-none',
                isActive
                  ? 'bg-white dark:bg-[#1A2535] text-accent'
                  : 'text-[#64748B] dark:text-[#94A3B8] hover:bg-white/60 dark:hover:bg-[#2D3A4A]/50 hover:text-accent dark:hover:text-accent',
              )}
            >
              {isActive && <div className="absolute top-0 left-0 right-0 h-[2px] bg-accent" />}
              <Icon size={14} className={cn('shrink-0', isActive ? 'text-accent' : 'opacity-70')} />
              <span className="flex-1 truncate text-xs font-semibold tracking-tight">
                {tab.title}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="shrink-0 w-5 h-5 rounded-xs flex items-center justify-center text-ink-400 hover:bg-line dark:hover:bg-ink-700 hover:text-ink-900 dark:hover:text-slate-100 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Cerrar pestaña"
                tabIndex={-1}
              >
                <LucideIcons.X size={12} />
              </button>
            </div>
          );
        })}
      </div>
      {ctxMenu.state && (
        <ContextMenu
          x={ctxMenu.state.x}
          y={ctxMenu.state.y}
          items={buildCtxItems(ctxMenu.state.data)}
          onClose={ctxMenu.close}
        />
      )}
    </>
  );
};
