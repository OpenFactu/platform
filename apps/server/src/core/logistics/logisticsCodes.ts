/**
 * Códigos correlativos de logística cuando el usuario no pone uno: `RT-2026-00042`.
 *
 * Van por prefijo y año, así que no chocan con los códigos al azar de antes. El
 * contador sube dentro de la transacción de quien lo pide: si esta se deshace, el
 * número no se pierde.
 */
import { sql } from 'drizzle-orm';

export async function nextLogisticsCode(tx: any, prefix: string): Promise<string> {
  const key = `${prefix}-${new Date().getFullYear()}`;
  const result = await tx.execute(sql`
    INSERT INTO "LogisticsCounter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "LogisticsCounter"."value" + 1
    RETURNING "value"
  `);
  return `${key}-${String(result.rows[0].value).padStart(5, '0')}`;
}

/** Cómo se nombra un envío ante una persona. */
export function shipmentLabel(shipment: {
  id: string;
  code?: string | null;
  trackingNumber?: string | null;
}): string {
  return shipment.code || shipment.trackingNumber || shipment.id.slice(0, 8);
}
