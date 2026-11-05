import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FloatingAction } from '@openfactu/ui';
import { useCurrentTabId } from './TabsContext';

/**
 * Acciones de la pantalla para el botón flotante de móvil.
 *
 * En móvil las acciones de un documento (asentar, PDF, enviar, cancelar…) no van
 * en filas de botones bajo el título: cada componente las registra aquí y
 * `MobileActionButton` las pinta en su único `FloatingActionButton`, junto a
 * «Escanear» si la pantalla lo admite. Uno solo, porque dos FAB en la misma esquina
 * se tapan.
 *
 * Se guardan por pestaña (varias pueden estar montadas a la vez, ver TabsHost)
 * y, dentro de ella, por `source`, para que varios componentes aporten las suyas.
 */
type Registry = Record<string, Record<string, FloatingAction[]>>;

interface Ctx {
  registry: Registry;
  set: (tabId: string, source: string, actions: FloatingAction[] | null) => void;
  /** Pestañas cuya pantalla no quiere botón flotante. */
  hiddenTabs: string[];
  setHidden: (tabId: string, hidden: boolean) => void;
}

const MobilePageActionsCtx = createContext<Ctx | null>(null);

export const MobilePageActionsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [registry, setRegistry] = useState<Registry>({});
  // Estable: los efectos que registran dependen de ella y no deben repetirse
  // cada vez que otro componente cambia el registro.
  const set = useCallback<Ctx['set']>(
    (tabId, source, actions) =>
      setRegistry((prev) => {
        const tab = { ...prev[tabId] };
        if (actions?.length) tab[source] = actions;
        else delete tab[source];
        return { ...prev, [tabId]: tab };
      }),
    [],
  );
  const [hiddenTabs, setHiddenTabs] = useState<string[]>([]);
  const setHidden = useCallback<Ctx['setHidden']>(
    (tabId, hidden) =>
      setHiddenTabs((prev) => {
        const rest = prev.filter((id) => id !== tabId);
        return hidden ? [...rest, tabId] : rest;
      }),
    [],
  );
  const value = useMemo<Ctx>(
    () => ({ registry, set, hiddenTabs, setHidden }),
    [registry, set, hiddenTabs, setHidden],
  );
  return <MobilePageActionsCtx.Provider value={value}>{children}</MobilePageActionsCtx.Provider>;
};

/** Orden en el FAB: el primero queda arriba; el último, junto al pulgar. */
const SOURCE_ORDER = ['danger', 'secondary', 'document', 'primary'];

/** Acciones registradas por la pestaña indicada, en el orden en que se pintan. */
export function useMobilePageActionsFor(tabId: string | null | undefined): FloatingAction[] {
  const ctx = useContext(MobilePageActionsCtx);
  if (!ctx || !tabId) return [];
  const tab = ctx.registry[tabId] ?? {};
  const rank = (source: string) => {
    const i = SOURCE_ORDER.indexOf(source.split(':')[0]);
    return i === -1 ? 1 : i;
  };
  return Object.keys(tab)
    .sort((a, b) => rank(a) - rank(b))
    .flatMap((source) => tab[source]);
}

/** Si la pantalla de esa pestaña ha pedido ir sin botón flotante. */
export function useFloatingButtonHidden(tabId: string | null | undefined): boolean {
  const ctx = useContext(MobilePageActionsCtx);
  return !!tabId && !!ctx?.hiddenTabs.includes(tabId);
}

/**
 * Esta pantalla va sin botón flotante mientras esté montada. Antes de pintar, para que no
 * asome al entrar.
 */
export function useHideFloatingButton(): void {
  const setHidden = useContext(MobilePageActionsCtx)?.setHidden;
  const tabId = useCurrentTabId();
  useLayoutEffect(() => {
    if (!setHidden || !tabId) return;
    setHidden(tabId, true);
    return () => setHidden(tabId, false);
  }, [setHidden, tabId]);
}

/**
 * Registra acciones de la pantalla en el FAB de móvil mientras `enabled`.
 *
 * `source` agrupa y ordena: su prefijo antes de «:» (`danger`, `secondary`,
 * `document`, `primary`) decide la altura en el menú; lo demás solo lo hace
 * único. Los `onClick` pueden cambiar en cada render: se llama siempre al último.
 */
export function useMobilePageActions(
  source: string,
  actions: FloatingAction[],
  enabled = true,
): void {
  const ctx = useContext(MobilePageActionsCtx);
  const tabId = useCurrentTabId();
  const latest = useRef(actions);
  latest.current = actions;

  // Solo lo visible cuenta para volver a registrar; los callbacks se leen del ref.
  const signature = enabled
    ? actions.map((a) => `${a.id}|${a.label}|${a.disabled ? 1 : 0}`).join('¦')
    : '';
  const set = ctx?.set;

  useEffect(() => {
    if (!set || !tabId) return;
    if (!signature) {
      set(tabId, source, null);
      return;
    }
    set(
      tabId,
      source,
      latest.current.map((a) => ({
        ...a,
        onClick: () => latest.current.find((x) => x.id === a.id)?.onClick(),
      })),
    );
    return () => set(tabId, source, null);
  }, [set, tabId, source, signature]);
}
