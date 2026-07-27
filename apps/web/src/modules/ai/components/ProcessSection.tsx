import React, { useState } from 'react';
import { Loader2, Brain, ChevronDown } from 'lucide-react';

/**
 * Agrupa TODO el "proceso" de un turno (razonamiento + tools de lectura: qué
 * consultó, qué vio) detrás de un único toggle, cerrado por defecto — antes
 * cada paso salía como un bloque separado siempre visible, muy ruidoso en
 * turnos largos. Solo el resultado final (texto, tarjetas de acción) queda
 * fuera de aquí, siempre visible. Mientras el turno sigue trabajando, la
 * etiqueta muestra un spinner con el nº de pasos aunque el panel esté cerrado
 * — para no perder la única señal de actividad.
 */
export const ProcessSection: React.FC<{
  active: boolean;
  children: React.ReactNode;
  count: number;
}> = ({ active, children, count }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-bold text-fg-muted hover:text-accent dark:hover:text-accent transition-colors"
      >
        {active ? <Loader2 size={12} className="animate-spin text-accent" /> : <Brain size={12} />}
        {active ? 'Pensando…' : `Ver proceso (${count} paso${count === 1 ? '' : 's'})`}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="pl-3 border-l-2 border-border-default space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      )}
    </div>
  );
};
