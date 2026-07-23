import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { ClientFactory } from './ClientFactory';
import * as schema from '../../db/schema';
import type { DocType } from '@openfactu/pdf';

interface SeedTaxGroup {
  code: string;
  rate: string;
}

interface SeedUom {
  code: string;
  name: string;
}

interface SeedPartnerGroup {
  code: string;
  name: string;
  codePrefix: string;
  isCustomer: boolean;
  isVendor: boolean;
}

interface SeedSeries {
  docType: DocType;
  name: string;
  description: string;
  prefix: string;
}

const TAX_GROUPS: SeedTaxGroup[] = [
  { code: 'IVA0', rate: '0.00' },
  { code: 'IVA4', rate: '4.00' },
  { code: 'IVA10', rate: '10.00' },
  { code: 'IVA21', rate: '21.00' },
];

const UOMS: SeedUom[] = [
  { code: 'UD', name: 'Unidad' },
  { code: 'KG', name: 'Kilogramo' },
  { code: 'L', name: 'Litro' },
  { code: 'M', name: 'Metro' },
  { code: 'CJ', name: 'Caja' },
  { code: 'BL', name: 'Bolsa' },
  { code: 'H', name: 'Hora' },
];

const PARTNER_GROUPS: SeedPartnerGroup[] = [
  { code: 'CLI', name: 'Clientes', codePrefix: 'CLI', isCustomer: true, isVendor: false },
  { code: 'PRV', name: 'Proveedores', codePrefix: 'PRV', isCustomer: false, isVendor: true },
  { code: 'MAY', name: 'Mayoristas', codePrefix: 'MAY', isCustomer: true, isVendor: false },
];

const SERIES: SeedSeries[] = [
  {
    docType: 'SINV',
    name: 'Facturas Venta',
    description: 'Serie por defecto de facturas de venta',
    prefix: 'FA',
  },
  {
    docType: 'PINV',
    name: 'Facturas Compra',
    description: 'Serie por defecto de facturas de compra',
    prefix: 'FC',
  },
  {
    docType: 'SDN',
    name: 'Albaranes Venta',
    description: 'Serie por defecto de albaranes de venta',
    prefix: 'AL',
  },
  {
    docType: 'PDN',
    name: 'Albaranes Compra',
    description: 'Serie por defecto de albaranes de compra',
    prefix: 'AC',
  },
  {
    docType: 'SO',
    name: 'Pedidos Venta',
    description: 'Serie por defecto de pedidos de venta',
    prefix: 'PE',
  },
  {
    docType: 'PO',
    name: 'Pedidos Compra',
    description: 'Serie por defecto de pedidos de compra',
    prefix: 'PC',
  },
  {
    docType: 'SQ',
    name: 'Presupuestos',
    description: 'Serie por defecto de presupuestos de venta',
    prefix: 'PR',
  },
];

/**
 * Siembra los datos básicos en un tenant recién creado: impuestos, unidades de
 * medida, grupos de partners, lista de precios general, categoría base, periodo
 * contable del año actual y series de documentos. Idempotente.
 */
export async function seedDefaults(schemaName: string) {
  const db = ClientFactory.getClient(schemaName);

  await seedTaxGroups(db);
  await seedUoms(db);
  await seedPartnerGroups(db);
  await seedDefaultPriceList(db);
  await seedDefaultCategory(db);
  const periodId = await seedCurrentPeriod(db);
  await seedSeries(db, periodId);

  console.log(`[seedDefaults] Datos por defecto sembrados en ${schemaName}`);
}

async function seedTaxGroups(db: any) {
  for (const tg of TAX_GROUPS) {
    const existing = await db
      .select({ id: schema.taxGroups.id })
      .from(schema.taxGroups)
      .where(eq(schema.taxGroups.code, tg.code));
    if (existing.length > 0) continue;
    await db.insert(schema.taxGroups).values({
      id: crypto.randomUUID(),
      code: tg.code,
      rate: tg.rate,
    });
  }
}

async function seedUoms(db: any) {
  for (const u of UOMS) {
    const existing = await db
      .select({ id: schema.unitsOfMeasure.id })
      .from(schema.unitsOfMeasure)
      .where(eq(schema.unitsOfMeasure.code, u.code));
    if (existing.length > 0) continue;
    await db.insert(schema.unitsOfMeasure).values({
      id: crypto.randomUUID(),
      code: u.code,
      name: u.name,
      baseValue: '1.0000',
    });
  }
}

async function seedPartnerGroups(db: any) {
  for (const pg of PARTNER_GROUPS) {
    const existing = await db
      .select({ id: schema.partnerGroups.id })
      .from(schema.partnerGroups)
      .where(eq(schema.partnerGroups.code, pg.code));
    if (existing.length > 0) continue;
    await db.insert(schema.partnerGroups).values({
      id: crypto.randomUUID(),
      code: pg.code,
      name: pg.name,
      codePrefix: pg.codePrefix,
      isCustomer: pg.isCustomer,
      isVendor: pg.isVendor,
    });
  }
}

async function seedDefaultPriceList(db: any) {
  const existing = await db.select({ id: schema.priceLists.id }).from(schema.priceLists);
  if (existing.length > 0) return;
  await db.insert(schema.priceLists).values({
    id: crypto.randomUUID(),
    name: 'General',
  });
}

async function seedDefaultCategory(db: any) {
  const existing = await db.select({ id: schema.categories.id }).from(schema.categories);
  if (existing.length > 0) return;
  await db.insert(schema.categories).values({
    id: crypto.randomUUID(),
    name: 'General',
    codePrefix: 'GEN',
  });
}

async function seedCurrentPeriod(db: any): Promise<string> {
  const year = new Date().getFullYear();
  const code = String(year);

  const [existing] = await db
    .select({ id: schema.accountingPeriods.id })
    .from(schema.accountingPeriods)
    .where(eq(schema.accountingPeriods.code, code));
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  await db.insert(schema.accountingPeriods).values({
    id,
    code,
    name: `Ejercicio ${year}`,
    startDate: new Date(year, 0, 1),
    endDate: new Date(year, 11, 31, 23, 59, 59),
    status: 'O',
  });
  return id;
}

async function seedSeries(db: any, periodId: string) {
  for (const s of SERIES) {
    const existing = await db
      .select({ id: schema.documentSeries.id })
      .from(schema.documentSeries)
      .where(
        and(
          eq(schema.documentSeries.docType, s.docType),
          eq(schema.documentSeries.periodId, periodId),
        ),
      );
    if (existing.length > 0) continue;

    await db.insert(schema.documentSeries).values({
      id: crypto.randomUUID(),
      name: `${s.name} ${new Date().getFullYear()}`,
      description: s.description,
      periodId,
      docType: s.docType,
      firstNumber: 1,
      nextNumber: 1,
      lastNumber: 99999,
      prefix: s.prefix,
      isDefault: true,
    });
  }
}
