import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export type ScanHandler = (code: string) => void;

interface ScannerContextType {
  /** Registra un handler que recibe los códigos escaneados. Devuelve unsubscribe. */
  subscribe: (handler: ScanHandler, tabId?: string | null) => () => void;
  /** Dispara manualmente un código (usado por el modal de cámara). */
  dispatch: (code: string) => void;
  /** Abre el modal de cámara (si está montado). */
  openCamera: () => void;
  /** Hook interno para que `CameraModal` se registre como único consumidor de `openCamera`. */
  registerCameraOpener: (fn: (() => void) | null) => void;
  hasActiveHandler: boolean;
  /** Pestañas con algo que reciba lo escaneado: en las demás no se ofrece escanear. */
  handlerTabs: string[];
}

const ScannerContext = createContext<ScannerContextType | undefined>(undefined);

/**
 * Contexto global de escaneo de códigos de barras.
 *
 * Mantiene una pila LIFO de handlers — el último montado (p.ej. el input de
 * búsqueda de la página activa) gana. Así cualquier pantalla puede
 * suscribirse con `useBarcodeScanner` sin colisionar con otras.
 *
 * También expone `openCamera()` para que el botón flotante de móvil dispare
 * el modal de cámara aunque el handler viva en otra pantalla.
 */
export const ScannerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const handlersRef = useRef<ScanHandler[]>([]);
  const tabsRef = useRef<Array<string | null>>([]);
  const cameraOpenerRef = useRef<(() => void) | null>(null);
  const [hasActiveHandler, setHasActiveHandler] = useState(false);
  const [handlerTabs, setHandlerTabs] = useState<string[]>([]);

  const subscribe = useCallback((handler: ScanHandler, tabId: string | null = null) => {
    const publishTabs = () => {
      const next = [...new Set(tabsRef.current.filter((t): t is string => !!t))].sort();
      // Una pantalla se vuelve a suscribir en cada cambio: sin esto, repintaría todo.
      setHandlerTabs((prev) => (prev.join() === next.join() ? prev : next));
    };
    handlersRef.current.push(handler);
    tabsRef.current.push(tabId);
    setHasActiveHandler(handlersRef.current.length > 0);
    publishTabs();
    return () => {
      const at = handlersRef.current.indexOf(handler);
      if (at >= 0) {
        handlersRef.current.splice(at, 1);
        tabsRef.current.splice(at, 1);
      }
      setHasActiveHandler(handlersRef.current.length > 0);
      publishTabs();
    };
  }, []);

  const dispatch = useCallback((code: string) => {
    const top = handlersRef.current[handlersRef.current.length - 1];
    if (top) top(code);
  }, []);

  const registerCameraOpener = useCallback((fn: (() => void) | null) => {
    cameraOpenerRef.current = fn;
  }, []);

  const openCamera = useCallback(() => {
    cameraOpenerRef.current?.();
  }, []);

  // Listener HID global: detecta ráfagas de keydown con intervalo < 30 ms
  // terminadas en Enter — comportamiento típico de escáneres USB/Bluetooth.
  useEffect(() => {
    let buffer = '';
    let lastAt = 0;
    const THRESHOLD_MS = 30;

    // Un humano nunca teclea a > 30 teclas/seg; un lector HID típico emite
    // a 100-500 teclas/seg. Así que aunque el foco esté en un input, si la
    // ráfaga es suficientemente rápida asumimos que es un escáner y la
    // interceptamos (sin cancelar las teclas, el input también las recibe;
    // lo reseteamos al final con Enter).
    let fastBurst = false;
    const FAST_COUNT = 4; // cuántas teclas rápidas consecutivas hacen falta
    let fastHits = 0;

    const onKey = (e: KeyboardEvent) => {
      const now = performance.now();
      const dt = now - lastAt;
      lastAt = now;

      if (e.key === 'Enter') {
        if (fastBurst && buffer.length >= 4) {
          const code = buffer;
          buffer = '';
          fastBurst = false;
          fastHits = 0;
          dispatch(code);
          // Si venía de un input, cancelamos el Enter para que no dispare
          // submit del form.
          e.preventDefault();
          e.stopPropagation();
        } else {
          buffer = '';
          fastHits = 0;
          fastBurst = false;
        }
        return;
      }

      if (e.key.length !== 1) return;

      if (dt > THRESHOLD_MS) {
        // Intervalo lento → no es escáner, resetea racha
        buffer = e.key;
        fastHits = 1;
        fastBurst = false;
        return;
      }

      // Intervalo rápido → acumula
      fastHits += 1;
      buffer += e.key;
      if (fastHits >= FAST_COUNT) fastBurst = true;
    };

    window.addEventListener('keydown', onKey);

    // Bridge: permite que cualquier componente (p.ej. DebugPanel fuera de
    // este Provider) inyecte un código escaneado sin acoplarse al contexto.
    const onCustom = (e: Event) => {
      const code = (e as CustomEvent<string>).detail;
      if (typeof code === 'string' && code.length) dispatch(code);
    };
    window.addEventListener('keirost:scan', onCustom);

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keirost:scan', onCustom);
    };
  }, [dispatch]);

  return (
    <ScannerContext.Provider
      value={{
        subscribe,
        dispatch,
        openCamera,
        registerCameraOpener,
        hasActiveHandler,
        handlerTabs,
      }}
    >
      {children}
    </ScannerContext.Provider>
  );
};

export const useScanner = (): ScannerContextType => {
  const ctx = useContext(ScannerContext);
  if (!ctx) throw new Error('useScanner must be used within ScannerProvider');
  return ctx;
};
