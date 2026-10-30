import React from 'react';
import * as LucideIcons from 'lucide-react';
import { cn } from '@openfactu/ui';
import type { IconWeight } from '@phosphor-icons/react';
import { PHOSPHOR_BY_LUCIDE } from './icons/phosphorIcons';

/** `book-user` → `BookUser`, que es como lo exporta Lucide. */
function toPascalCase(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

interface PluginIconProps {
  iconName?: string;
  className?: string;
  size?: number;
  strokeWidth?: number;
  /**
   * `phosphor` pinta el equivalente de Phosphor (el estilo del menú) si lo
   * hay; si no, Lucide. El nombre se sigue escribiendo en el vocabulario de
   * Lucide, que es el que declaran módulos y plugins.
   */
  family?: 'lucide' | 'phosphor';
  /** Peso de Phosphor: `duotone` para destacar el activo. */
  weight?: IconWeight;
}

export const PluginIcon: React.FC<PluginIconProps> = ({
  iconName,
  className,
  size = 18,
  strokeWidth,
  family = 'lucide',
  weight = 'regular',
}) => {
  if (family === 'phosphor' && iconName) {
    const Phosphor = PHOSPHOR_BY_LUCIDE[iconName] ?? PHOSPHOR_BY_LUCIDE[toPascalCase(iconName)];
    if (Phosphor) return <Phosphor size={size} weight={weight} className={className} />;
  }

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

  // 2. Intentar buscar en Lucide, tal cual y en PascalCase.
  //
  // Lucide EXPORTA en PascalCase (`BookUser`) pero DOCUMENTA en kebab
  // (`book-user`), así que quien copia un nombre de su web escribe la forma
  // que no existe y se lleva un icono de puzle sin entender por qué. Pasaba ya
  // con `/hr/employees` y volvería a pasar con el primer plugin que declare un
  // icono.
  const icons = LucideIcons as unknown as Record<
    string,
    React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  >;
  const IconComponent = icons[iconName] || icons[toPascalCase(iconName)];
  if (IconComponent) {
    return <IconComponent size={size} strokeWidth={strokeWidth} className={className} />;
  }

  // 3. Fallback final
  return <LucideIcons.Puzzle size={size} strokeWidth={strokeWidth} className={className} />;
};
