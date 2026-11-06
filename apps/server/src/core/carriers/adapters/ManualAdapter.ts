/**
 * Transportista sin integración: no hay API a la que llamar. El número lo escribe
 * quien despacha y no hay etiqueta. Nunca se inventa ninguno de los dos.
 */
import type { ICarrierAdapter } from '../ICarrierAdapter';

export const ManualAdapter: ICarrierAdapter = {
  id: 'manual',
  name: 'Manual (sin integración)',
  manual: true,
  credentialFields: [],

  async createShipment() {
    throw new Error('Un transportista manual no crea envíos: el número lo escribe el usuario.');
  },

  async fetchTracking() {
    throw new Error('Un transportista manual no tiene seguimiento.');
  },

  async generateLabel() {
    throw new Error('Un transportista manual no tiene etiqueta.');
  },
};
