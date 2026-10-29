/**
 * Tareas periódicas del módulo Formularios: de momento, borrar los archivos
 * que alguien subió a un formulario y nunca envió (más de 24 h).
 */
import * as schema from '../../db/schema';
import { ClientFactory } from '../tenant/ClientFactory';
import { getConfigSection } from '../config/systemConfigSection';
import { FLAGS_DEFAULTS } from '../config/appConfig';
import { purgePendingUploads } from './files';

const INTERVAL_MS = 60 * 60 * 1000;

async function runOnce() {
  try {
    const tenants = await ClientFactory.getClient('public').select().from(schema.tenants);
    for (const t of tenants) {
      try {
        const db = ClientFactory.getClient(t.schemaName);
        const flags = await getConfigSection(db, 'flags', FLAGS_DEFAULTS);
        if (!flags.formsEnabled) continue;
        const n = await purgePendingUploads(db, t.schemaName);
        if (n) console.log(`[formsCron] ${n} subida(s) sin enviar borradas en ${t.schemaName}`);
      } catch (err: any) {
        console.warn(`[formsCron] ${t.schemaName}:`, err?.message);
      }
    }
  } catch (err: any) {
    console.error('[formsCron] Fallo global:', err?.message);
  }
}

let started = false;
export function startFormsCron() {
  if (started) return;
  started = true;
  setTimeout(() => {
    runOnce();
    setInterval(runOnce, INTERVAL_MS);
  }, 60 * 1000);
}
