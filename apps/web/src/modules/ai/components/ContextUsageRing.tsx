import React from 'react';

/**
 * Anillo circular de "contexto usado" — vive en el compositor, junto al resto
 * de controles. `used` es una estimación cliente (mismo ~4 car./token que
 * MessageFooter) sobre TODO el historial + el borrador actual; `limit` es
 * `contextWindow` real si el proveedor es local/Ollama (ver /api/ai/capabilities)
 * o un techo genérico para proveedores cloud, donde no gestionamos ese dato.
 */
export const ContextUsageRing: React.FC<{ used: number; limit: number; approx: boolean }> = ({
  used,
  limit,
  approx,
}) => {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const size = 26;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const colorClass =
    pct >= 90 ? 'stroke-rose-500' : pct >= 70 ? 'stroke-amber-500' : 'stroke-accent';

  return (
    <div className="group/ctx relative shrink-0 inline-flex items-center justify-center cursor-default">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-200 dark:stroke-slate-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`${colorClass} transition-[stroke-dashoffset] duration-300`}
        />
      </svg>
      {/* Tooltip propio — un native `title` tarda en aparecer y es fácil pasarlo
          por alto; esto se muestra al instante justo encima del anillo. */}
      <div
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 whitespace-nowrap
          rounded-md bg-slate-900 dark:bg-slate-700 text-white text-[11px] px-2 py-1 shadow-lg
          opacity-0 scale-95 group-hover/ctx:opacity-100 group-hover/ctx:scale-100 transition-all duration-150"
      >
        {approx ? '~' : ''}
        {used.toLocaleString('es-ES')} / {limit.toLocaleString('es-ES')} tokens de contexto ({pct}%)
      </div>
    </div>
  );
};
