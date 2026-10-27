import React from 'react';
import { cn } from '@openfactu/ui';

/**
 * Aurora de fondo: manchas difuminadas del color de acento que derivan despacio,
 * una rejilla fina que se desvanece hacia los bordes y un grano casi
 * imperceptible. Solo CSS (sin canvas): las manchas se mueven con `k-aurora-*`
 * (index.css) y se quedan quietas con `prefers-reduced-motion`. Los colores
 * salen de los tokens, así que sigue la marca de la empresa.
 *
 * - `variant="brand"` (pantallas de acceso): sobre el color principal del tema.
 * - `variant="subtle"` (estado vacío del chat): sin fondo propio, más tenue y
 *   con la rejilla en el color del texto, para no competir con el contenido.
 */
export const AuroraBackdrop: React.FC<{ variant?: 'brand' | 'subtle'; className?: string }> = ({
  variant = 'brand',
  className,
}) => {
  const subtle = variant === 'subtle';
  const line = subtle ? 'var(--fg-default)' : 'rgb(var(--color-primary-fg-rgb))';
  return (
    <div
      className={cn('absolute inset-0 overflow-hidden', !subtle && 'bg-primary', className)}
      aria-hidden="true"
    >
      {/* Aurora: tres manchas de acento a distinta escala y ritmo */}
      <div
        className={cn(
          'k-aurora k-aurora-1 absolute -top-[30%] -left-[20%] h-[80%] w-[80%] rounded-full blur-[110px]',
          subtle ? 'bg-accent/20' : 'bg-accent/40',
        )}
      />
      <div
        className={cn(
          'k-aurora k-aurora-2 absolute top-[20%] -right-[25%] h-[70%] w-[70%] rounded-full blur-[130px]',
          subtle ? 'bg-accent/10' : 'bg-accent/25',
        )}
      />
      <div
        className={cn(
          'k-aurora k-aurora-3 absolute -bottom-[35%] left-[10%] h-[75%] w-[75%] rounded-full blur-[120px]',
          subtle ? 'bg-accent/15' : 'bg-accent/30',
        )}
      />

      {/* Rejilla fina, visible en el centro y difuminada hacia los bordes */}
      <div
        className={cn('absolute inset-0', subtle ? 'opacity-[0.06]' : 'opacity-[0.12]')}
        style={{
          backgroundImage: `linear-gradient(to right, ${line} 1px, transparent 1px), linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 75%)',
        }}
      />

      {/* Grano: rompe el degradado para que no se vean bandas */}
      <div
        className="absolute inset-0 opacity-[0.08] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />
    </div>
  );
};
