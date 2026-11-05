/** Textos y pasos del seguimiento público según el estado del envío. */
import { CheckCircle2, Package, Truck, AlertTriangle, type LucideIcon } from 'lucide-react';

export type TrackingTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

export interface StatusCopy {
  label: string;
  tone: TrackingTone;
  Icon: LucideIcon;
  hero: string;
  sub: string;
}

export interface TrackingStep {
  key: string[];
  label: string;
}

const PREFIX = 'app.tracking.copy.';

/** Pasos lineales del viaje. */
export const DELIVERY_STEPS: TrackingStep[] = [
  { key: ['pending', 'draft', 'picking', 'packed'], label: `${PREFIX}t0` },
  { key: ['ready', 'dispatched'], label: `${PREFIX}t1` },
  { key: ['in_transit'], label: `${PREFIX}t2` },
  // `postponed` encaja aquí: está en ruta, pero aplazado por un intento fallido.
  { key: ['out_for_delivery', 'postponed'], label: `${PREFIX}t3` },
  { key: ['delivered'], label: `${PREFIX}t4` },
];

/** Los mismos pasos con el vocabulario de una recogida: vamos a por el paquete. */
export const PICKUP_STEPS: TrackingStep[] = [
  { key: ['pending', 'draft', 'picking', 'packed'], label: `${PREFIX}t5` },
  { key: ['ready', 'dispatched'], label: `${PREFIX}t6` },
  { key: ['in_transit'], label: `${PREFIX}t2` },
  { key: ['out_for_delivery', 'postponed'], label: `${PREFIX}t7` },
  { key: ['delivered'], label: `${PREFIX}t8` },
];

const copy = (
  label: number,
  tone: TrackingTone,
  Icon: LucideIcon,
  hero: number,
  sub: number | null,
): StatusCopy => ({
  label: `${PREFIX}t${label}`,
  tone,
  Icon,
  hero: `${PREFIX}t${hero}`,
  sub: sub === null ? '' : `${PREFIX}t${sub}`,
});

export const STATUS_COPY: Record<string, StatusCopy> = {
  pending: copy(9, 'neutral', Package, 10, 11),
  picking: copy(0, 'warning', Package, 12, 13),
  packed: copy(14, 'warning', Package, 15, 16),
  ready: copy(17, 'info', Package, 18, 19),
  dispatched: copy(20, 'info', Truck, 21, 22),
  in_transit: copy(2, 'info', Truck, 23, 24),
  out_for_delivery: copy(25, 'info', Truck, 26, 27),
  postponed: copy(28, 'warning', AlertTriangle, 29, 30),
  delivered: copy(4, 'success', CheckCircle2, 31, 32),
  exception: copy(33, 'danger', AlertTriangle, 34, 35),
  returned: copy(36, 'danger', AlertTriangle, 37, 38),
  cancelled: copy(39, 'neutral', AlertTriangle, 40, null),
};

/** En una recogida el sentido se invierte: el repartidor va a recoger. */
export const PICKUP_STATUS_COPY: Record<string, StatusCopy> = {
  pending: copy(41, 'info', Package, 42, 43),
  dispatched: copy(6, 'info', Truck, 44, 45),
  in_transit: copy(2, 'info', Truck, 46, 24),
  out_for_delivery: copy(7, 'info', Truck, 47, 48),
  postponed: copy(49, 'warning', AlertTriangle, 50, 51),
  delivered: copy(8, 'success', CheckCircle2, 52, 53),
  cancelled: copy(54, 'neutral', AlertTriangle, 54, null),
};

export function copyFor(status: string, isPickup: boolean): StatusCopy {
  return (isPickup && PICKUP_STATUS_COPY[status]) || STATUS_COPY[status] || STATUS_COPY.pending;
}

export function stepIndexOf(steps: TrackingStep[], status: string): number {
  const index = steps.findIndex((step) => step.key.includes(status));
  return index === -1 ? 0 : index;
}

/** Los estados que se salen del camino normal no enseñan los pasos. */
export const OFF_PATH = ['exception', 'returned', 'cancelled'];
