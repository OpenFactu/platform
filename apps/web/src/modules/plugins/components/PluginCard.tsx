import React from 'react';
import { Shield, Database, Power } from 'lucide-react';
import { PluginIcon } from '@/components/PluginIcon';
import type { PluginInfo } from '../domain/PluginInfo';
import type { PluginField } from '../domain/PluginField';
import type { PluginTable } from '../domain/PluginTable';

interface PluginCardProps {
  plugin: PluginInfo;
  fields: PluginField[];
  tables: PluginTable[];
  onToggle: () => void;
  isToggling: boolean;
}

export const PluginCard: React.FC<PluginCardProps> = ({
  plugin,
  fields,
  tables,
  onToggle,
  isToggling,
}) => {
  const extensionCount = fields.length + tables.length;

  return (
    <div
      className={`
        relative bg-white dark:bg-slate-900 rounded-xl border transition-all duration-200
        ${
          plugin.isActive
            ? 'border-emerald-300 dark:border-emerald-700 shadow-sm shadow-emerald-100 dark:shadow-none'
            : 'border-slate-200 dark:border-slate-800 opacity-75'
        }
      `}
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`
                w-11 h-11 rounded-xl flex items-center justify-center border shadow-sm overflow-hidden p-2
                ${
                  plugin.isActive
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-700'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                }
              `}
            >
              <PluginIcon
                iconName={plugin.logo}
                size={24}
                className={
                  plugin.isActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400 dark:text-slate-500'
                }
              />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 leading-tight">
                {plugin.name || plugin.id}
              </h3>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                {plugin.id}
              </span>
            </div>
          </div>

          {/* Toggle */}
          <button
            onClick={onToggle}
            disabled={isToggling}
            className={`
              relative w-12 h-7 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2
              ${isToggling ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
              ${
                plugin.isActive
                  ? 'bg-emerald-500 focus:ring-emerald-400'
                  : 'bg-slate-300 dark:bg-slate-600 focus:ring-slate-400'
              }
            `}
            title={plugin.isActive ? 'Desactivar plugin' : 'Activar plugin'}
          >
            <span
              className={`
                absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-200
                ${plugin.isActive ? 'translate-x-5.5 left-auto right-0.5' : 'left-0.5'}
              `}
              style={{
                transform: plugin.isActive ? 'translateX(0)' : 'translateX(0)',
                left: plugin.isActive ? 'auto' : '2px',
                right: plugin.isActive ? '2px' : 'auto',
              }}
            />
          </button>
        </div>

        {/* Description */}
        {plugin.description && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">
            {plugin.description}
          </p>
        )}

        {/* Footer info */}
        <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
          {plugin.version && (
            <span className="flex items-center gap-1">
              <Shield size={12} />v{plugin.version}
            </span>
          )}
          {extensionCount > 0 && (
            <span className="flex items-center gap-1">
              <Database size={12} />
              {extensionCount} {extensionCount === 1 ? 'extensión' : 'extensiones'} BD
            </span>
          )}
          {plugin.ui?.routes?.length > 0 && (
            <span className="flex items-center gap-1">
              <Power size={12} />
              {plugin.ui.routes.length} {plugin.ui.routes.length === 1 ? 'vista' : 'vistas'} UI
            </span>
          )}
          <span
            className={`
              ml-auto flex items-center gap-1 font-semibold
              ${plugin.isActive ? 'text-emerald-500' : 'text-slate-400 dark:text-slate-500'}
            `}
          >
            {plugin.isActive ? 'Activo' : 'Inactivo'}
          </span>
        </div>
      </div>
    </div>
  );
};
