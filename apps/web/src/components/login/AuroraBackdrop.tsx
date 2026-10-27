import React from 'react';

/**
 * Fondo de las pantallas de acceso: una aurora suave del color de acento sobre
 * el color principal del tema, con una rejilla fina que se desvanece hacia los
 * bordes y un grano casi imperceptible. Solo CSS (sin canvas): las manchas
 * derivan despacio con `k-aurora-*` (index.css) y se quedan quietas con
 * `prefers-reduced-motion`. Los colores salen de los tokens, así que sigue la
 * marca de la empresa.
 */
export const AuroraBackdrop: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden bg-primary" aria-hidden="true">
    {/* Aurora: tres manchas de acento a distinta escala y ritmo */}
    <div className="k-aurora k-aurora-1 absolute -top-[30%] -left-[20%] h-[80%] w-[80%] rounded-full bg-accent/40 blur-[110px]" />
    <div className="k-aurora k-aurora-2 absolute top-[20%] -right-[25%] h-[70%] w-[70%] rounded-full bg-accent/25 blur-[130px]" />
    <div className="k-aurora k-aurora-3 absolute -bottom-[35%] left-[10%] h-[75%] w-[75%] rounded-full bg-accent/30 blur-[120px]" />

    {/* Rejilla fina, visible en el centro y difuminada hacia los bordes */}
    <div
      className="absolute inset-0 opacity-[0.12]"
      style={{
        backgroundImage:
          'linear-gradient(to right, rgb(var(--color-primary-fg-rgb)) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--color-primary-fg-rgb)) 1px, transparent 1px)',
        backgroundSize: '56px 56px',
        maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 75%)',
        WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 75%)',
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
