/**
 * Logo oficial Keirost — monograma hexagonal con K interior + punto teal.
 *
 * Variantes:
 *   - "dark" (default): fondo #0A1628 con líneas blancas y borde teal.
 *   - "light": fondo #F0FAFA con líneas ink y borde teal.
 *   - "outline": fondo blanco, borde ink, líneas teal.
 *   - "accent": fondo teal sólido, líneas blancas.
 *   - "mono": gris neutro (para impresión o contextos sin color).
 *
 * Por defecto se renderiza respetando el tamaño que le pases via prop `size`.
 * Usa `variant` para adaptarlo al fondo donde lo vayas a montar.
 */

import React from 'react';

export type KeirostLogoVariant = 'dark' | 'light' | 'outline' | 'accent' | 'mono';

interface Props {
  size?: number;
  variant?: KeirostLogoVariant;
  className?: string;
  title?: string;
}

function resolveColors(variant: KeirostLogoVariant) {
  switch (variant) {
    case 'light':
      return { bg: '#F0FAFA', border: '#0D9488', k: '#0A1628', dot: '#0D9488' };
    case 'outline':
      return { bg: '#FFFFFF', border: '#0A1628', k: '#0D9488', dot: '#0D9488' };
    case 'accent':
      return { bg: '#0D9488', border: 'rgba(255,255,255,0.3)', k: '#FFFFFF', dot: '#FFFFFF' };
    case 'mono':
      return { bg: '#F1F5F9', border: '#94A3B8', k: '#64748B', dot: '#94A3B8' };
    case 'dark':
    default:
      return { bg: '#0A1628', border: '#0D9488', k: '#FFFFFF', dot: '#0D9488' };
  }
}

export const KeirostLogo: React.FC<Props> = ({
  size = 40,
  variant = 'dark',
  className,
  title = 'Keirost',
}) => {
  const c = resolveColors(variant);
  // El viewBox coincide con el brand guide para mantener proporciones.
  const uid = React.useId();
  return (
    <svg
      width={size}
      height={(size * 176) / 152}
      viewBox="264 22 152 176"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <defs>
        <clipPath id={`hc-${uid}`}>
          <polygon points="340,22 416,66 416,154 340,198 264,154 264,66" />
        </clipPath>
      </defs>
      <polygon points="340,22 416,66 416,154 340,198 264,154 264,66" fill={c.bg} />
      <polygon
        points="340,22 416,66 416,154 340,198 264,154 264,66"
        fill="none"
        stroke={c.border}
        strokeWidth={5}
      />
      <g clipPath={`url(#hc-${uid})`}>
        <line
          x1="310"
          y1="22"
          x2="310"
          y2="198"
          stroke={c.k}
          strokeWidth={17}
          strokeLinecap="butt"
        />
        <line
          x1="319"
          y1="110"
          x2="422"
          y2="46"
          stroke={c.k}
          strokeWidth={17}
          strokeLinecap="round"
        />
        <line
          x1="319"
          y1="110"
          x2="422"
          y2="174"
          stroke={c.k}
          strokeWidth={17}
          strokeLinecap="round"
        />
      </g>
      <circle cx={319} cy={110} r={7} fill={c.dot} />
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
}> = ({ size = 40, variant = 'dark', className, showErp = true }) => (
  <span className={`inline-flex items-center gap-3 ${className || ''}`}>
    <KeirostLogo size={size} variant={variant} />
    <span
      className="font-display font-extrabold tracking-tight leading-none"
      style={{ fontSize: `${size * 0.65}px`, fontFamily: "'Syne', sans-serif" }}
    >
      <span style={{ color: variant === 'accent' ? '#FFFFFF' : '#0A1628' }}>Keirost</span>
      {showErp && <span style={{ color: '#0D9488', marginLeft: `${size * 0.15}px` }}>ERP</span>}
    </span>
  </span>
);
