import React from 'react';
import * as LucideIcons from 'lucide-react';
import { cn } from '@openfactu/ui';

interface PluginIconProps {
  iconName?: string;
  className?: string;
  size?: number;
  strokeWidth?: number;
}

export const PluginIcon: React.FC<PluginIconProps> = ({
  iconName,
  className,
  size = 18,
  strokeWidth,
}) => {
  if (!iconName) {
    return <LucideIcons.Puzzle size={size} strokeWidth={strokeWidth} className={className} />;
  }

  // 1. Verificar si es una URL o ruta de archivo
  if (iconName.startsWith('http') || iconName.startsWith('/') || iconName.includes('.')) {
    return (
      <img
        src={iconName}
        alt="Plugin Icon"
        className={cn('object-contain', className)}
        style={{ width: size, height: size }}
        onError={(e) => {
          // Fallback si la imagen falla
          (e.target as HTMLImageElement).src =
            'https://cdn-icons-png.flaticon.com/512/3524/3524659.png';
        }}
      />
    );
  }

  // 2. Intentar buscar en Lucide
  const IconComponent = (LucideIcons as any)[iconName];
  if (IconComponent) {
    return <IconComponent size={size} strokeWidth={strokeWidth} className={className} />;
  }

  // 3. Fallback final
  return <LucideIcons.Puzzle size={size} strokeWidth={strokeWidth} className={className} />;
};
