/**
 * Ciclo de vida del envío: qué estados hay y de cuál se puede pasar a cuál.
 *
 * Es la única fuente de esas reglas. Aquí no hay base de datos: las acciones
 * (`shipmentActions.ts`, `routeActions.ts`) preguntan antes de tocar nada.
 *
 * Un envío tiene un solo estado, en `status`. `preparationStatus` se escribe
 * con el mismo valor hasta retirar la columna. Las filas de antes podían tener
 * valores distintos en cada una: `stateOf` las lee igual mientras no se hayan
 * migrado.
 */

export const SHIPMENT_STATES = [
  'pending',
  'picking',
  'packed',
  'ready',
  'dispatched',
  'in_transit',
  'out_for_delivery',
  'postponed',
  'delivered',
  'exception',
  'returned',
  'cancelled',
  'receiving',
  'received',
] as const;

export type ShipmentState = (typeof SHIPMENT_STATES)[number];

const TRANSITIONS: Record<ShipmentState, readonly ShipmentState[]> = {
  pending: ['picking', 'receiving', 'ready', 'dispatched', 'exception', 'cancelled'],
  picking: ['packed', 'exception', 'cancelled'],
  packed: ['ready', 'dispatched', 'exception', 'cancelled'],
  ready: ['dispatched', 'exception', 'cancelled'],
  dispatched: [
    'ready',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'postponed',
    'exception',
    'returned',
    'cancelled',
  ],
  in_transit: ['out_for_delivery', 'delivered', 'postponed', 'exception', 'returned', 'cancelled'],
  out_for_delivery: ['delivered', 'postponed', 'exception', 'returned', 'cancelled'],
  postponed: ['ready', 'dispatched', 'exception', 'returned', 'cancelled'],
  exception: [
    'ready',
    'dispatched',
    'in_transit',
    'out_for_delivery',
    'postponed',
    'delivered',
    'returned',
    'cancelled',
  ],
  delivered: ['returned'],
  receiving: ['received', 'exception', 'cancelled'],
  received: [],
  returned: [],
  cancelled: [],
};

/** Error de negocio con el código HTTP que le toca: la ruta solo lo traduce. */
export class LogisticsError extends Error {
  constructor(
    message: string,
    public readonly status: number = 409,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'LogisticsError';
  }
}

export function canTransition(from: ShipmentState, to: ShipmentState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: ShipmentState, to: ShipmentState): void {
  if (!canTransition(from, to)) {
    throw new LogisticsError(`Un envío en estado "${from}" no puede pasar a "${to}".`, 409, {
      from,
      to,
    });
  }
}

const CLOSED: readonly string[] = ['delivered', 'received', 'returned', 'cancelled'];

/** Ya no va a pasar nada más con este envío (salvo devolver uno entregado). */
export function isClosedState(state: string): boolean {
  return CLOSED.includes(state);
}

/** Sin parada viva, estos se pueden planificar en una ruta. */
export const ROUTABLE_STATES: readonly ShipmentState[] = [
  'pending',
  'packed',
  'ready',
  'dispatched',
  'postponed',
  'exception',
];

const LIVE_STOP: readonly string[] = ['pending', 'en_route', 'arrived'];
export const LIVE_STOP_STATES = LIVE_STOP;

/** La parada sigue por hacer. Las demás son historia del reparto. */
export function isLiveStop(status: string | null | undefined): boolean {
  return LIVE_STOP.includes(status || 'pending');
}

/**
 * Orden de avance, para leer las filas antiguas con dos columnas. La recepción
 * de compras va aparte de la entrega a clientes para no mezclar los dos flujos.
 */
const RANK: Record<string, number> = {
  pending: 1,
  picking: 2,
  packed: 3,
  ready: 4,
  dispatched: 5,
  in_transit: 6,
  out_for_delivery: 7,
  postponed: 7,
  receiving: 8,
  received: 9,
  delivered: 10,
  exception: 11,
  returned: 11,
  cancelled: 11,
};

const isKnown = (s: string | null | undefined): s is ShipmentState =>
  !!s && (SHIPMENT_STATES as readonly string[]).includes(s);

/**
 * Estado único a partir de las dos columnas antiguas: gana el más avanzado.
 * Una compra recibida tenía `status='delivered'` o `'pending'` junto a
 * `preparationStatus='received'`, y lo que cuenta es esa recepción.
 */
export function canonicalState(
  preparationStatus: string | null | undefined,
  status: string | null | undefined,
): ShipmentState {
  if (preparationStatus === 'received' || status === 'received') return 'received';
  if (preparationStatus === 'receiving') return status === 'delivered' ? 'received' : 'receiving';
  const a = isKnown(preparationStatus) ? preparationStatus : null;
  const b = isKnown(status) ? status : null;
  if (!a) return b ?? 'pending';
  if (!b) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

export function stateOf(shipment: {
  preparationStatus?: string | null;
  status?: string | null;
}): ShipmentState {
  return canonicalState(shipment.preparationStatus, shipment.status);
}

/** Estado de un paquete cuando su envío llega a `state`. */
export function packageStatusAfter(state: ShipmentState, current: string): string {
  switch (state) {
    case 'in_transit':
    case 'out_for_delivery':
      return 'shipped';
    case 'delivered':
      return 'delivered';
    case 'returned':
      return 'returned';
    case 'postponed':
      return current === 'shipped' ? 'sealed' : current;
    case 'cancelled':
      return current === 'shipped' ? 'returned' : current;
    default:
      return current;
  }
}

/** A dónde vuelve un envío al resolver su incidencia, según su parada viva. */
export function resumeStateAfterIncident(
  stopStatus: string | null,
  routeStatus: string | null,
): ShipmentState {
  if (!stopStatus) return 'ready';
  if (routeStatus !== 'active') return 'dispatched';
  return stopStatus === 'pending' ? 'in_transit' : 'out_for_delivery';
}
