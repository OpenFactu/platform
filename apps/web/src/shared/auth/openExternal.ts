/** Abre una dirección en el navegador del sistema (escritorio) o en una pestaña nueva (web). */

type TauriWindow = {
  __TAURI_INTERNALS__?: {
    invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
};

export async function openExternal(url: string): Promise<void> {
  const invoke = (window as unknown as TauriWindow).__TAURI_INTERNALS__?.invoke;
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
