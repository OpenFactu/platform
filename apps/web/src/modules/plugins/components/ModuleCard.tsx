import React from 'react';
import { Badge, Switch, Card } from '@openfactu/ui';
import { PluginIcon } from '@/components/PluginIcon';
import type { Module } from '@/modules';

interface ModuleCardProps {
  module: Module;
  enabled: boolean;
  onToggle: () => void;
  isToggling: boolean;
}

/**
 * Tarjeta de un módulo core activable. El verde del estado "activo" sale de los
 * tokens `success` (semántico: sigue significando "encendido" en cualquier
 * tema), y la superficie del `Card` del paquete — antes era un `<div>` con
 * `bg-white dark:bg-slate-900`, que pintaba el mosaico de azul marino aunque la
 * empresa tuviera un tema grafito.
 */
export const ModuleCard: React.FC<ModuleCardProps> = ({
  module,
  enabled,
  onToggle,
  isToggling,
}) => {
  return (
    <Card
      noPadding
      className={
        enabled ? 'border-success shadow-k-sm transition-all' : 'opacity-75 transition-all'
      }
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center border shadow-k-sm overflow-hidden p-2 ${
                enabled ? 'bg-success-bg border-success' : 'bg-bg-muted border-border-default'
              }`}
            >
              <PluginIcon
                iconName={module.icon}
                size={24}
                className={enabled ? 'text-success' : 'text-fg-subtle'}
              />
            </div>
            <div>
              <h3 className="font-bold text-fg-default leading-tight">{module.label}</h3>
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
          <p className="text-sm text-fg-muted mb-4 line-clamp-2">{module.description}</p>
        )}

        <div className="flex items-center text-xs">
          <span
            className={`ml-auto flex items-center gap-1 font-semibold ${
              enabled ? 'text-success-fg' : 'text-fg-subtle'
            }`}
          >
            {enabled ? 'Activo' : 'Inactivo'}
          </span>
        </div>
      </div>
    </Card>
  );
};
