/**
 * El envío automático de reclamaciones, apagado salvo que la empresa lo encienda. Solo
 * reclama lo que suba de nivel, y a un mismo cliente no antes de los días mínimos.
 *
 * Si algo falla sigue con el siguiente y avisa a los administradores una vez al día.
 */
import * as schema from '../../db/schema';
import { ClientFactory } from '../tenant/ClientFactory';
import { getConfigSection } from '../config/systemConfigSection';
import { FLAGS_DEFAULTS } from '../config/appConfig';
import { notifyAdmins } from '../realtime/notifyAdmins';
import { sendLetter } from './letters';
import { listOverdue, todayIso } from './overdueList';
import { getDunningSettings } from './settings';

const INTERVAL_MS = 60 * 60 * 1000;
const WARMUP_MS = 90 * 1000;

const noticeSent = new Map<string, string>();

async function noticeOnce(tenantId: string, db: any, body: string) {
  const today = todayIso();
  if (noticeSent.get(tenantId) === today) return;
  noticeSent.set(tenantId, today);
  await notifyAdmins(tenantId, db, {
    title: 'No se pudo enviar alguna reclamación de impago',
    body: body.slice(0, 200),
    level: 'warn',
    link: '/sales/dunning',
  });
}

export async function runAutomaticDunning(tenantId: string, db: any): Promise<void> {
  const settings = await getDunningSettings(db);
  if (!settings.autoSend) return;
  const customers = await listOverdue(db, { levels: settings.levels });
  for (const customer of customers) {
    if (customer.excluded || !customer.email || !customer.needsLetter) continue;
    if (customer.daysSinceLetter !== null && customer.daysSinceLetter < settings.minDaysBetween) {
      continue;
    }
    try {
      await sendLetter(db, { tenantId, auto: true }, customer.partnerId);
    } catch (error: any) {
      console.warn(`[dunningCron] ${customer.partnerId}:`, error?.message);
      await noticeOnce(tenantId, db, `${customer.name}: ${error?.message}`);
    }
  }
}

async function runOnce() {
  try {
    const tenants = await ClientFactory.getClient('public').select().from(schema.tenants);
    for (const tenant of tenants) {
      try {
        const db = ClientFactory.getClient(tenant.schemaName);
        const flags = await getConfigSection(db, 'flags', FLAGS_DEFAULTS);
        if (flags.salesEnabled) await runAutomaticDunning(tenant.id, db);
      } catch (error: any) {
        console.warn(`[dunningCron] Error en ${tenant.schemaName}:`, error?.message);
      }
    }
  } catch (error: any) {
    console.error('[dunningCron] Fallo global:', error?.message);
  }
}

let started = false;
export function startDunningCron() {
  if (started) return;
  started = true;
  setTimeout(() => {
    runOnce();
    setInterval(runOnce, INTERVAL_MS);
  }, WARMUP_MS);
}
