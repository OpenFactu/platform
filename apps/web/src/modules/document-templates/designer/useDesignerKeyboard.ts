import { useEffect } from 'react';
import type { LayoutEditor } from './useLayoutEditor';

/** Atajos de teclado. No se interceptan si el foco está escribiendo en algún campo. */
export function useDesignerKeyboard(args: {
  editor: LayoutEditor;
  undo: () => void;
  redo: () => void;
  save: () => void;
  enabled: boolean;
}) {
  const { editor, undo, redo, save, enabled } = args;

  // Sin dependencias a propósito: los manejadores cambian en cada render.
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }
      const key = e.key.toLowerCase();
      const single = editor.selection.length === 1 ? editor.selection[0] : null;

      if (e.ctrlKey || e.metaKey) {
        if (key === 'z' && !e.shiftKey) undo();
        else if ((key === 'z' && e.shiftKey) || key === 'y') redo();
        else if (key === 's') save();
        else if (key === 'd' && single) editor.duplicateElement(single);
        else if (key === 'c' && single) editor.copyElement(single);
        else if (key === 'v') editor.pasteHere();
        else return;
        e.preventDefault();
        return;
      }

      if (e.key === 'Escape') {
        editor.setSelection([]);
        return;
      }
      if (editor.selection.length === 0) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        editor.removeSelection();
        return;
      }
      const step = e.shiftKey ? 5 : 1;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (moves[e.key]) {
        e.preventDefault();
        editor.nudge(moves[e.key][0], moves[e.key][1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}
