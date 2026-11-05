import type { DeliveryFlow } from './deliveryFlow';
import type { Shipment } from './shipment';

/** Lo que no impide planificar, pero quien lo hace tiene que saber. */
export type RouteWarning =
  | { kind: 'over_capacity'; loadKg: number; capacityKg: number }
  | { kind: 'driver_busy'; routes: string[] };

export interface Route {
  id: string;
  code: string;
  name: string;
  plannedDate: string;
  status: string;
  driverName?: string | null;
  driverEmployeeId?: string | null;
  vehiclePlate?: string | null;
  vehicleId?: string | null;
  archivedAt?: string | null;
  stopsTotal?: number;
  stopsOpen?: number;
  stopsDelivered?: number;
  loadKg?: number;
  capacityKg?: number | null;
  [key: string]: unknown;
}

/** Selector de vehículo en el formulario de ruta (RoutesTab). */
export interface RouteVehicleOption {
  id: string;
  plate: string;
  brand: string | null;
  model: string | null;
  defaultDriverEmployeeId: string | null;
}

export interface RouteStop {
  id: string;
  handover?: string | null;
  sequence: number;
  shipmentId: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
  arrivedAt: string | null;
  departedAt: string | null;
  plannedAt?: string | null;
  podNotes?: string | null;
}

/** Vehículo tal y como lo devuelve el detalle de ruta del conductor (`/my/routes/:id`). */
export interface RouteVehicleInfo {
  id: string;
  plate: string;
  brand: string | null;
  model: string | null;
  capacity: number | null;
  notes: string | null;
}

export interface RoutePickup {
  id: string;
  code: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  packageCount: number;
  platform: {
    id: string;
    code: string;
    name: string;
    address: string | null;
  } | null;
}

/** Detalle de ruta para la app del conductor. */
/** Un bulto de la ruta, lo que el conductor comprueba al entregar. */
export interface RoutePackage {
  id: string;
  code: string;
  shipmentId: string;
  weightKg: string | number | null;
  status: string;
  stagingAreaId?: string | null;
  loadedAt?: string | null;
}

export interface RouteDetail {
  route: Route;
  stops: RouteStop[];
  shipments: Shipment[];
  vehicle?: RouteVehicleInfo | null;
  pickups?: RoutePickup[];
  packages?: RoutePackage[];
  flow?: DeliveryFlow;
}

export interface UnroutedShipment {
  id: string;
  code?: string | null;
  trackingNumber: string | null;
  status: string;
  destinationAddress: string | null;
  destinationLat: number | null;
  destinationLng: number | null;
}
