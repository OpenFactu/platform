/**
 * Interfaz que debe implementar cualquier adapter de transportista.
 *
 * La implementación se registra en `CarrierRegistry.register(adapter)` por su
 * `id` (string único, p. ej. 'seur-b2b', 'dhl-express', 'correos-express-v3').
 * Cuando un `Carrier` tiene `adapterId = <id>`, el core puede invocar este
 * adapter con las credenciales de una `CarrierAccount` concreta para:
 *   - crear un envío contra la API del transportista
 *   - obtener el tracking actualizado
 *   - generar la etiqueta PDF
 *
 * Un carrier SIN adapter es "manual" — no hay llamadas externas y el usuario
 * gestiona tracking/etiqueta a mano.
 */

export type CarrierStatusKind =
  | 'pending'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception'
  | 'returned'
  | 'cancelled';

export interface CarrierAccountCredentials {
  /** Campos libres — la forma la decide cada adapter. */
  [key: string]: any;
}

export interface CreateShipmentInput {
  shipmentId: string;
  /** Dirección de destino completa. */
  destinationAddress?: string | null;
  destinationZip?: string | null;
  destinationCity?: string | null;
  destinationCountryCode?: string | null;
  /** Peso total en kg (opcional — algunos adapters lo necesitan). */
  weightKg?: number | null;
  /** Observaciones libres. */
  notes?: string | null;
}

export interface CreateShipmentResult {
  trackingNumber: string;
  /** PDF de la etiqueta si el adapter la genera en la misma llamada. */
  labelPdf?: Buffer;
  /** Datos extras devueltos por el carrier — opaco. */
  raw?: any;
}

export interface TrackingSnapshot {
  status: CarrierStatusKind;
  lastEventAt?: Date;
  description?: string;
  estimatedDelivery?: Date;
  /** Última posición GPS si el carrier la expone. */
  lastLat?: number;
  lastLng?: number;
}

export interface ICarrierAdapter {
  /** Identificador único dentro de `CarrierRegistry`. */
  id: string;
  /** Nombre legible para el UI de selección. */
  name: string;
  /** Campos esperados en `CarrierAccount.credentials` — guía el formulario UI. */
  credentialFields: Array<{
    key: string;
    label: string;
    type?: 'text' | 'password' | 'checkbox';
    required?: boolean;
    placeholder?: string;
  }>;

  createShipment(
    account: CarrierAccountCredentials,
    input: CreateShipmentInput,
  ): Promise<CreateShipmentResult>;

  fetchTracking(
    account: CarrierAccountCredentials,
    trackingNumber: string,
  ): Promise<TrackingSnapshot>;

  generateLabel(account: CarrierAccountCredentials, trackingNumber: string): Promise<Buffer>;
}
