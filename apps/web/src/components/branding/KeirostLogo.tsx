/**
 * Logo oficial Keirost — K de trazo redondeado con punto teal en el cruce, sin contenedor.
 *
 * Variantes (según el fondo donde se monte):
 *   - "auto" (default): la K toma `currentColor`, así sigue al tema claro/oscuro.
 *   - "dark": para fondos oscuros, K blanca.
 *   - "light": para fondos claros, K tinta (#0A1628).
 *   - "accent": para fondos teal, K blanca y punto tinta.
 *   - "mono": un solo color (impresión o contextos sin color); el punto se funde.
 *   - "tile": icono de app, K blanca sobre baldosa tinta redondeada.
 *
 * Los mismos trazos están en `public/favicon.svg` y `public/brand/*.svg`: si cambias
 * la geometría aquí, cámbiala allí también.
 */

import React from 'react';

export type KeirostLogoVariant = 'auto' | 'dark' | 'light' | 'accent' | 'mono' | 'tile';

interface Props {
  size?: number;
  variant?: KeirostLogoVariant;
  className?: string;
  title?: string;
}

const INK = '#0A1628';
const TEAL = '#0D9488';

function resolveColors(variant: KeirostLogoVariant) {
  switch (variant) {
    case 'dark':
    case 'tile':
      return { k: '#FFFFFF', dot: TEAL };
    case 'light':
      return { k: INK, dot: TEAL };
    case 'accent':
      return { k: '#FFFFFF', dot: INK };
    case 'mono':
      return { k: '#64748B', dot: '#64748B' };
    case 'auto':
    default:
      return { k: 'currentColor', dot: TEAL };
  }
}

export const KeirostLogo: React.FC<Props> = ({
  size = 40,
  variant = 'auto',
  className,
  title = 'Keirost',
}) => {
  const c = resolveColors(variant);
  const stroke = {
    fill: 'none',
    stroke: c.k,
    strokeWidth: 13,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg
      width={size}
      height={size}
      // Sin baldosa se recorta el aire de alrededor para que la K ocupe el tamaño pedido.
      viewBox={variant === 'tile' ? '0 0 100 100' : '12 11 78 78'}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {variant === 'tile' && <rect width="100" height="100" rx="22" fill={INK} />}
      <g transform={variant === 'tile' ? 'translate(50 50) scale(0.62) translate(-51 -50)' : undefined}>
        <path d="M30 20V80" {...stroke} />
        <path d="M72 20L50 50L72 80" {...stroke} />
        <circle cx="50" cy="50" r="5" fill={c.dot} />
      </g>
    </svg>
  );
};

/**
 * Wordmark completo: monograma + "Keirost" + "ERP" acentuado.
 */
export const KeirostWordmark: React.FC<{
  size?: number;
  variant?: KeirostLogoVariant;
  className?: string;
  showErp?: boolean;
}> = ({ size = 40, variant = 'auto', className, showErp = true }) => {
  const textColor =
    variant === 'dark' || variant === 'accent' ? '#FFFFFF' : variant === 'light' ? INK : undefined;
  return (
    <span className={`inline-flex items-center gap-3 ${className || ''}`}>
      <KeirostLogo size={size} variant={variant} />
      <span
        className="font-display font-extrabold tracking-tight leading-none"
        style={{ fontSize: `${size * 0.65}px`, fontFamily: "'Syne', sans-serif", color: textColor }}
      >
        Keirost
        {showErp && (
          <span style={{ color: variant === 'accent' ? INK : TEAL, marginLeft: `${size * 0.15}px` }}>
            ERP
          </span>
        )}
      </span>
    </span>
  );
};
