import React from 'react';
import { Switch, Card } from '@openfactu/ui';
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

/** Misma piel que `ModuleCard`: superficie del `Card` del paquete y verde de
 *  estado desde los tokens `success`, para que el mosaico siga al tema. */
export const PluginCard: React.FC<PluginCardProps> = ({
  plugin,
  fields,
  tables,
  onToggle,
  isToggling,
}) => {
  const extensionCount = fields.length + tables.length;

  return (
    <Card
      noPadding
      className={
        plugin.isActive ? 'border-success shadow-k-sm transition-all' : 'opacity-75 transition-all'
      }
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center border shadow-k-sm overflow-hidden p-2 ${
                plugin.isActive
                  ? 'bg-success-bg border-success'
                  : 'bg-bg-muted border-border-default'
              }`}
            >
              <PluginIcon
                iconName={plugin.logo}
                size={24}
                className={plugin.isActive ? 'text-success' : 'text-fg-subtle'}
              />
            </div>
            <div>
              <h3 className="font-bold text-fg-default leading-tight">
                {plugin.name || plugin.id}
              </h3>
              <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-widest">
                {plugin.id}
              </span>
            </div>
          </div>

          {/* Toggle: Switch porque el cambio se persiste al instante (activa o
              desactiva el plugin en el servidor). */}
          <span title={plugin.isActive ? 'Desactivar plugin' : 'Activar plugin'}>
            <Switch checked={plugin.isActive} onChange={onToggle} disabled={isToggling} />
          </span>
        </div>

        {/* Description */}
        {plugin.description && (
          <p className="text-sm text-fg-muted mb-4 line-clamp-2">{plugin.description}</p>
        )}

        {/* Footer info */}
        <div className="flex items-center gap-3 text-xs text-fg-subtle">
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
            className={`ml-auto flex items-center gap-1 font-semibold ${
              plugin.isActive ? 'text-success-fg' : 'text-fg-subtle'
            }`}
          >
            {plugin.isActive ? 'Activo' : 'Inactivo'}
          </span>
        </div>
      </div>
    </Card>
  );
};
