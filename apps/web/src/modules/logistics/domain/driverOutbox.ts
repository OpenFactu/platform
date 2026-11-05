/**
 * Lo que el conductor ha marcado sin cobertura. Se guarda en el móvil y se envía
 * cuando vuelva la señal; el servidor no lo aplica dos veces aunque se repita.
 */
import type { DeliveryProofInput } from '../api';

export type QueuedStopAction =
  | { kind: 'arrive'; routeId: string; stopId: string }
  | { kind: 'deliver'; routeId: string; stopId: string; proof: DeliveryProofInput }
  | { kind: 'postpone'; routeId: string; stopId: string; reason: string | null }
  | { kind: 'incident'; routeId: string; stopId: string; reason: string };

const KEY = 'keirost.driver.outbox';

export function readOutbox(): QueuedStopAction[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOutbox(actions: QueuedStopAction[]): boolean {
  try {
    if (actions.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(actions));
    return true;
  } catch {
    // Una foto de entrega puede no caber: quien llama avisa de que no se ha guardado.
    return false;
  }
}

export function enqueue(action: QueuedStopAction): boolean {
  return writeOutbox([...readOutbox(), action]);
}

/**
 * Envía lo pendiente en orden. Para en el primer fallo de red, y descarta lo que el
 * servidor rechaza de verdad: repetirlo no lo va a arreglar.
 */
export async function flushOutbox(
  send: (action: QueuedStopAction) => Promise<unknown>,
  isNetworkError: (err: unknown) => boolean,
): Promise<{ sent: number; rejected: number; left: number }> {
  const queue = readOutbox();
  let sent = 0;
  let rejected = 0;
  while (queue.length > 0) {
    try {
      await send(queue[0]);
      sent++;
    } catch (err) {
      if (isNetworkError(err)) break;
      rejected++;
    }
    queue.shift();
    writeOutbox(queue);
  }
  return { sent, rejected, left: queue.length };
}
