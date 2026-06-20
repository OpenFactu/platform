import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface CtxItem {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  /** Submenú (un nivel). Si está presente se ignora `onClick`. */
  submenu?: CtxItem[];
}

interface CanvasContextMenuProps {
  x: number;
  y: number;
  items: CtxItem[];
  onClose: () => void;
}

const MENU_WIDTH = 220;

/**
 * Menú contextual posicionado en las coordenadas del cursor (createPortal a
 * `document.body`, `position:fixed`). Se clampa al viewport y se cierra al
 * hacer click fuera, hacer scroll, redimensionar, pulsar Escape o abrir otro
 * menú contextual. Soporta un nivel de submenú.
 *
 * Modelado sobre `RowActionsMenu` pero anclado al cursor en vez de a un botón.
 */
export const CanvasContextMenu: React.FC<CanvasContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: y, left: x });
  const [openSub, setOpenSub] = useState<number | null>(null);

  // Clamp al viewport una vez montado (conocemos el tamaño real del menú).
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    setPos({ top: Math.max(8, top), left: Math.max(8, left) });
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const renderItem = (it: CtxItem, i: number) => {
    const base =
      'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors ' +
      (it.destructive
        ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10'
        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800') +
      (it.disabled ? ' opacity-40 cursor-not-allowed' : '');

    const content = (
      <>
        {it.icon && <span className="shrink-0 w-4 flex justify-center">{it.icon}</span>}
        <span className="flex-1 truncate">{it.label}</span>
        {it.submenu && <span className="text-slate-400">›</span>}
      </>
    );

    return (
      <React.Fragment key={i}>
        {it.separatorBefore && (
          <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
        )}
        {it.submenu ? (
          <div
            className="relative"
            onMouseEnter={() => setOpenSub(i)}
            onMouseLeave={() => setOpenSub((s) => (s === i ? null : s))}
          >
            <button type="button" disabled={it.disabled} className={base}>
              {content}
            </button>
            {openSub === i && (
              <div
                className="absolute top-0 left-full ml-0.5 max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl py-1"
                style={{ width: MENU_WIDTH }}
              >
                {it.submenu.map((s, j) => (
                  <button
                    key={j}
                    type="button"
                    disabled={s.disabled}
                    onClick={() => {
                      if (s.disabled) return;
                      onClose();
                      s.onClick?.();
                    }}
                    className={
                      'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left ' +
                      'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800' +
                      (s.disabled ? ' opacity-40 cursor-not-allowed' : '')
                    }
                  >
                    {s.icon && <span className="shrink-0 w-4 flex justify-center">{s.icon}</span>}
                    <span className="flex-1 truncate">{s.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled={it.disabled}
            onClick={() => {
              if (it.disabled) return;
              onClose();
              it.onClick?.();
            }}
            className={base}
          >
            {content}
          </button>
        )}
      </React.Fragment>
    );
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
      className="fixed z-[9999] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl py-1"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map(renderItem)}
    </div>,
    document.body,
  );
};
