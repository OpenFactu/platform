import { useEffect, useRef } from 'react';

/** Animate against the existing deadline; polling must never restart the countdown. */
export function KioskCountdownBar({
  expiresAt,
  remaining,
}: {
  expiresAt: string;
  remaining: number;
}) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animation: Animation | undefined;
    const sync = () => {
      animation?.cancel();
      const duration = Math.min(30_000, Math.max(0, Date.parse(expiresAt) - Date.now()));
      if (reduced.matches || !Number.isFinite(duration) || !duration) return;
      animation = element.animate(
        [{ transform: `scaleX(${duration / 30_000})` }, { transform: 'scaleX(0)' }],
        { duration, easing: 'linear', fill: 'forwards' },
      );
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    reduced.addEventListener('change', sync);
    return () => {
      animation?.cancel();
      document.removeEventListener('visibilitychange', sync);
      reduced.removeEventListener('change', sync);
    };
  }, [expiresAt]);
  return (
    <div className="h-1 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
      <div
        ref={bar}
        className={`h-full w-full origin-left ${remaining <= 5 ? 'bg-amber-400' : 'bg-emerald-400'}`}
        style={{ transform: `scaleX(${remaining / 30})` }}
      />
    </div>
  );
}
