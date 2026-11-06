/**
 * Cada cierto tiempo pregunta a los transportistas por los envíos abiertos, para que
 * el cliente vea el estado sin que nadie tenga que entrar a actualizarlo.
 */
import * as schema from '../../db/schema';
import { refreshOpenCarrierShipments } from '../logistics/carrierDispatch';
import { ClientFactory } from '../tenant/ClientFactory';
import { configuredPublicBaseUrl } from '../../utils/publicBaseUrl';

const EVERY_MS = 15 * 60 * 1000;

export function startCarrierTrackingCron() {
  const timer = setInterval(async () => {
    try {
      const tenants = await ClientFactory.getClient('public')
        .select({ id: schema.tenants.id, schemaName: schema.tenants.schemaName })
        .from(schema.tenants);
      for (const tenant of tenants) {
        const db = ClientFactory.getClient(tenant.schemaName);
        await refreshOpenCarrierShipments({
          db,
          tenantId: tenant.id,
          userId: null,
          baseUrl: await configuredPublicBaseUrl(db),
        }).catch((e: any) => console.warn(`[carriers] ${tenant.schemaName}:`, e?.message));
      }
    } catch (e: any) {
      console.warn('[carriers] seguimiento:', e?.message);
    }
  }, EVERY_MS);
  timer.unref();
}
