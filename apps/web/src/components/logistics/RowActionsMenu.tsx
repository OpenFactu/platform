import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

export interface RowAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface Props {
  actions: RowAction[];
  size?: number;
}

/**
 * Menú ⋯ (kebab) con popup vía portal para que no lo recorten contenedores
 * con `overflow: hidden` (p. ej. `Card` de @openfactu/ui). Click fuera → cierra.
 */
export const RowActionsMenu: React.FC<Props> = ({ actions, size = 13 }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const MENU_WIDTH = 220;

  const place = () => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    // Alinea a la derecha del botón; si no cabe, pega al borde derecho del viewport.
    const left = Math.max(8, Math.min(b.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    const top = b.bottom + 4;
    setPos({ top, left });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = () => place();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded shrink-0"
        title="Más acciones"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical size={size} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              top: pos.top,
              left: pos.left,
              width: MENU_WIDTH,
              transformOrigin: 'top right',
            }}
            className="fixed z-[9999] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl py-1 row-actions-menu-in"
          >
            {actions.map((a, i) => (
              <button
                key={i}
                role="menuitem"
                disabled={a.disabled}
                onClick={() => {
                  if (a.disabled) return;
                  setOpen(false);
                  a.onClick();
                }}
                className={
                  'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ' +
                  (a.destructive
                    ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800') +
                  (a.disabled ? ' opacity-40 cursor-not-allowed' : '')
                }
              >
                {a.icon && <span className="shrink-0 w-4 flex justify-center">{a.icon}</span>}
                <span className="flex-1 truncate">{a.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
};
