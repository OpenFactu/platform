/**
 * Enviar con un transportista de verdad. El núcleo no conoce a ninguno: cada uno es
 * un adaptador que registra un plugin en `CarrierRegistry`.
 *
 * Lo externo va fuera de la transacción: si la API del transportista falla, el envío
 * no se ha movido. Sin adaptador, o con el manual, no hay API y el número lo escribe
 * quien despacha.
 */
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { CarrierRegistry } from '../carriers/CarrierRegistry';
import type { CarrierStatusKind, ICarrierAdapter } from '../carriers/ICarrierAdapter';
import { loadShipment } from './routeActions';
import {
  LogisticsError,
  assertTransition,
  canTransition,
  stateOf,
  type ShipmentState,
} from './shipmentLifecycle';
import { transitionShipment, withEffects, type LogisticsContext } from './shipmentTransitions';

const isManual = (adapter: ICarrierAdapter | null) => !adapter || !!adapter.manual;

async function loadAccount(db: any, accountId: string) {
  const [account] = await db
    .select()
    .from(schema.carrierAccounts)
    .where(eq(schema.carrierAccounts.id, accountId));
  if (!account) throw new LogisticsError('Cuenta no encontrada', 404);
  const [carrier] = await db
    .select()
    .from(schema.carriers)
    .where(eq(schema.carriers.id, account.carrierId));
  if (!carrier) throw new LogisticsError('Carrier no encontrado', 404);
  return { account, carrier, adapter: CarrierRegistry.get(carrier.adapterId) };
}

/** Las cuentas entre las que elegir al despachar, sin sus credenciales. */
export async function listCarrierAccounts(db: any) {
  const rows = await db
    .select({
      id: schema.carrierAccounts.id,
      name: schema.carrierAccounts.name,
      isDefault: schema.carrierAccounts.isDefault,
      carrierName: schema.carriers.name,
      adapterId: schema.carriers.adapterId,
      isActive: schema.carriers.isActive,
    })
    .from(schema.carrierAccounts)
    .innerJoin(schema.carriers, eq(schema.carrierAccounts.carrierId, schema.carriers.id));
  return rows
    .filter((row: any) => row.isActive)
    .map(({ adapterId, isActive: _active, ...row }: any) => ({
      ...row,
      manual: isManual(CarrierRegistry.get(adapterId)),
    }));
}

async function totalWeightKg(db: any, shipmentId: string) {
  const rows = await db
    .select({ weightKg: schema.packages.weightKg })
    .from(schema.packages)
    .where(eq(schema.packages.shipmentId, shipmentId));
  const total = rows.reduce((sum: number, row: any) => sum + Number(row.weightKg || 0), 0);
  return total > 0 ? total : null;
}

export async function dispatchWithCarrier(
  ctx: LogisticsContext,
  id: string,
  input: { carrierAccountId?: string | null; trackingNumber?: string | null },
) {
  if (!input.carrierAccountId) throw new LogisticsError('Elige una cuenta de transportista.', 400);
  const shipment = await loadShipment(ctx.db, id);
  assertTransition(stateOf(shipment), 'dispatched');
  const { account, carrier, adapter } = await loadAccount(ctx.db, input.carrierAccountId);

  let trackingNumber = input.trackingNumber?.trim() || null;
  let label: Buffer | undefined;
  if (isManual(adapter)) {
    if (!trackingNumber) {
      throw new LogisticsError('Este transportista no está integrado: escribe su número.', 400);
    }
  } else {
    try {
      const created = await adapter!.createShipment(account.credentials as any, {
        shipmentId: id,
        destinationAddress: shipment.destinationAddress,
        recipientName: shipment.recipientName,
        recipientPhone: shipment.recipientPhone,
        recipientEmail: shipment.recipientEmail,
        weightKg: await totalWeightKg(ctx.db, id),
        notes: shipment.notes,
      });
      trackingNumber = created.trackingNumber;
      label = created.labelPdf;
    } catch (e: any) {
      throw new LogisticsError(`El transportista ha dado un error: ${e?.message || e}`, 502);
    }
  }

  await withEffects(ctx, async (tx, effects) => {
    const current = await loadShipment(tx, id, true);
    await transitionShipment(ctx, tx, effects, current, 'dispatched', {
      description: `${carrier.name} · ${trackingNumber}`,
      set: {
        carrier: carrier.code || carrier.name,
        carrierAccountId: account.id,
        trackingNumber,
      },
    });
    await tx
      .delete(schema.shipmentCarrierLabels)
      .where(eq(schema.shipmentCarrierLabels.shipmentId, id));
    if (label) {
      await tx
        .insert(schema.shipmentCarrierLabels)
        .values({ shipmentId: id, pdf: label.toString('base64') });
    }
  });
  return { trackingNumber };
}

/** La etiqueta guardada al crear el envío o, si no hay, la que genere el adaptador. */
export async function carrierLabel(db: any, id: string): Promise<Buffer> {
  const [stored] = await db
    .select({ pdf: schema.shipmentCarrierLabels.pdf })
    .from(schema.shipmentCarrierLabels)
    .where(eq(schema.shipmentCarrierLabels.shipmentId, id));
  if (stored) return Buffer.from(stored.pdf, 'base64');
  const shipment = await loadShipment(db, id);
  if (shipment.carrierAccountId && shipment.trackingNumber) {
    const { account, adapter } = await loadAccount(db, shipment.carrierAccountId);
    if (!isManual(adapter)) {
      return adapter!.generateLabel(account.credentials as any, shipment.trackingNumber);
    }
  }
  throw new LogisticsError('Este envío no tiene etiqueta del transportista.', 404);
}

const STATE_OF_CARRIER: Partial<Record<CarrierStatusKind, ShipmentState>> = {
  in_transit: 'in_transit',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  exception: 'exception',
  returned: 'returned',
  cancelled: 'cancelled',
};

/**
 * Pregunta al transportista y mueve el envío si toca. Una respuesta que no encaja,
 * como un estado atrasado, se ignora: nunca devuelve un envío hacia atrás.
 */
export async function refreshCarrierTracking(ctx: LogisticsContext, id: string) {
  const shipment = await loadShipment(ctx.db, id);
  if (!shipment.carrierAccountId || !shipment.trackingNumber) {
    throw new LogisticsError('Este envío no va con un transportista.', 409);
  }
  const { account, adapter } = await loadAccount(ctx.db, shipment.carrierAccountId);
  if (isManual(adapter)) return { changed: false };

  let snapshot;
  try {
    snapshot = await adapter!.fetchTracking(account.credentials as any, shipment.trackingNumber);
  } catch (e: any) {
    throw new LogisticsError(`El transportista ha dado un error: ${e?.message || e}`, 502);
  }

  const data: Record<string, unknown> = {};
  if (snapshot.estimatedDelivery) data.estimatedDelivery = snapshot.estimatedDelivery;
  if (snapshot.lastLat != null && snapshot.lastLng != null) {
    data.lastLat = snapshot.lastLat;
    data.lastLng = snapshot.lastLng;
    data.lastLocationAt = snapshot.lastEventAt ?? new Date();
  }
  const to = STATE_OF_CARRIER[snapshot.status];
  return withEffects(ctx, async (tx, effects) => {
    const current = await loadShipment(tx, id, true);
    const moves = !!to && canTransition(stateOf(current), to);
    if (Object.keys(data).length > 0) {
      await tx.update(schema.shipments).set(data).where(eq(schema.shipments.id, id));
    }
    if (moves) {
      await transitionShipment(ctx, tx, effects, current, to!, {
        description: snapshot.description ?? null,
      });
    }
    return { changed: moves };
  });
}

/** Una ronda por los envíos abiertos con transportista. Devuelve cuántos ha consultado. */
export async function refreshOpenCarrierShipments(ctx: LogisticsContext): Promise<number> {
  const open = await ctx.db
    .select({ id: schema.shipments.id })
    .from(schema.shipments)
    .where(
      and(
        isNotNull(schema.shipments.carrierAccountId),
        inArray(schema.shipments.status, [
          'dispatched',
          'in_transit',
          'out_for_delivery',
          'postponed',
          'exception',
        ]),
      ),
    );
  let count = 0;
  for (const { id } of open) {
    try {
      await refreshCarrierTracking(ctx, id);
      count++;
    } catch (e: any) {
      console.warn(`[logistics] seguimiento del transportista (${id}):`, e?.message);
    }
  }
  return count;
}
