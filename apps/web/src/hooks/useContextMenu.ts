import { useCallback, useState } from 'react';

interface ContextMenuState<T> {
  x: number;
  y: number;
  data: T;
}

/**
 * Gestiona la posición y el dato objetivo de un menú contextual (click derecho).
 * Úsalo junto a `<ContextMenu>` (components/common/ContextMenu.tsx):
 *
 *   const ctxMenu = useContextMenu<MyRow>();
 *   <div onContextMenu={(e) => ctxMenu.open(e, row)}>...</div>
 *   {ctxMenu.state && (
 *     <ContextMenu x={ctxMenu.state.x} y={ctxMenu.state.y} items={...} onClose={ctxMenu.close} />
 *   )}
 */
export function useContextMenu<T>() {
  const [state, setState] = useState<ContextMenuState<T> | null>(null);

  const open = useCallback((e: React.MouseEvent, data: T) => {
    e.preventDefault();
    e.stopPropagation();
    setState({ x: e.clientX, y: e.clientY, data });
  }, []);

  const close = useCallback(() => setState(null), []);

  return { state, open, close };
}
