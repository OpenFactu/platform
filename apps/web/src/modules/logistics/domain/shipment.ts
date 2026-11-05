export interface Shipment {
  id: string;
  carrier?: string | null;
  trackingNumber?: string | null;
  status: string;
  preparationStatus?: string | null;
  driverName?: string | null;
  driverEmployeeId?: string | null;
  driverPhone?: string | null;
  vehiclePlate?: string | null;
  destinationAddress?: string | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  lastLat?: number | null;
  lastLng?: number | null;
  lastLocationAt?: string | null;
  estimatedDelivery?: string | null;
  /** Del enlace que recibe el cliente: solo sirve para mirar. */
  reportToken: string;
  /** Del dispositivo que envía la posición. */
  trackerToken: string;
  archivedAt?: string | null;
  /** Número del envío (ENV-2026-00042). */
  code?: string | null;
  timeWindowFrom?: string | null;
  timeWindowTo?: string | null;
  /** Estado único y lo que añade el listado del servidor. */
  state?: string;
  direction?: 'out' | 'in' | 'pickup';
  documentNumber?: string | null;
  counterparty?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  routeId?: string | null;
  routeCode?: string | null;
  routeDriver?: string | null;
  routeVehicle?: string | null;
  createdAt?: string;
  updatedAt?: string;
  recipientName?: string | null;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
  /** 'delivery' (default) o 'pickup_return'. */
  kind?: string | null;
  sourceDocType?: string | null;
  sourceDocId?: string | null;
  deliveryNoteId?: string | null;
  receivedAt?: string | null;
  notes?: string | null;
  returnWarehouseId?: string | null;
  [key: string]: unknown;
}

export interface ShipmentEvent {
  id: string;
  kind: string;
  status: string | null;
  description: string | null;
  createdAt: string;
}

export interface ShipmentPosition {
  id: string;
  shipmentId: string;
  lat: number;
  lng: number;
  reportedAt: string;
}

/** Incidencia reportada por un cliente desde el chat público de tracking. */
export interface ClientIncident {
  eventId: string;
  description: string | null;
  createdAt: string;
  shipmentId: string;
  shipmentStatus: string | null;
  preparationStatus: string | null;
  destinationAddress: string | null;
  recipientName: string | null;
}

export interface ShipmentDetailPackage {
  id: string;
  code: string;
  status: string;
  weightKg: number | null;
  lines: Array<{ quantity: number; itemCode: string | null; itemName: string | null }>;
}

export interface ShipmentDetailStop {
  handover?: string | null;
  id: string;
  status: string;
  sequence: number;
  arrivedAt: string | null;
  departedAt: string | null;
  recipientName: string | null;
  recipientDocument: string | null;
  signatureImage: string | null;
  photoImage: string | null;
  podNotes: string | null;
  routeId: string;
  routeCode: string;
  routeName: string;
  plannedDate: string;
  driverName: string | null;
  vehiclePlate: string | null;
}

export interface ShipmentDetailData {
  shipment: Shipment;
  events: ShipmentEvent[];
  packages: ShipmentDetailPackage[];
  stops: ShipmentDetailStop[];
}

export interface TodaySummary {
  counts: {
    toPrepare: number;
    readyForRoute: number;
    onRoute: number;
    incidents: number;
    late: number;
    staleRoutes: number;
    deliveredToday: number;
  };
  late: Shipment[];
  incidents: Shipment[];
  readyForRoute: Shipment[];
  staleRoutes: Array<{
    id: string;
    code: string;
    name: string;
    plannedDate: string;
    status: string;
    driverName: string | null;
  }>;
}

export interface ShipmentListParams {
  q?: string;
  direction?: string;
  includeArchived?: string;
  status?: string;
  preparationStatus?: string;
  routeId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}

export interface ShipmentListResult {
  rows: Shipment[];
  total: number;
}

export interface GeocodeSuggestion {
  label: string;
  lat: number;
  lng: number;
  type?: string | null;
  housenumber?: string | null;
  street?: string | null;
  city?: string | null;
  postcode?: string | null;
}
