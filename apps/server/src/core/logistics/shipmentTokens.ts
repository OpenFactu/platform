/**
 * Tokens públicos de un envío y su índice común.
 *
 * Cada envío tiene dos, con usos que no se pisan:
 *  - `reportToken`, el del enlace que recibe el cliente. Solo sirve para mirar.
 *  - `trackerToken`, el del dispositivo que envía la posición.
 *
 * Quien llega con uno no tiene sesión, así que hay que deducir la empresa del
 * propio token. El índice vive en `public` para no recorrerlas todas en cada
 * posición del GPS. Se rellena al crear el envío y, por si algo se ha colado
 * por otra vía, al arrancar el servidor.
 */
import crypto from 'crypto';
import { and, eq, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { ClientFactory } from '../tenant/ClientFactory';

export type ShipmentTokenKind = 'report' | 'tracker';

export interface ShipmentTokens {
  reportToken: string;
  trackerToken: string;
}

/** Tokens de un envío nuevo, ya apuntados en el índice. */
export async function issueShipmentTokens(
  tenantId: string,
  shipmentId: string,
): Promise<ShipmentTokens> {
  const tokens: ShipmentTokens = {
    reportToken: crypto.randomBytes(24).toString('hex'),
    trackerToken: crypto.randomBytes(24).toString('hex'),
  };
  await ClientFactory.getClient('public')
    .insert(schema.shipmentTokens)
    .values([
      { token: tokens.reportToken, tenantId, shipmentId, kind: 'report' },
      { token: tokens.trackerToken, tenantId, shipmentId, kind: 'tracker' },
    ]);
  return tokens;
}

export async function removeShipmentTokens(tenantId: string, shipmentId: string): Promise<void> {
  await ClientFactory.getClient('public')
    .delete(schema.shipmentTokens)
    .where(
      and(
        eq(schema.shipmentTokens.tenantId, tenantId),
        eq(schema.shipmentTokens.shipmentId, shipmentId),
      ),
    );
}

/** Empresa dueña del token, solo si es del tipo que se pide. */
export async function resolveTenantByToken(
  token: string,
  kind: ShipmentTokenKind,
): Promise<string | null> {
  const [row] = await ClientFactory.getClient('public')
    .select({ tenantId: schema.shipmentTokens.tenantId })
    .from(schema.shipmentTokens)
    .where(and(eq(schema.shipmentTokens.token, token), eq(schema.shipmentTokens.kind, kind)));
  return row?.tenantId ?? null;
}

/** Apunta en el índice todos los envíos de una empresa. Se puede repetir sin efectos. */
export async function indexTenantShipmentTokens(tenantId: string, tenantDb: any): Promise<void> {
  await tenantDb.execute(sql`
    INSERT INTO public."ShipmentToken" (token, "tenantId", "shipmentId", kind)
    SELECT "reportToken", ${tenantId}, id, 'report' FROM "Shipment"
    UNION ALL
    SELECT "trackerToken", ${tenantId}, id, 'tracker' FROM "Shipment"
    ON CONFLICT (token) DO NOTHING
  `);
}

export async function backfillShipmentTokens(): Promise<void> {
  const tenants = await ClientFactory.getClient('public')
    .select({ id: schema.tenants.id, schemaName: schema.tenants.schemaName })
    .from(schema.tenants);
  for (const tenant of tenants) {
    try {
      await indexTenantShipmentTokens(tenant.id, ClientFactory.getClient(tenant.schemaName));
    } catch (e: any) {
      console.warn(`[logistics] índice de tokens de ${tenant.schemaName}:`, e?.message);
    }
  }
}
