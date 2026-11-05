/**
 * Mira cada hora qué recurrentes tocan. Generar dos veces no es posible, así que da igual
 * cuántas veces pase; lo que falló se reintenta en la siguiente pasada.
 */
import * as schema from '../../db/schema';
import { ClientFactory } from '../tenant/ClientFactory';
import { getConfigSection } from '../config/systemConfigSection';
import { FLAGS_DEFAULTS } from '../config/appConfig';
import { runRecurringForTenant } from './recurringDocuments';

const INTERVAL_MS = 60 * 60 * 1000;
const WARMUP_MS = 75 * 1000;

async function runOnce() {
  try {
    const tenants = await ClientFactory.getClient('public').select().from(schema.tenants);
    for (const tenant of tenants) {
      try {
        const db = ClientFactory.getClient(tenant.schemaName);
        const flags = await getConfigSection(db, 'flags', FLAGS_DEFAULTS);
        if (flags.salesEnabled) await runRecurringForTenant(tenant.id, db);
      } catch (error: any) {
        console.warn(`[recurringCron] Error en ${tenant.schemaName}:`, error?.message);
      }
    }
  } catch (error: any) {
    console.error('[recurringCron] Fallo global:', error?.message);
  }
}

let started = false;
export function startRecurringCron() {
  if (started) return;
  started = true;
  setTimeout(() => {
    runOnce();
    setInterval(runOnce, INTERVAL_MS);
  }, WARMUP_MS);
}
