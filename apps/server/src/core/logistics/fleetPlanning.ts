/**
 * Cálculos de flota y horario, sin base de datos: peso frente a capacidad, hora
 * estimada de cada parada y ventanas horarias.
 */

export interface Point {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function distanceKm(a: Point, b: Point): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export interface EstimateOptions {
  /** Velocidad media de reparto: no es una ruta real, solo una orientación. */
  speedKmh: number;
  /** Lo que se tarda en atender una parada. */
  serviceMinutes: number;
}

export const DEFAULT_ESTIMATE: EstimateOptions = { speedKmh: 40, serviceMinutes: 10 };

/**
 * Hora estimada de cada parada, en línea recta desde la anterior. Una parada sin
 * coordenadas se queda sin hora y no corta el cálculo de las demás.
 */
export function estimateStopTimes(
  start: Date,
  points: Array<Point | null>,
  options: EstimateOptions = DEFAULT_ESTIMATE,
): Array<Date | null> {
  let clock = start.getTime();
  let previous: Point | null = null;
  return points.map((point) => {
    if (!point) return null;
    if (previous) {
      const travelMinutes = (distanceKm(previous, point) / options.speedKmh) * 60;
      clock += (travelMinutes + options.serviceMinutes) * 60_000;
    }
    previous = point;
    return new Date(clock);
  });
}

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(value: unknown): boolean {
  return typeof value === 'string' && HH_MM.test(value);
}

const minutesOfDay = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** ¿Cae esta hora fuera de la ventana del cliente? Sin ventana, nunca. */
export function outsideWindow(
  at: Date | null | undefined,
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  if (!at || (!from && !to)) return false;
  const minutes = at.getHours() * 60 + at.getMinutes();
  if (from && minutes < minutesOfDay(from)) return true;
  if (to && minutes > minutesOfDay(to)) return true;
  return false;
}

export type FleetWarning =
  | { kind: 'over_capacity'; loadKg: number; capacityKg: number }
  | { kind: 'driver_busy'; routes: string[] };

/** Lo que conviene avisar de una ruta sin impedirlo: quien planifica decide. */
export function fleetWarnings(input: {
  loadKg: number;
  capacityKg: number | null | undefined;
  otherRoutes: string[];
}): FleetWarning[] {
  const warnings: FleetWarning[] = [];
  if (input.capacityKg != null && input.loadKg > Number(input.capacityKg)) {
    warnings.push({
      kind: 'over_capacity',
      loadKg: input.loadKg,
      capacityKg: Number(input.capacityKg),
    });
  }
  if (input.otherRoutes.length > 0) {
    warnings.push({ kind: 'driver_busy', routes: input.otherRoutes });
  }
  return warnings;
}
