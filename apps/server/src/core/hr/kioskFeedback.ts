const messages: Record<string, string> = {
  CREDENTIAL_NOT_RECOGNIZED: 'Tarjeta no reconocida. Consulta al responsable.',
  EMPLOYEE_INACTIVE: 'El empleado no está activo. Consulta al responsable.',
  KIOSK_BUSY: 'La pantalla está ocupada. Espera a que termine la otra persona.',
  TEMPORARILY_UNAVAILABLE: 'No se ha podido leer la tarjeta. Vuelve a intentarlo.',
  RATE_LIMITED: 'Demasiadas lecturas. Espera unos segundos.',
};
type Event = { id: string; code: string; message: string; at: number };
// Ephemeral UX notifications only: no UID, employee data, credentials or punches.
const events = new Map<string, Event>();
const key = (tenant: string, kiosk: string) => JSON.stringify([tenant, kiosk]);
export function publishKioskFeedback(
  tenant: string,
  kiosk: string,
  event: { id: string; code: string },
  now = Date.now(),
) {
  if (!messages[event.code]) return;
  for (const [id, old] of events) if (now - old.at >= 10000) events.delete(id);
  const id = key(tenant, kiosk);
  if (events.get(id)?.id === event.id) return;
  if (events.size >= 2000 && !events.has(id)) events.delete(events.keys().next().value!);
  events.set(id, { ...event, message: messages[event.code], at: now });
}
export function getKioskFeedback(tenant: string, kiosk: string, now = Date.now()) {
  const id = key(tenant, kiosk);
  const event = events.get(id);
  if (!event || now - event.at >= 10000) {
    events.delete(id);
    return null;
  }
  return event;
}
