const DEVICE_KEY = 'keirost_device';

let memoryId: string | null = null;

/** Identificador estable de este navegador; el servidor lo usa para reconocer el dispositivo. */
export function getDeviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    // Sin almacenamiento (modo privado estricto): uno por carga de página.
    if (!memoryId) {
      try {
        memoryId = crypto.randomUUID();
      } catch {
        memoryId = `m-${Date.now().toString(36)}`;
      }
    }
    return memoryId;
  }
}
