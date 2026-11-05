import { useEffect, useRef } from 'react';
import { useScanner, type ScanHandler } from '../context/ScannerContext';
import { useCurrentTabId } from '../context/TabsContext';

interface Options {
  enabled?: boolean;
}

/**
 * Registra un handler de escaneo mientras el componente está montado.
 * Recibe cualquier código leído vía escáner HID **o** cámara.
 *
 * Uso:
 * ```
 * useBarcodeScanner((code) => setSearch(code));
 * ```
 */
export function useBarcodeScanner(handler: ScanHandler, options: Options = {}) {
  const { subscribe } = useScanner();
  const { enabled = true } = options;
  const tabId = useCurrentTabId();

  // Se suscribe una vez y llama siempre al último. `handler` suele cambiar en cada render, y
  // darse de baja y de alta cada vez repinta a quien usa el contexto: un bucle sin fin.
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    if (!enabled) return;
    return subscribe((code) => latest.current(code), tabId);
  }, [subscribe, enabled, tabId]);
}
