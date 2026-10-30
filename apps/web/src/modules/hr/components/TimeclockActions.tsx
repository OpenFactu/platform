import { Coffee, LogIn, LogOut, RotateCcw } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import type { TimeclockEntry } from '../domain/timeclock';
const actions = [
  { kind: 'in', label: 'hrTime.actions.in', Icon: LogIn },
  { kind: 'out', label: 'hrTime.actions.out', Icon: LogOut },
  { kind: 'break_start', label: 'hrTime.actions.breakStart', Icon: Coffee },
  { kind: 'break_end', label: 'hrTime.actions.breakEnd', Icon: RotateCcw },
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
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-3" aria-label={t('hrTime.actions.aria')}>
      {actions.map(({ kind, label, Icon }) => (
        <button
          key={kind}
          type="button"
          disabled={busy || !allowedActions.includes(kind)}
          onClick={() => onPunch(kind)}
          className={`flex min-h-20 items-center justify-center gap-2 rounded-lg px-4 py-4 text-base font-semibold transition-colors disabled:opacity-35 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 ${kiosk ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300 focus-visible:outline-white' : 'bg-accent text-accent-fg hover:opacity-90 focus-visible:outline-accent'}`}
        >
          <Icon size={22} />
          {t(label)}
        </button>
      ))}
    </div>
  );
}
