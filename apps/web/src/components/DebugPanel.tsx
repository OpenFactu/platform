/**
 * Panel flotante de utilidades de desarrollo. Solo se renderiza si:
 *   1. El servidor está en modo debug (`/api/setup/status` devuelve `debugEnabled: true`).
 *   2. O el usuario añade `?debug=1` a la URL.
 *
 * Acciones:
 *   - Reset setup: vacía tenants + config y vuelve al wizard.
 *   - Forzar setup: redirige con `?force=1` para mostrar el wizard sin tirar nada.
 *   - Re-seed geo: re-ejecuta seedGeo (países).
 *
 * No se muestra en producción salvo que se active explícitamente, para no
 * exponer botones destructivos a usuarios finales.
 */

import { coreApi, type RawResult } from '@/shared/api';
import React, { useEffect, useRef, useState } from 'react';
import { Bug, RotateCcw, Globe, AlertTriangle, X, ScanLine, GripVertical } from 'lucide-react';

const POS_KEY = 'keirost:debug-panel-pos';

/** Lee la posición guardada — {right, bottom} en px desde el borde inferior-derecho. */
function loadPos(): { right: number; bottom: number } {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p?.right === 'number' && typeof p?.bottom === 'number') return p;
    }
  } catch {
    /* noop */
  }
  return { right: 16, bottom: window.innerWidth < 768 ? 80 : 16 };
}

export const DebugPanel: React.FC = () => {
  const [debugEnabled, setDebugEnabled] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scanCode, setScanCode] = useState('');
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ right: number; bottom: number }>(() => loadPos());
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
    moved: boolean;
  } | null>(null);

  // Guarda la posición en localStorage cada vez que cambia (tras soltar).
  useEffect(() => {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {
      /* noop */
    }

    console.log('[DebugPanel] Position saved:', pos);
    console.log('[DebugPanel] debugEnabled:', debugEnabled);
  }, [pos]);

  const onDragPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    // Botón izquierdo o táctil.
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRight: pos.right,
      startBottom: pos.bottom,
      moved: false,
    };
  };

  const onDragPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    d.moved = true;
    // Movimiento: X derecha negativa mueve hacia la izquierda (aumenta `right`).
    const nextRight = Math.max(8, Math.min(window.innerWidth - 80, d.startRight - dx));
    const nextBottom = Math.max(8, Math.min(window.innerHeight - 80, d.startBottom - dy));
    setPos({ right: nextRight, bottom: nextBottom });
  };

  const onDragPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    dragRef.current = null;
    // Si se movió, cancelamos el click que vendría después.
    if (d?.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const didDrag = () => dragRef.current?.moved === true;

  useEffect(() => {
    const forceParam = new URLSearchParams(window.location.search).get('debug') === '1';
    coreApi
      .get<any>('/api/setup/status')
      .then((j) => setDebugEnabled(Boolean(j?.debugEnabled) || forceParam))
      .catch(() => setDebugEnabled(forceParam));
  }, []);

  // Atajo global Ctrl+Shift+B → abre el panel y enfoca el input de escaneo
  useEffect(() => {
    if (!debugEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'B' || e.key === 'b')) {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => scanInputRef.current?.focus(), 50);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [debugEnabled]);

  const fireScan = () => {
    const code = scanCode.trim();
    if (!code) return;
    window.dispatchEvent(new CustomEvent('keirost:scan', { detail: code }));
    setScanCode('');
    setMsg(`Código inyectado: ${code}`);
    setErr(null);
  };

  if (!debugEnabled) return null;

  const call = async (label: string, action: () => Promise<RawResult>) => {
    setBusy(label);
    setMsg(null);
    setErr(null);
    try {
      const r = await action();
      const body = r.data ?? {};
      if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
      setMsg(body?.message || JSON.stringify(body));
    } catch (e: any) {
      setErr(e?.message || 'Error');
    } finally {
      setBusy(null);
    }
  };

  const resetSetup = () => call('reset', () => coreApi.raw('POST', '/api/setup/dev-reset', {}));

  const reseedGeo = () => call('geo', () => coreApi.raw('POST', '/api/geo/seed'));

  const forceWizard = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('force', '1');
    url.pathname = '/';
    window.location.href = url.toString();
  };

  return (
    <div className="fixed z-[99999] font-sans" style={{ right: pos.right, bottom: pos.bottom }}>
      {open ? (
        <div className="w-80 rounded-lg shadow-2xl bg-amber-50 dark:bg-amber-950 border-2 border-amber-300 dark:border-amber-700 overflow-hidden">
          <div
            className="flex items-center justify-between px-3 py-2 bg-amber-200/60 dark:bg-amber-900/60 border-b border-amber-300 dark:border-amber-700 cursor-move select-none touch-none"
            onPointerDown={onDragPointerDown}
            onPointerMove={onDragPointerMove}
            onPointerUp={onDragPointerUp}
            title="Arrastra para mover"
          >
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 text-xs font-bold uppercase tracking-wider">
              <GripVertical size={12} className="opacity-60" />
              <Bug size={14} />
              Debug Setup
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-amber-700 dark:text-amber-300 hover:bg-amber-300/40 dark:hover:bg-amber-800/40 rounded p-1"
            >
              <X size={14} />
            </button>
          </div>
          <div className="p-3 space-y-2 text-xs text-amber-900 dark:text-amber-100">
            {/* Simulador de escáner — inyecta un código como si lo hubiese leído
                un lector HID o la cámara. `Ctrl+Shift+B` enfoca este input. */}
            <div className="rounded bg-white/70 dark:bg-amber-950/40 border border-amber-300/60 dark:border-amber-800/60 p-2 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                <ScanLine size={12} />
                Simular escáner{' '}
                <span className="font-mono opacity-60 normal-case">Ctrl+Shift+B</span>
              </div>
              <div className="flex gap-1">
                <input
                  ref={scanInputRef}
                  value={scanCode}
                  onChange={(e) => setScanCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      fireScan();
                    }
                  }}
                  placeholder="Pega o teclea el código + Enter"
                  className="flex-1 min-w-0 px-2 py-1 rounded border border-amber-300 dark:border-amber-800 bg-white dark:bg-amber-950 text-amber-900 dark:text-amber-100 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <button
                  type="button"
                  onClick={fireScan}
                  disabled={!scanCode.trim()}
                  className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-[10px] font-bold"
                >
                  Disparar
                </button>
              </div>
            </div>

            <div className="flex items-start gap-2 text-[10px] leading-snug">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>
                Acciones destructivas — solo úsalas en desarrollo. Pondrán la app en estado inicial.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    '¿Resetear setup completamente?\n\nVa a borrar:\n- Todos los tenants y sus schemas\n- Todos los usuarios globales\n- El archivo de configuración\n\nLos países (Country/Region/...) se conservan.',
                  )
                ) {
                  resetSetup();
                }
              }}
              disabled={!!busy}
              className="w-full flex items-center gap-2 px-3 py-2 rounded bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold"
            >
              <RotateCcw size={13} />
              {busy === 'reset' ? 'Reseteando…' : 'Reset setup completo'}
            </button>
            <button
              type="button"
              onClick={forceWizard}
              disabled={!!busy}
              className="w-full flex items-center gap-2 px-3 py-2 rounded bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold"
            >
              <Bug size={13} />
              Forzar wizard (?force=1)
            </button>
            <button
              type="button"
              onClick={reseedGeo}
              disabled={!!busy}
              className="w-full flex items-center gap-2 px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold"
            >
              <Globe size={13} />
              {busy === 'geo' ? 'Sembrando…' : 'Re-cargar países / geografía'}
            </button>
            {msg && (
              <div className="px-2 py-1.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 text-[10px] break-words">
                ✓ {msg}
              </div>
            )}
            {err && (
              <div className="px-2 py-1.5 rounded bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-200 text-[10px] break-words">
                ⚠ {err}
              </div>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (didDrag()) return;
            setOpen(true);
          }}
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerUp}
          title="Panel de debug del setup — arrástrame para moverme"
          className="flex items-center gap-1.5 px-3 py-2 rounded-full shadow-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold uppercase tracking-wider border-2 border-amber-300 cursor-grab active:cursor-grabbing touch-none select-none"
        >
          <Bug size={14} />
          Debug
        </button>
      )}
    </div>
  );
};
