const CLIENT_KEY = 'keirost_client';

/** `desktop` dentro de la app de escritorio (Tauri) o con `?client=desktop`, que se recuerda en la pestaña. */
export function getClientKind(): 'web' | 'desktop' {
  try {
    if ('__TAURI_INTERNALS__' in window) return 'desktop';
    if (new URLSearchParams(window.location.search).get('client') === 'desktop') {
      sessionStorage.setItem(CLIENT_KEY, 'desktop');
    }
    return sessionStorage.getItem(CLIENT_KEY) === 'desktop' ? 'desktop' : 'web';
  } catch {
    return 'web';
  }
}

/** Valor de la cabecera `x-keirost-client`. La versión del escritorio no se conoce desde la web. */
export function clientHeaderValue(): string {
  return getClientKind() === 'desktop' ? 'desktop/web' : 'web';
}
