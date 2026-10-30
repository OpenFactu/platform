import React, { useMemo, useState } from 'react';
import { Modal, cn } from '@openfactu/ui';
import { Check, ChevronDown } from 'lucide-react';
import { PluginIcon } from '../PluginIcon';
import { iconNameFor } from '../../modules/routeLookup';
import type { SubTab } from '../../modules/registry';
import { useModuleSubTabs } from './useModuleSubTabs';
import { useI18n } from '@/i18n/I18nContext';

/**
 * Selector de subsecciones para móvil: sustituye a la fila de chips con scroll
 * horizontal de `ModuleTabBar`. Muestra el módulo y la sección actual en el
 * encabezado y, al pulsarlo, lista las secciones agrupadas como en escritorio.
 */
export const MobileModuleSwitcher: React.FC<{ fallbackLabel: string }> = ({ fallbackLabel }) => {
  const { active, subTabs, activeId, openTab } = useModuleSubTabs();
  const [open, setOpen] = useState(false);
  const { t: tr } = useI18n();

  // Agrupa respetando el orden de aparición; sin `group` va en un bloque suelto.
  const groups = useMemo(() => {
    const out: Array<{ name: string | null; items: SubTab[] }> = [];
    for (const t of subTabs) {
      const name = t.group ?? null;
      const last = out[out.length - 1];
      if (last && last.name === name) last.items.push(t);
      else out.push({ name, items: [t] });
    }
    return out;
  }, [subTabs]);

  const current = subTabs.find((t) => t.id === activeId);
  const title = active?.label ?? fallbackLabel;
  const interactive = !!active && subTabs.length > 1;

  const label = (
    <span className="flex min-w-0 flex-col items-start leading-tight">
      <span className="max-w-full truncate text-sm font-bold text-fg-default">{title}</span>
      {current && current.label !== title && (
        <span className="max-w-full truncate text-[11px] text-fg-muted">{current.label}</span>
      )}
    </span>
  );

  if (!interactive) return <div className="min-w-0 px-1">{label}</div>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-w-0 items-center gap-1.5 rounded-xs px-1 py-1 hover:bg-bg-hover transition-colors"
        aria-haspopup="dialog"
        aria-label={tr('app.header.switchSection', { title })}
      >
        {label}
        <ChevronDown size={14} className="shrink-0 text-fg-muted" />
      </button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={title} size="sm" hideCancel>
        <div className="-mx-1 space-y-3">
          {groups.map((g, gi) => (
            <div key={`${g.name ?? 'sin-grupo'}-${gi}`}>
              {g.name && (
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
                  {g.name}
                </div>
              )}
              <ul>
                {g.items.map((t) => {
                  const isActive = t.id === activeId;
                  const icon = iconNameFor(t.path, t.icon);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => {
                          openTab(t.path);
                          setOpen(false);
                        }}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xs px-3 py-2.5 text-left text-sm transition-colors',
                          isActive
                            ? 'bg-accent/10 font-semibold text-accent'
                            : 'text-fg-body hover:bg-bg-hover',
                        )}
                      >
                        {icon && <PluginIcon iconName={icon} size={16} />}
                        <span className="flex-1 truncate">{t.label}</span>
                        {isActive && <Check size={14} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
};
