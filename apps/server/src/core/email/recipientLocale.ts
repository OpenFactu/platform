import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { DEFAULT_LOCALE, parseLocale, type Locale } from '../../i18n';
import { ClientFactory } from '../tenant/ClientFactory';

/**
 * El idioma de un correo a un cliente, por su país. Un país cuyo idioma no tenemos recibe
 * el inglés, que se entiende mejor que el español.
 */
export async function localeForCountry(country: string | null | undefined): Promise<Locale> {
  if (!country) return DEFAULT_LOCALE;
  const [row] = await ClientFactory.getClient('public')
    .select({ localeDefault: schema.countries.localeDefault })
    .from(schema.countries)
    .where(eq(schema.countries.code, country.toUpperCase()));
  if (!row) return DEFAULT_LOCALE;
  const locale = parseLocale(row.localeDefault);
  return locale === DEFAULT_LOCALE && !row.localeDefault.toLowerCase().startsWith('es')
    ? 'en'
    : locale;
}
