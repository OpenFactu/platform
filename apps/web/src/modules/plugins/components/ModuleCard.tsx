import React from 'react';
import { Badge, Switch } from '@openfactu/ui';
import { PluginIcon } from '@/components/PluginIcon';
import type { Module } from '@/modules';

interface ModuleCardProps {
  module: Module;
  enabled: boolean;
  onToggle: () => void;
  isToggling: boolean;
}

export const ModuleCard: React.FC<ModuleCardProps> = ({
  module,
  enabled,
  onToggle,
  isToggling,
}) => {
  return (
    <div
      className={`
        relative bg-white dark:bg-slate-900 rounded-xl border transition-all duration-200
        ${
          enabled
            ? 'border-emerald-300 dark:border-emerald-700 shadow-sm shadow-emerald-100 dark:shadow-none'
            : 'border-slate-200 dark:border-slate-800 opacity-75'
        }
      `}
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`
                w-11 h-11 rounded-xl flex items-center justify-center border shadow-sm overflow-hidden p-2
                ${
                  enabled
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-700'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                }
              `}
            >
              <PluginIcon
                iconName={module.icon}
                size={24}
                className={
                  enabled
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400 dark:text-slate-500'
                }
              />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 leading-tight">
                {module.label}
              </h3>
              {module.category && (
                <Badge variant="info" className="mt-1">
                  {module.category}
                </Badge>
              )}
            </div>
          </div>

          {/* Switch: el flag del módulo se guarda en la empresa al instante. */}
          <span title={enabled ? 'Desactivar módulo' : 'Activar módulo'}>
            <Switch checked={enabled} onChange={onToggle} disabled={isToggling} />
          </span>
        </div>

        {module.description && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">
            {module.description}
          </p>
        )}

        <div className="flex items-center text-xs">
          <span
            className={`
              ml-auto flex items-center gap-1 font-semibold
              ${enabled ? 'text-emerald-500' : 'text-slate-400 dark:text-slate-500'}
            `}
          >
            {enabled ? 'Activo' : 'Inactivo'}
          </span>
        </div>
      </div>
    </div>
  );
};
