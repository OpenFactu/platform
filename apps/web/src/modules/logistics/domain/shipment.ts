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
  reportToken: string;
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

export interface ShipmentListParams {
  q?: string;
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
