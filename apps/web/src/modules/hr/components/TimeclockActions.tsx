import { Coffee, LogIn, LogOut, RotateCcw } from 'lucide-react';
import type { TimeclockEntry } from '../domain/timeclock';
const actions = [
  { kind: 'in', label: 'Entrada', Icon: LogIn },
  { kind: 'out', label: 'Salida', Icon: LogOut },
  { kind: 'break_start', label: 'Iniciar pausa', Icon: Coffee },
  { kind: 'break_end', label: 'Volver de pausa', Icon: RotateCcw },
] as const;
export function TimeclockActions({
  allowedActions,
  busy,
  onPunch,
  kiosk = false,
}: {
  allowedActions: TimeclockEntry['kind'][];
  busy: boolean;
  onPunch: (kind: TimeclockEntry['kind']) => void;
  kiosk?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3" aria-label="Acciones de fichaje">
      {actions.map(({ kind, label, Icon }) => (
        <button
          key={kind}
          type="button"
          disabled={busy || !allowedActions.includes(kind)}
          onClick={() => onPunch(kind)}
          className={`flex min-h-20 items-center justify-center gap-2 rounded-lg px-4 py-4 text-base font-semibold transition-colors disabled:opacity-35 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 ${kiosk ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300 focus-visible:outline-white' : 'bg-accent text-white hover:opacity-90 focus-visible:outline-accent'}`}
        >
          <Icon size={22} />
          {label}
        </button>
      ))}
    </div>
  );
}
