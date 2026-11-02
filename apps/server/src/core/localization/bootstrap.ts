import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { ClientFactory } from '../tenant/ClientFactory';
import { TenantPluginCache } from '../plugins/TenantPluginCache';
import { LocalizationRegistry } from './LocalizationRegistry';
import { LocalizationInstaller, loadDeclinedPlugins } from './LocalizationInstaller';
import type { LocalizationPack } from './types';

const COUNTRY_KEY = 'company_country';

/** ¿Encaja este paquete con una empresa que aún no tiene ninguno? */
export function packMatchesCompany(
  pack: LocalizationPack,
  country: string | null,
  taxCodes: string[],
): boolean {
  if (country && pack.countries.includes(country)) return true;
  const prefixes = pack.adoption?.taxCodePrefixes ?? [];
  return taxCodes.some((code) => prefixes.some((p) => code.startsWith(p)));
}

async function companyCountry(db: any): Promise<string | null> {
  const [row] = await db
    .select({ value: schema.systemConfigs.value })
    .from(schema.systemConfigs)
    .where(eq(schema.systemConfigs.key, COUNTRY_KEY));
  return row?.value || null;
}

/**
 * Paso de arranque, después de migrar empresas y cargar plugins. Reconoce las
 * empresas que ya usaban una normativa y les activa su paquete, sin tocar
 * ningún documento emitido. Idempotente: en el siguiente arranque no hace nada
 * salvo que cambie la versión de un paquete.
 *
 * Si una empresa con datos fiscales no encuentra paquete, sigue funcionando con
 * lo que tiene: solo faltan las reglas e informes legales, y se avisa.
 */
export async function bootstrapLocalization(): Promise<void> {
  const publicDb = ClientFactory.getClient('public');
  const tenants = await publicDb.select().from(schema.tenants);
  const installed = LocalizationRegistry.installed();

  await loadDeclinedPlugins();

  for (const tenant of tenants) {
    try {
      const db = ClientFactory.getClient(tenant.schemaName);
      const country = await companyCountry(db);
      const taxGroups = await db.select({ code: schema.taxGroups.code }).from(schema.taxGroups);
      const taxCodes = taxGroups.map((t: any) => t.code);

      const match = installed.find(({ pack }) => packMatchesCompany(pack, country, taxCodes));
      const alreadyActive = LocalizationRegistry.activeFor(tenant.id).length > 0;
      const adoptCountry = match?.pack.countries.includes(country ?? '')
        ? country
        : match?.pack.countries[0];

      if (!alreadyActive && match) {
        await LocalizationInstaller.adoptForCountry(tenant.id, tenant.schemaName, adoptCountry);
      } else {
        await LocalizationInstaller.applyForTenant(tenant.id, db);
        await LocalizationInstaller.ensureUsableTaxes(db);
      }

      if (taxCodes.length > 0 && LocalizationRegistry.activeFor(tenant.id).length === 0) {
        console.warn(
          `[Localization] La empresa ${tenant.name} no tiene paquete de localización activo` +
            ` (país: ${country ?? 'sin indicar'}, plugins activos: ` +
            `${TenantPluginCache.getActivePlugins(tenant.id).join(', ') || 'ninguno'}). ` +
            `Sus facturas funcionan, pero sin reglas ni informes legales.`,
        );
      }
    } catch (err: any) {
      // Una empresa con problemas no debe impedir arrancar a las demás.
      console.error(`[Localization] Error en la empresa ${tenant.name}:`, err.message);
    }
  }
}
