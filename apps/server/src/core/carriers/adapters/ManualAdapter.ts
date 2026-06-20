/**
 * Adapter "manual" — no llama a ningún API externa.
 *
 * Funciona como placeholder: genera tracking numbers aleatorios y devuelve
 * respuestas simuladas. Sirve como base para carriers sin integración
 * (transporte propio, rutas internas) y como ejemplo de implementación.
 */

import crypto from 'crypto';
import type {
  ICarrierAdapter,
  CreateShipmentInput,
  CreateShipmentResult,
  TrackingSnapshot,
} from '../ICarrierAdapter';

export const ManualAdapter: ICarrierAdapter = {
  id: 'manual',
  name: 'Manual (sin integración)',
  credentialFields: [],

  async createShipment(_account, _input: CreateShipmentInput): Promise<CreateShipmentResult> {
    const trackingNumber = `MAN-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    return { trackingNumber };
  },

  async fetchTracking(_account, _trackingNumber): Promise<TrackingSnapshot> {
    // Adapter manual: sin API, devolvemos snapshot neutro.
    return { status: 'pending', description: 'Gestión manual — sin datos externos' };
  },

  async generateLabel(_account, trackingNumber): Promise<Buffer> {
    // PDF placeholder — en la vida real se generaría el PDF propio.
    const placeholder = `Etiqueta manual ${trackingNumber}\n\n(Pendiente de implementar PDF)`;
    return Buffer.from(placeholder, 'utf-8');
  },
};
