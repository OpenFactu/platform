import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';

export interface CompanyConfig {
  name: string;
  taxId: string;
  address: string;
  city: string;
  zipCode: string;
  country: string; // Código ISO de 2 letras
  regionId: string;
  subRegionId: string;
  localityId: string;
  email: string;
  phone: string;
  website: string;
  logoUrl: string;
  currency: string;
  fiscalYearStart: string;
}

const FIELD_TO_KEY: Record<keyof CompanyConfig, string> = {
  name: 'company_name',
  taxId: 'company_tax_id',
  address: 'company_address',
  city: 'company_city',
  zipCode: 'company_zip_code',
  country: 'company_country',
  regionId: 'company_region_id',
  subRegionId: 'company_sub_region_id',
  localityId: 'company_locality_id',
  email: 'company_email',
  phone: 'company_phone',
  website: 'company_website',
  logoUrl: 'company_logo_url',
  currency: 'company_currency',
  fiscalYearStart: 'company_fiscal_year_start',
};

const DEFAULTS: CompanyConfig = {
  name: '',
  taxId: '',
  address: '',
  city: '',
  zipCode: '',
  country: '',
  regionId: '',
  subRegionId: '',
  localityId: '',
  email: '',
  phone: '',
  website: '',
  logoUrl: '',
  currency: 'EUR',
  fiscalYearStart: '01-01',
};

export async function getCompanyConfig(db: any): Promise<CompanyConfig> {
  const rows = await db.select().from(schema.systemConfigs);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value || '';

  const result: CompanyConfig = { ...DEFAULTS };
  for (const field of Object.keys(FIELD_TO_KEY) as (keyof CompanyConfig)[]) {
    const key = FIELD_TO_KEY[field];
    if (map[key] !== undefined && map[key] !== '') {
      result[field] = map[key];
    }
  }
  return result;
}

export async function setCompanyConfig(
  db: any,
  patch: Partial<CompanyConfig>,
): Promise<CompanyConfig> {
  const entries = (Object.keys(patch) as (keyof CompanyConfig)[])
    .filter((k) => k in FIELD_TO_KEY)
    .map((k) => ({ key: FIELD_TO_KEY[k], value: String(patch[k] ?? '') }));

  for (const { key, value } of entries) {
    const existing = await db
      .select({ id: schema.systemConfigs.id })
      .from(schema.systemConfigs)
      .where(eq(schema.systemConfigs.key, key));
    if (existing.length > 0) {
      await db
        .update(schema.systemConfigs)
        .set({ value, updatedAt: new Date() })
        .where(eq(schema.systemConfigs.key, key));
    } else {
      await db.insert(schema.systemConfigs).values({
        id: crypto.randomUUID(),
        key,
        value,
        description: 'Datos de empresa',
        updatedAt: new Date(),
      });
    }
  }

  return getCompanyConfig(db);
}
