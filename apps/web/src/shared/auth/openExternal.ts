/** Abre una dirección en el navegador del sistema (escritorio) o en una pestaña nueva (web). */
import { useEffect, useState } from 'react';
import { getClientKind } from './clientKind';

type TauriWindow = {
  __TAURI_INTERNALS__?: {
    invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
};

const tauriInvoke = () => (window as unknown as TauriWindow).__TAURI_INTERNALS__?.invoke;

export async function openExternal(url: string): Promise<void> {
  const invoke = tauriInvoke();
  if (invoke) {
    try {
      await invoke('abrir_en_navegador', { url });
      return;
    } catch {
      // Sin el comando (versión antigua del escritorio): se cae a la pestaña normal.
    }
  }
  window.open(url, '_blank', 'noopener');
}

let probe: Promise<boolean> | null = null;

/**
 * ¿Se puede abrir el navegador del sistema? En la web, siempre (no hace falta). En el escritorio,
 * solo si Tauri da `invoke` y la app tiene el comando: se pregunta con
 * `abrir_en_navegador_disponible`, que no abre nada. Sin él, `window.open` abriría el proveedor
 * dentro de WebView2, donde Google lo bloquea, así que el SSO y «Enlazar» no se ofrecen.
 *
 * Se prueba un comando propio y no `abrir_en_navegador` sin URL: así no depende del texto del
 * error de Tauri para distinguir «no existe» de «faltan argumentos».
 */
export function canOpenSystemBrowser(): Promise<boolean> {
  if (getClientKind() !== 'desktop') return Promise.resolve(true);
  if (!probe) {
    const invoke = tauriInvoke();
    probe = invoke
      ? invoke('abrir_en_navegador_disponible').then(
          () => true,
          () => false,
        )
      : Promise.resolve(false);
  }
  return probe;
}

/** `canOpenSystemBrowser` para pintar: en el escritorio, `false` hasta que la app conteste. */
export function useCanOpenSystemBrowser(): boolean {
  const [ok, setOk] = useState(() => getClientKind() !== 'desktop');
  useEffect(() => {
    let live = true;
    void canOpenSystemBrowser().then((v) => live && setOk(v));
    return () => {
      live = false;
    };
  }, []);
  return ok;
}
