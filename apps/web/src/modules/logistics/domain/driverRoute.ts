/** Datos de una parada para la app del conductor: direcciones, enlaces y fechas. */
import type { NavigationApp } from './deliveryFlow';
import type { RoutePackage, RouteStop } from './route';
import type { Shipment } from './shipment';

export type Coords = [number, number];

const OPEN_STOP_STATES = ['pending', 'en_route', 'arrived'];

export function isOpenStop(stop: Pick<RouteStop, 'status'>): boolean {
  return OPEN_STOP_STATES.includes(stop.status);
}

/** Adónde toca ir: donde ya ha llegado, luego la que va de camino y luego por orden de ruta. */
export function nextOpenStop(stops: RouteStop[]): RouteStop | null {
  const open = stops.filter(isOpenStop).sort((a, b) => a.sequence - b.sequence);
  return (
    open.find((stop) => stop.status === 'arrived') ??
    open.find((stop) => stop.status === 'en_route') ??
    open[0] ??
    null
  );
}

/** Lo que sigue en la furgoneta: paradas sin entregar con bultos que no están en un acopio. */
export function leftoverStops(stops: RouteStop[], packages: RoutePackage[]): RouteStop[] {
  return stops.filter(
    (stop) =>
      stop.shipmentId &&
      stop.status !== 'delivered' &&
      stop.status !== 'cancelled' &&
      packages.some(
        (pkg) =>
          pkg.shipmentId === stop.shipmentId && pkg.status !== 'delivered' && !pkg.stagingAreaId,
      ),
  );
}

export function routeTally(stops: RouteStop[]) {
  const open = stops.filter(isOpenStop).length;
  return {
    total: stops.length,
    delivered: stops.filter((stop) => stop.status === 'delivered').length,
    closed: stops.length - open,
    open,
  };
}

/** [lat, lng] de la parada o, si no tiene, de su envío. */
export function stopCoords(stop: RouteStop, shipment: Shipment | undefined): Coords | null {
  if (stop.lat != null && stop.lng != null) return [stop.lat, stop.lng];
  if (shipment?.destinationLat != null && shipment?.destinationLng != null) {
    return [shipment.destinationLat, shipment.destinationLng];
  }
  return null;
}

export function stopAddress(stop: RouteStop, shipment: Shipment | undefined): string {
  return stop.address || shipment?.destinationAddress || '';
}

const DIRECTIONS = 'https://www.google.com/maps/dir/?api=1';

interface Place {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
}

/**
 * Enlace para navegar, con la app que use la empresa. Va primero la dirección escrita:
 * el buscador acierta más que nuestras coordenadas, que a veces apuntan a otro sitio.
 */
export function navigationUrl(app: NavigationApp, { address, lat, lng }: Place): string | null {
  const coords = lat != null && lng != null ? `${lat},${lng}` : null;
  const target = address ? encodeURIComponent(address) : coords;
  if (!target) return null;
  if (app === 'waze') return `https://waze.com/ul?${address ? 'q' : 'll'}=${target}&navigate=yes`;
  if (app === 'apple') return `https://maps.apple.com/?daddr=${target}&dirflg=d`;
  return `${DIRECTIONS}&destination=${target}&travelmode=driving`;
}

export function stopMapsUrl(
  stop: RouteStop,
  shipment: Shipment | undefined,
  app: NavigationApp = 'google',
): string | null {
  const coords = stopCoords(stop, shipment);
  return navigationUrl(app, {
    address: stopAddress(stop, shipment),
    lat: coords?.[0],
    lng: coords?.[1],
  });
}

/** Un acopio o un punto de carga: aquí las coordenadas son las buenas. */
export function placeMapsUrl(place: Place, app: NavigationApp = 'google'): string | null {
  return navigationUrl(
    app,
    place.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng } : place,
  );
}

/**
 * Toda la ruta de una vez: la última parada es el destino y las demás, puntos de paso.
 * Waze y Apple Maps no admiten varias paradas por enlace, así que van a la siguiente.
 */
export function fullRouteUrl(
  stops: RouteStop[],
  shipments: Map<string, Shipment>,
  app: NavigationApp = 'google',
): string | null {
  const remaining = stops.filter(isOpenStop).sort((a, b) => a.sequence - b.sequence);
  if (app !== 'google') {
    const first = remaining[0];
    return first
      ? stopMapsUrl(first, first.shipmentId ? shipments.get(first.shipmentId) : undefined, app)
      : null;
  }
  const open = remaining
    .map((stop) => {
      const shipment = stop.shipmentId ? shipments.get(stop.shipmentId) : undefined;
      const address = stopAddress(stop, shipment);
      if (address) return encodeURIComponent(address);
      const coords = stopCoords(stop, shipment);
      return coords ? `${coords[0]},${coords[1]}` : null;
    })
    .filter((value): value is string => !!value);
  if (open.length === 0) return null;
  const waypoints = open.slice(0, -1);
  return (
    `${DIRECTIONS}&destination=${open[open.length - 1]}&travelmode=driving` +
    (waypoints.length ? `&waypoints=${waypoints.join('|')}` : '')
  );
}

/**
 * Enlace de WhatsApp. El teléfono tiene que ir con prefijo internacional: sin él,
 * se abre el número tal cual y WhatsApp pregunta.
 */
export function whatsAppUrl(phone: string, message: string): string {
  const digits = phone.replace(/[^\d+]/g, '').replace(/^\+/, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Fecha local yyyy-mm-dd (sin depender de toISOString, que va en UTC). */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
