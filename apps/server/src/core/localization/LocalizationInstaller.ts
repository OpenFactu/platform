import crypto from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { ClientFactory } from '../tenant/ClientFactory';
import { TenantPluginCache } from '../plugins/TenantPluginCache';
import { LocalizationRegistry } from './LocalizationRegistry';
import type { LocalizationPack } from './types';

/** Impuesto mínimo de una empresa sin paquete: sin él no se podría facturar. */
const NEUTRAL_TAX_CODE = 'TAX0';

/** Aplica una lista "código ya existente → no tocar". Devuelve cuántos ha creado. */
async function insertMissing<T>(
  items: T[] | undefined,
  exists: (item: T) => Promise<boolean>,
  insert: (item: T) => Promise<void>,
): Promise<number> {
  let created = 0;
  for (const item of items ?? []) {
    if (await exists(item)) continue;
    await insert(item);
    created++;
  }
  return created;
}

async function applyTaxes(db: any, pack: LocalizationPack): Promise<void> {
  for (const tax of pack.taxes ?? []) {
    const [existing] = await db
      .select({ id: schema.taxGroups.id, packId: schema.taxGroups.packId })
      .from(schema.taxGroups)
      .where(eq(schema.taxGroups.code, tax.code));
    const details = {
      category: tax.category ?? 'tax',
      validFrom: tax.validFrom ?? null,
      validTo: tax.validTo ?? null,
      packId: pack.id,
    };
    if (existing) {
      // El tipo no se toca: en una empresa existente manda lo que tenga
      // configurado. Solo se etiqueta de dónde viene.
      if (!existing.packId) {
        await db.update(schema.taxGroups).set(details).where(eq(schema.taxGroups.id, existing.id));
      }
      continue;
    }
    await db.insert(schema.taxGroups).values({
      id: crypto.randomUUID(),
      code: tax.code,
      rate: tax.rate.toFixed(2),
      ...details,
    });
  }
}

async function applyPayrollConcepts(db: any, pack: LocalizationPack): Promise<number> {
  return insertMissing(
    pack.payrollConcepts,
    async (c) => {
      const [row] = await db
        .select({ id: schema.payrollConcepts.id })
        .from(schema.payrollConcepts)
        .where(eq(schema.payrollConcepts.code, c.code));
      return !!row;
    },
    async (c) => {
      const taxableIncomeTax = c.taxableIncomeTax ?? true;
      const taxableSocial = c.taxableSocial ?? true;
      await db.insert(schema.payrollConcepts).values({
        id: crypto.randomUUID(),
        code: c.code,
        name: c.name,
        kind: c.kind,
        calculation: c.calculation ?? 'fixed',
        defaultPercent: c.defaultPercent != null ? String(c.defaultPercent) : null,
        category: c.category ?? null,
        taxableIncomeTax,
        taxableSocial,
        // Columnas anteriores, hasta retirarlas.
        taxableIrpf: taxableIncomeTax,
        taxableSs: taxableSocial,
      });
    },
  );
}

/**
 * Tipos de documento del paquete. Solo si la empresa es de uno de sus países: una
 * empresa adoptada por tener esos impuestos no tiene por qué emitir estos tipos.
 */
async function applyDocumentTypes(db: any, pack: LocalizationPack): Promise<void> {
  const [row] = await db
    .select({ value: schema.systemConfigs.value })
    .from(schema.systemConfigs)
    .where(eq(schema.systemConfigs.key, 'company_country'));
  if (row?.value && !pack.countries.includes(row.value)) return;
  await insertMissing(
    pack.documentTypes,
    async (t) => {
      const [existing] = await db
        .select({ id: schema.documentTypes.id })
        .from(schema.documentTypes)
        .where(eq(schema.documentTypes.code, t.code));
      return !!existing;
    },
    async (t) => {
      await db.insert(schema.documentTypes).values({
        id: crypto.randomUUID(),
        code: t.code,
        name: t.name,
        pluginId: null,
        docCategory: t.docCategory,
        isRectify: !!t.isRectify,
        isActive: true,
        sortOrder: t.sortOrder ?? 0,
      });
    },
  );
}

/** El impuesto a 0 % de una empresa sin paquete sobra en cuanto llega uno, si nadie lo usó. */
async function removeUnusedNeutralTax(db: any): Promise<void> {
  const [used] = await db
    .select({ id: schema.documentLineTaxes.id })
    .from(schema.documentLineTaxes)
    .where(eq(schema.documentLineTaxes.code, NEUTRAL_TAX_CODE))
    .limit(1);
  if (used) return;
  try {
    await db
      .delete(schema.taxGroups)
      .where(and(eq(schema.taxGroups.code, NEUTRAL_TAX_CODE), isNull(schema.taxGroups.packId)));
  } catch {
    // Algún artículo lo tiene asignado: se queda.
  }
}

/**
 * Plan contable y mapeos del paquete. Solo añade lo que falta: nunca cambia una
 * cuenta ni un mapeo que la empresa ya tenga.
 */
async function applyAccountingOf(
  db: any,
  pack: LocalizationPack,
): Promise<{ accountsCreated: number; mappingsCreated: number }> {
  const accountsCreated = await insertMissing(
    pack.accounts,
    async (a) => {
      const [row] = await db
        .select({ id: schema.chartOfAccounts.id })
        .from(schema.chartOfAccounts)
        .where(eq(schema.chartOfAccounts.code, a.code));
      return !!row;
    },
    async (a) => {
      await db.insert(schema.chartOfAccounts).values({
        id: crypto.randomUUID(),
        code: a.code,
        name: a.name,
        type: a.type,
        isAnalytical: false,
        isActive: true,
      });
    },
  );

  const accountsByCode: Record<string, string> = {};
  for (const a of await db.select().from(schema.chartOfAccounts)) accountsByCode[a.code] = a.id;

  const mappingsCreated = await insertMissing(
    (pack.accountMappings ?? []).filter((m) => accountsByCode[m.code]),
    async (m) => {
      const [row] = await db
        .select({ id: schema.accountMappings.id })
        .from(schema.accountMappings)
        .where(
          and(eq(schema.accountMappings.kind, m.kind), eq(schema.accountMappings.key, 'default')),
        );
      return !!row;
    },
    async (m) => {
      await db.insert(schema.accountMappings).values({
        id: crypto.randomUUID(),
        kind: m.kind,
        key: 'default',
        accountId: accountsByCode[m.code],
      });
    },
  );

  return { accountsCreated, mappingsCreated };
}

async function installedVersionOf(db: any, packId: string) {
  const [row] = await db
    .select()
    .from(schema.localizationInstalls)
    .where(eq(schema.localizationInstalls.packId, packId));
  return row ?? null;
}

async function recordVersion(db: any, pack: LocalizationPack, accountingVersion: string | null) {
  const values = { version: pack.version, accountingVersion, appliedAt: new Date() };
  await db
    .insert(schema.localizationInstalls)
    .values({ packId: pack.id, ...values })
    .onConflictDoUpdate({ target: schema.localizationInstalls.packId, set: values });
}

/** ¿Tiene ya esta empresa contabilidad configurada? */
async function hasAccounting(db: any): Promise<boolean> {
  const rows = await db
    .select({ id: schema.accountMappings.id })
    .from(schema.accountMappings)
    .limit(1);
  return rows.length > 0;
}

export const LocalizationInstaller = {
  /**
   * Aplica en una empresa los paquetes activos que aún no estén en su versión
   * actual. Idempotente: con la misma versión no vuelve a tocar nada, así que
   * lo que la empresa borre o cambie después se respeta.
   *
   * El plan contable no se instala por activar el paquete: generaría asientos
   * que antes no existían. Se aplica desde el botón de configuración contable
   * (`applyAccounting`), o aquí solo si la empresa ya tenía contabilidad y el
   * paquete trae una versión nueva.
   */
  async applyForTenant(tenantId: string, db: any): Promise<string[]> {
    const applied: string[] = [];
    for (const pack of LocalizationRegistry.activeFor(tenantId)) {
      const installed = await installedVersionOf(db, pack.id);
      if (installed?.version === pack.version) continue;

      await applyTaxes(db, pack);
      if (pack.taxes?.length) await removeUnusedNeutralTax(db);
      await applyPayrollConcepts(db, pack);
      await applyDocumentTypes(db, pack);
      let accountingVersion = installed?.accountingVersion ?? null;
      if (await hasAccounting(db)) {
        await applyAccountingOf(db, pack);
        accountingVersion = pack.version;
      }
      await recordVersion(db, pack, accountingVersion);
      applied.push(pack.id);
    }
    return applied;
  },

  /** Instala el plan contable de los paquetes activos: el botón de configuración. */
  async applyAccounting(tenantId: string, db: any) {
    const active = LocalizationRegistry.activeFor(tenantId).filter((p) => p.accounts?.length);
    const total = { accountsCreated: 0, mappingsCreated: 0, packs: active.map((p) => p.id) };
    for (const pack of active) {
      const result = await applyAccountingOf(db, pack);
      total.accountsCreated += result.accountsCreated;
      total.mappingsCreated += result.mappingsCreated;
      await recordVersion(db, pack, pack.version);
    }
    return total;
  },

  /** Conceptos de nómina de los paquetes activos: el botón del catálogo de conceptos. */
  async applyPayrollCatalog(tenantId: string, db: any) {
    const active = LocalizationRegistry.activeFor(tenantId);
    let created = 0;
    for (const pack of active) created += await applyPayrollConcepts(db, pack);
    return {
      created,
      total: active.reduce((n, pack) => n + (pack.payrollConcepts?.length ?? 0), 0),
    };
  },

  /** En una empresa nueva, la moneda elegida pasa a ser la base de sus asientos. */
  async setBaseCurrency(db: any, code: string): Promise<void> {
    const rows = await db.select().from(schema.currencies);
    const target = rows.find((c: any) => c.code === code);
    if (target?.isBase) return;
    await db.update(schema.currencies).set({ isBase: false });
    if (target) {
      await db
        .update(schema.currencies)
        .set({ isBase: true })
        .where(eq(schema.currencies.id, target.id));
    } else {
      await db.insert(schema.currencies).values({
        id: crypto.randomUUID(),
        code,
        name: code,
        symbol: code,
        isBase: true,
      });
    }
  },

  /** Una empresa sin ningún impuesto recibe uno al 0 % para poder facturar. */
  async ensureUsableTaxes(db: any): Promise<void> {
    const existing = await db.select({ id: schema.taxGroups.id }).from(schema.taxGroups).limit(1);
    if (existing.length > 0) return;
    await db.insert(schema.taxGroups).values({
      id: crypto.randomUUID(),
      code: NEUTRAL_TAX_CODE,
      rate: '0.00',
    });
  },

  /**
   * Activa en una empresa el paquete del país elegido, si lo hay, y lo aplica.
   * Lo usan el alta de empresa y el arranque.
   */
  async adoptForCountry(tenantId: string, schemaName: string, country: string | null | undefined) {
    const db = ClientFactory.getClient(schemaName);
    if (country) {
      for (const { pluginId, pack } of LocalizationRegistry.installed()) {
        if (pack.countries.includes(country) && !isDeclined(tenantId, pluginId)) {
          await TenantPluginCache.activate(tenantId, pluginId);
        }
      }
    }
    await this.applyForTenant(tenantId, db);
    await this.ensureUsableTaxes(db);
  },
};

/** Plugins que una empresa ha desactivado a propósito: el arranque no los reactiva. */
const declinedPlugins = new Map<string, Set<string>>();

function isDeclined(tenantId: string, pluginId: string): boolean {
  return declinedPlugins.get(tenantId)?.has(pluginId) ?? false;
}

/** Carga las desactivaciones explícitas de `TenantPlugin` antes de adoptar. */
export async function loadDeclinedPlugins(): Promise<void> {
  const publicDb = ClientFactory.getClient('public');
  const rows = await publicDb
    .select()
    .from(schema.tenantPlugins)
    .where(eq(schema.tenantPlugins.isActive, false));
  declinedPlugins.clear();
  for (const row of rows) {
    // Una fila inactiva sin fecha de desactivación es la que se crea por
    // defecto al dar de alta la empresa, no una decisión de nadie.
    if (!row.deactivatedAt) continue;
    if (!declinedPlugins.has(row.tenantId)) declinedPlugins.set(row.tenantId, new Set());
    declinedPlugins.get(row.tenantId)!.add(row.pluginId);
  }
}
