import React from 'react';
import { cn } from '@openfactu/ui';
import { PluginIcon } from '../PluginIcon';

interface NavIconChipProps {
  iconName?: string;
  size?: number;
  active?: boolean;
}

/**
 * Icono de navegación envuelto en un chip cuadrado redondeado — mismo
 * lenguaje visual que ya usan las tarjetas de módulo/plugin (color = algo
 * relevante, aquí "es el módulo activo"), en vez del icono pelado que
 * llevaba el sidebar antes.
 */
export const NavIconChip: React.FC<NavIconChipProps> = ({ iconName, size = 18, active }) => {
  const chipSize = size + 12;
  return (
    <span
      className={cn(
        'flex items-center justify-center rounded-lg border shrink-0',
        active
          ? 'bg-accent/15 border-accent/30 text-accent'
          : 'bg-bg-muted border-border-default text-fg-body',
      )}
      style={{ width: chipSize, height: chipSize }}
    >
      <PluginIcon iconName={iconName} size={size} strokeWidth={2.25} />
    </span>
  );
};
