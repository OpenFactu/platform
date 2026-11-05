import React from 'react';
import { Truck } from 'lucide-react';
import { cn } from '@openfactu/ui';

type PinTone = 'accent' | 'success' | 'muted';

const TONE_STYLE: Record<PinTone, React.CSSProperties> = {
  accent: { background: 'var(--color-accent)', color: 'var(--color-accent-fg)' },
  success: { background: 'var(--k-success)', color: 'var(--k-success-on)' },
  muted: { background: 'var(--bg-muted)', color: 'var(--fg-muted)' },
};

/**
 * Chincheta de mapa con un número: el orden de una parada. `Marker` centra lo que le
 * dan en el punto, así que en el mapa sube media altura para apuntar con la punta.
 * Fuera del mapa, en una lista, va con `onMap={false}`.
 */
export const NumberedPin: React.FC<{
  label: React.ReactNode;
  tone?: PinTone;
  onMap?: boolean;
}> = ({ label, tone = 'accent', onMap = true }) => (
  <span
    className={cn('relative block h-10 w-8 drop-shadow-md', onMap && '-translate-y-1/2')}
    style={{ color: TONE_STYLE[tone].color }}
  >
    <svg viewBox="0 0 32 40" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <path
        d="M16 1.5C8 1.5 1.5 8 1.5 16c0 10.5 14.5 22.5 14.5 22.5S30.5 26.5 30.5 16C30.5 8 24 1.5 16 1.5Z"
        fill={TONE_STYLE[tone].background as string}
        stroke="var(--bg-app)"
        strokeWidth="2.5"
      />
    </svg>
    <span className="relative flex h-8 w-8 items-center justify-center text-xs font-black">
      {label}
    </span>
  </span>
);

/** Punto de "aquí está el conductor". */
export const PositionDot: React.FC<{ className?: string }> = ({ className }) => (
  <span
    style={{ background: 'var(--k-info)', boxShadow: '0 0 0 4px var(--k-info-bg)' }}
    className={cn('block h-4 w-4 rounded-full border-[3px] border-bg-card', className)}
  />
);

/** El camión, en el seguimiento público. */
export const TruckPin: React.FC = () => (
  <span
    style={TONE_STYLE.accent}
    className="flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-bg-card shadow-lg"
  >
    <Truck size={16} />
  </span>
);
