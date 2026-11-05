/**
 * Lo prometido y lo que viene de cada artículo, en su unidad base. Solo cuentan los pedidos vivos:
 * uno cerrado o cancelado no va a servir ni a traer lo que le quedara.
 */
import { sql } from 'drizzle-orm';
import * as schema from '../../db/schema';

export const committedQty = sql<string>`(
  SELECT COALESCE(SUM(GREATEST(l."quantity" - l."deliveredQty", 0) * COALESCE(l."uomFactor", 1)), 0)
  FROM "SalesOrderLine" l JOIN "SalesOrder" h ON h."id" = l."orderId"
  WHERE l."itemId" = ${schema.items.id} AND h."status" IN ('O', 'P')
)`;

export const orderedQty = sql<string>`(
  SELECT COALESCE(SUM(GREATEST(l."quantity" - l."receivedQty", 0) * COALESCE(l."uomFactor", 1)), 0)
  FROM "PurchaseOrderLine" l JOIN "PurchaseOrder" h ON h."id" = l."orderId"
  WHERE l."itemId" = ${schema.items.id} AND h."status" IN ('O', 'P')
)`;

/** Pedido en borrador: todavía no viene, pero ya está pensado. */
export const draftOrderedQty = sql<string>`(
  SELECT COALESCE(SUM(l."quantity" * COALESCE(l."uomFactor", 1)), 0)
  FROM "PurchaseOrderLine" l JOIN "PurchaseOrder" h ON h."id" = l."orderId"
  WHERE l."itemId" = ${schema.items.id} AND h."status" = 'D'
)`;
