/**
 * Precio efectivo de venta (SIN IVA) de unos artículos para un cliente:
 * el de su tarifa si la tiene y el artículo está en ella; si no, el precio base.
 * Lo comparten la tienda pública y el CRM.
 */
import { eq, inArray } from 'drizzle-orm';
import * as schema from '../../db/schema';

export async function resolveEffectivePrices(
  db: any,
  itemRows: Array<{ id: string; basePrice: any }>,
  priceListId: string | null,
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  for (const item of itemRows) prices.set(item.id, Number(item.basePrice) || 0);
  if (!priceListId) return prices;
  const listPrices = await db
    .select()
    .from(schema.itemPrices)
    .where(eq(schema.itemPrices.priceListId, priceListId));
  for (const lp of listPrices) {
    if (prices.has(lp.itemId)) prices.set(lp.itemId, Number(lp.price) || 0);
  }
  return prices;
}

/** Precios de `itemIds` para el cliente `partnerId` (su tarifa, o el precio base). */
export async function pricesForPartner(
  db: any,
  partnerId: string | null,
  itemIds: string[],
): Promise<Map<string, number>> {
  if (itemIds.length === 0) return new Map();
  const itemRows = await db
    .select({ id: schema.items.id, basePrice: schema.items.basePrice })
    .from(schema.items)
    .where(inArray(schema.items.id, itemIds));
  let priceListId: string | null = null;
  if (partnerId) {
    const [partner] = await db
      .select({ priceListId: schema.businessPartners.priceListId })
      .from(schema.businessPartners)
      .where(eq(schema.businessPartners.id, partnerId));
    priceListId = partner?.priceListId ?? null;
  }
  return resolveEffectivePrices(db, itemRows, priceListId);
}
