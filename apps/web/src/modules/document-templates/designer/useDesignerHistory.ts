import { useEffect, useRef, useState } from 'react';
import type { CanvasLayout } from '../components/canvas/types';

/**
 * Deshacer y rehacer. Pilas de estados de `layout`; una ráfaga de cambios (arrastre,
 * tecleo) se agrupa en un solo paso: se guarda el estado de antes de la ráfaga una vez.
 */
export function useDesignerHistory(args: {
  layout: CanvasLayout;
  setLayout: (layout: CanvasLayout) => void;
  /** Mientras carga, los cambios no cuentan: abrir la plantilla no se deshace. */
  ready: boolean;
  onRestore: () => void;
}) {
  const { layout, setLayout, ready, onRestore } = args;
  const pastRef = useRef<CanvasLayout[]>([]);
  const futureRef = useRef<CanvasLayout[]>([]);
  const prevLayoutRef = useRef<CanvasLayout>(layout);
  const pendingBeforeRef = useRef<CanvasLayout | null>(null);
  const histTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipHistoryRef = useRef(false);
  const loadedRef = useRef(false);
  const [, setHistVer] = useState(0);
  const forceHist = () => setHistVer((v) => v + 1);

  const commitPending = () => {
    if (histTimerRef.current) {
      clearTimeout(histTimerRef.current);
      histTimerRef.current = null;
    }
    if (pendingBeforeRef.current) {
      pastRef.current.push(pendingBeforeRef.current);
      if (pastRef.current.length > 60) pastRef.current.shift();
      pendingBeforeRef.current = null;
    }
  };

  useEffect(() => {
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      prevLayoutRef.current = layout;
      return;
    }
    if (!ready || !loadedRef.current) {
      loadedRef.current = ready;
      prevLayoutRef.current = layout;
      return;
    }
    // Arranque de ráfaga: capturamos el estado previo una sola vez y limpiamos redo.
    if (!histTimerRef.current && !pendingBeforeRef.current) {
      pendingBeforeRef.current = prevLayoutRef.current;
      futureRef.current = [];
      forceHist();
    }
    if (histTimerRef.current) clearTimeout(histTimerRef.current);
    histTimerRef.current = setTimeout(() => {
      commitPending();
      forceHist();
    }, 500);
    prevLayoutRef.current = layout;
  }, [layout, ready]);

  const undo = () => {
    commitPending();
    if (pastRef.current.length === 0) return;
    const prev = pastRef.current.pop() as CanvasLayout;
    futureRef.current.push(prevLayoutRef.current);
    skipHistoryRef.current = true;
    prevLayoutRef.current = prev;
    setLayout(prev);
    onRestore();
    forceHist();
  };

  const redo = () => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current.pop() as CanvasLayout;
    pastRef.current.push(prevLayoutRef.current);
    skipHistoryRef.current = true;
    prevLayoutRef.current = next;
    setLayout(next);
    onRestore();
    forceHist();
  };

  return {
    undo,
    redo,
    canUndo: pastRef.current.length > 0 || pendingBeforeRef.current != null,
    canRedo: futureRef.current.length > 0,
  };
}
