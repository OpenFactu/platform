import type { Shipment } from './shipment';

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
  sequence: number;
  shipmentId: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
  arrivedAt: string | null;
  departedAt: string | null;
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
export interface RouteDetail {
  route: Route;
  stops: RouteStop[];
  shipments: Shipment[];
  vehicle?: RouteVehicleInfo | null;
  pickups?: RoutePickup[];
}

export interface UnroutedShipment {
  id: string;
  trackingNumber: string | null;
  status: string;
  destinationAddress: string | null;
  destinationLat: number | null;
  destinationLng: number | null;
}
