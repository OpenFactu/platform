/**
 * Estados de un envío tal y como los enseñan las pantallas: un solo mapa de estado
 * a texto y tono, y qué acciones tienen sentido en cada uno. Las reglas de verdad
 * están en el servidor (`shipmentLifecycle.ts`); esto solo evita ofrecer lo que no
 * se va a poder hacer.
 */
import type { BadgeProps } from '@openfactu/ui';
import type { Shipment } from './shipment';

export type ShipmentAction =
  | 'dispatch'
  | 'ready'
  | 'deliver'
  | 'postpone'
  | 'incident'
  | 'resolve'
  | 'return'
  | 'pickup'
  | 'cancel'
  | 'receive';

const PICKUP_LABELS = [
  'pending',
  'dispatched',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'postponed',
];

/** Clave del texto de un estado. Una recogida invierte el sentido: entregado es recogido. */
export function stateLabelKey(state: string, isPickup = false): string {
  return isPickup && PICKUP_LABELS.includes(state)
    ? `logistics.shipmentDetail.pickupStatus.${state}`
    : `logistics.shipmentDetail.status.${state}`;
}

export function stateTone(state: string): BadgeProps['variant'] {
  switch (state) {
    case 'delivered':
    case 'received':
      return 'success';
    case 'exception':
    case 'returned':
      return 'error';
    case 'postponed':
    case 'out_for_delivery':
      return 'warning';
    case 'pending':
    case 'cancelled':
      return 'neutral';
    default:
      return 'info';
  }
}

export const SHIPMENT_FILTER_STATES = [
  'pending',
  'picking',
  'packed',
  'ready',
  'dispatched',
  'in_transit',
  'out_for_delivery',
  'postponed',
  'exception',
  'delivered',
  'receiving',
  'received',
  'returned',
  'cancelled',
];

/** Estado único, aunque la fila venga de antes de unificar las dos columnas. */
export function stateOfShipment(shipment: Shipment): string {
  return (shipment.state as string) || shipment.status;
}

export function shipmentCode(shipment: Pick<Shipment, 'id' | 'code' | 'trackingNumber'>): string {
  return (shipment.code as string) || shipment.trackingNumber || shipment.id.slice(0, 8);
}

export function actionsFor(state: string, direction: string): ShipmentAction[] {
  if (direction === 'in') {
    return state === 'receiving'
      ? ['receive', 'incident', 'cancel']
      : state === 'received'
        ? []
        : ['cancel'];
  }
  switch (state) {
    case 'pending':
      return ['ready', 'dispatch', 'incident', 'cancel'];
    case 'picking':
      return ['incident', 'cancel'];
    case 'packed':
      return ['ready', 'dispatch', 'incident', 'cancel'];
    case 'ready':
      return ['dispatch', 'incident', 'cancel'];
    case 'dispatched':
      return ['deliver', 'postpone', 'incident', 'return', 'cancel'];
    case 'in_transit':
    case 'out_for_delivery':
      return ['deliver', 'postpone', 'incident', 'return', 'cancel'];
    case 'postponed':
      return ['dispatch', 'incident', 'return', 'cancel'];
    case 'exception':
      return ['resolve', 'dispatch', 'pickup', 'return', 'cancel'];
    case 'delivered':
      return direction === 'pickup' ? [] : ['pickup', 'return'];
    default:
      return [];
  }
}

const OUT_STEPS = [
  { id: 'preparing', states: ['pending', 'picking', 'packed'] },
  { id: 'ready', states: ['ready', 'dispatched'] },
  { id: 'in_transit', states: ['in_transit'] },
  { id: 'out_for_delivery', states: ['out_for_delivery', 'postponed'] },
  { id: 'delivered', states: ['delivered'] },
];

const IN_STEPS = [
  { id: 'receiving', states: ['pending', 'receiving'] },
  { id: 'received', states: ['received'] },
];

/** Pasos del avance. Devuelve también en cuál va, o `null` si se ha salido del camino. */
export function progressOf(state: string, direction: string) {
  const steps = direction === 'in' ? IN_STEPS : OUT_STEPS;
  const index = steps.findIndex((step) => step.states.includes(state));
  const finished = state === 'delivered' || state === 'received';
  return { steps, current: index === -1 ? null : finished ? steps.length : index };
}
