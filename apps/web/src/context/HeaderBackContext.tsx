import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useCurrentTabId } from './TabsContext';

/**
 * En móvil hay una sola flecha de volver, la de la barra superior. Lo normal es que
 * cierre la pestaña; una pantalla que vuelve a otra cosa (a su listado dentro de la misma
 * pestaña, por ejemplo) se lo dice aquí, con `PageBack`, y la flecha hace eso.
 */
type Backs = Record<string, () => void>;

interface Ctx {
  backs: Backs;
  set: (tabId: string, back: (() => void) | null) => void;
}

const HeaderBackCtx = createContext<Ctx | null>(null);

export const HeaderBackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [backs, setBacks] = useState<Backs>({});
  const set = useCallback<Ctx['set']>(
    (tabId, back) =>
      setBacks((prev) => {
        const next = { ...prev };
        if (back) next[tabId] = back;
        else delete next[tabId];
        return next;
      }),
    [],
  );
  const value = useMemo<Ctx>(() => ({ backs, set }), [backs, set]);
  return <HeaderBackCtx.Provider value={value}>{children}</HeaderBackCtx.Provider>;
};

/** Lo que hace «volver» en esa pestaña, si su pantalla ha dicho algo. */
export function useHeaderBackFor(tabId: string | null | undefined): (() => void) | null {
  const ctx = useContext(HeaderBackCtx);
  return tabId ? (ctx?.backs[tabId] ?? null) : null;
}

/** Hay barra superior que se encargue: fuera del layout principal no la hay. */
export function useHasHeaderBack(): boolean {
  return !!useContext(HeaderBackCtx);
}

/** Registra lo que hace «volver» en esta pantalla mientras `enabled`. */
export function useRegisterHeaderBack(back: (() => void) | undefined, enabled: boolean): void {
  const ctx = useContext(HeaderBackCtx);
  const tabId = useCurrentTabId();
  const latest = useRef(back);
  useEffect(() => {
    latest.current = back;
  });
  const set = ctx?.set;
  const active = enabled && !!back;

  useEffect(() => {
    if (!set || !tabId || !active) return;
    set(tabId, () => latest.current?.());
    return () => set(tabId, null);
  }, [set, tabId, active]);
}
