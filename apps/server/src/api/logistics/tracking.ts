/**
 * Lo público del seguimiento: sin sesión de usuario, identificado por un token.
 *
 * Se monta aparte en server.ts porque no debe pasar por el middleware de auth ni
 * de tenant. El enlace del cliente (`reportToken`) solo sirve para mirar y para
 * el chat; la posición la envía el dispositivo del conductor con `trackerToken`.
 */
import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import crypto from 'crypto';
import * as schema from '../../db/schema';
import { broadcastEvent } from '../../core/realtime/EventSocket';
import { ClientFactory } from '../../core/tenant/ClientFactory';
import { getConfigSection } from '../../core/config/systemConfigSection';
import { BRANDING_DEFAULTS, FLAGS_DEFAULTS } from '../../core/config/appConfig';
import { getAiConfig } from '../../core/ai';
import { streamTrackingChat, checkTrackingChatRateLimit } from '../../core/ai/trackingChatEngine';
import { resolveTenantByToken } from '../../core/logistics/shipmentTokens';
import { isClosedState, stateOf } from '../../core/logistics/shipmentLifecycle';
import { getDeliveryFlow, publicMap } from '../../core/logistics/deliveryFlow';

export const publicTrackRouter = Router();

/**
 * GET público de seguimiento — devuelve status + últimos eventos + última
 * posición. Sin datos sensibles (no partner, no líneas, no precios).
 *
 * Uso típico: un cliente final recibe un enlace `/track/<token>` y consulta.
 */
publicTrackRouter.get('/track/:token', async (req: any, res) => {
  try {
    const token = req.params.token;
    if (!token || token.length < 16) return res.status(400).json({ error: 'token' });
    const tenantId = await resolveTenantByToken(token, 'report');
    if (!tenantId) return res.status(404).json({ error: 'token desconocido' });
    const tenantDb = await getTenantDb(tenantId);
    const [s] = await tenantDb
      .select({
        id: schema.shipments.id,
        code: schema.shipments.code,
        preparationStatus: schema.shipments.preparationStatus,
        status: schema.shipments.status,
        kind: schema.shipments.kind,
        destinationAddress: schema.shipments.destinationAddress,
        destinationLat: schema.shipments.destinationLat,
        destinationLng: schema.shipments.destinationLng,
        lastLat: schema.shipments.lastLat,
        lastLng: schema.shipments.lastLng,
        lastLocationAt: schema.shipments.lastLocationAt,
        estimatedDelivery: schema.shipments.estimatedDelivery,
        deliveredAt: schema.shipments.deliveredAt,
        createdAt: schema.shipments.createdAt,
        updatedAt: schema.shipments.updatedAt,
      })
      .from(schema.shipments)
      .where(eq(schema.shipments.reportToken, token));
    if (!s) return res.status(404).json({ error: 'shipment' });

    const events = await tenantDb
      .select({
        kind: schema.shipmentEvents.kind,
        status: schema.shipmentEvents.status,
        description: schema.shipmentEvents.description,
        createdAt: schema.shipmentEvents.createdAt,
      })
      .from(schema.shipmentEvents)
      // Las notas y las faltas son internas: el cliente solo ve los cambios de estado.
      .where(
        and(
          eq(schema.shipmentEvents.shipmentId, s.id),
          eq(schema.shipmentEvents.kind, 'status_change'),
        ),
      )
      .orderBy(desc(schema.shipmentEvents.createdAt))
      .limit(50);

    const state = stateOf(s);

    // Chat de Keiro en esta página: solo si el tenant lo activó
    // explícitamente (flag off por defecto, ver appConfig.ts) Y tiene la IA
    // configurada — así el frontend sabe si mostrar el punto de entrada sin
    // una llamada extra.
    const [flags, aiCfg, branding] = await Promise.all([
      getConfigSection(tenantDb, 'flags', FLAGS_DEFAULTS),
      getAiConfig(tenantDb),
      getConfigSection(tenantDb, 'branding', BRANDING_DEFAULTS),
    ]);
    const chatEnabled = !!flags.trackingChatEnabled && !!aiCfg.enabled;

    res.json({
      code: s.code,
      status: state,
      legacyStatus: s.status,
      kind: s.kind || 'delivery',
      destination: { address: s.destinationAddress || null },
      lastPosition:
        s.lastLat != null && s.lastLng != null
          ? { lat: s.lastLat, lng: s.lastLng, reportedAt: s.lastLocationAt }
          : null,
      estimatedDelivery: s.estimatedDelivery,
      deliveredAt: s.deliveredAt,
      events,
      updatedAt: s.updatedAt,
      chatEnabled,
      map: publicMap(await getDeliveryFlow(tenantDb)),
      // Sin sesión no hay tema cargado: la página se pinta con el de la empresa.
      branding: {
        appName: branding.appName,
        logoUrl: branding.logoUrl,
        colorPrimary: branding.colorPrimary,
        colorAccent: branding.colorAccent,
        themeMode: branding.themeMode,
        themePreset: branding.themePreset,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST público de chat de Keiro para ESTE envío — sin login, igual que el
 * GET de arriba. Solo responde si el tenant activó `flags.trackingChatEnabled`
 * y tiene la IA configurada; el motor (`trackingChatEngine.ts`) no tiene
 * acceso a nada fuera de este envío — ver su cabecera para el porqué.
 */
publicTrackRouter.post('/track/:token/chat', async (req: any, res) => {
  try {
    const token = req.params.token;
    if (!token || token.length < 16) return res.status(400).json({ error: 'token' });

    const tenantId = await resolveTenantByToken(token, 'report');
    if (!tenantId) return res.status(404).json({ error: 'token desconocido' });
    const tenantDb = await getTenantDb(tenantId);

    const flags = await getConfigSection(tenantDb, 'flags', FLAGS_DEFAULTS);
    if (!flags.trackingChatEnabled) {
      return res.status(403).json({ error: 'El chat no está disponible para este envío' });
    }
    const aiCfg = await getAiConfig(tenantDb);
    if (!aiCfg.enabled) {
      return res
        .status(400)
        .json({ error: 'El asistente de IA no está activado para esta empresa' });
    }

    if (!checkTrackingChatRateLimit(token)) {
      return res
        .status(429)
        .json({ error: 'Demasiados mensajes — inténtalo de nuevo en unos minutos' });
    }

    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (messages.length === 0) return res.status(400).json({ error: 'messages es obligatorio' });
    // Límites laxos pero explícitos — esta ruta es pública y sin login, no
    // hay ningún otro freno de tamaño de payload aquí.
    if (messages.length > 40)
      return res.status(400).json({ error: 'Conversación demasiado larga' });
    if (JSON.stringify(messages).length > 20_000) {
      return res.status(400).json({ error: 'Mensaje demasiado largo' });
    }

    const [s] = await tenantDb
      .select({
        id: schema.shipments.id,
        preparationStatus: schema.shipments.preparationStatus,
        status: schema.shipments.status,
        kind: schema.shipments.kind,
        destinationAddress: schema.shipments.destinationAddress,
        estimatedDelivery: schema.shipments.estimatedDelivery,
        deliveredAt: schema.shipments.deliveredAt,
      })
      .from(schema.shipments)
      .where(eq(schema.shipments.reportToken, token));
    if (!s) return res.status(404).json({ error: 'shipment' });

    const events = await tenantDb
      .select({
        kind: schema.shipmentEvents.kind,
        status: schema.shipmentEvents.status,
        description: schema.shipmentEvents.description,
        createdAt: schema.shipmentEvents.createdAt,
      })
      .from(schema.shipmentEvents)
      // Las notas y las faltas son internas: el cliente solo ve los cambios de estado.
      .where(
        and(
          eq(schema.shipmentEvents.shipmentId, s.id),
          eq(schema.shipmentEvents.kind, 'status_change'),
        ),
      )
      .orderBy(desc(schema.shipmentEvents.createdAt))
      .limit(20);

    const result = await streamTrackingChat({
      aiConfig: aiCfg,
      tenantClient: tenantDb,
      tenantId,
      shipment: {
        id: s.id,
        status: stateOf(s),
        kind: s.kind || 'delivery',
        destinationAddress: s.destinationAddress,
        estimatedDelivery: s.estimatedDelivery,
        deliveredAt: s.deliveredAt,
        events,
      },
      messages,
    });

    result.pipeUIMessageStreamToResponse(res, {
      onError: (e: unknown) => (e instanceof Error ? e.message : 'Error del asistente'),
    });
  } catch (e: any) {
    console.error('[publicTrackRouter.chat]', e);
    if (!res.headersSent) {
      res.status(502).json({ error: e?.message || 'Error en el chat de seguimiento' });
    } else {
      res.end();
    }
  }
});

publicTrackRouter.post('/track/:token/position', async (req: any, res) => {
  try {
    const token = req.params.token;
    if (!token || token.length < 16) return res.status(400).json({ error: 'token' });

    const tenantId = await resolveTenantByToken(token, 'tracker');
    if (!tenantId) return res.status(404).json({ error: 'token desconocido' });

    const tenantDb = await getTenantDb(tenantId);
    const [s] = await tenantDb
      .select()
      .from(schema.shipments)
      .where(eq(schema.shipments.trackerToken, token));
    if (!s) return res.status(404).json({ error: 'shipment' });

    const body = req.body || {};
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
      return res.status(400).json({ error: 'lat/lng requeridos' });
    if (isClosedState(stateOf(s))) return res.status(409).json({ error: 'El envío ya ha terminado' });

    const id = crypto.randomUUID();
    await tenantDb.insert(schema.shipmentPositions).values({
      id,
      shipmentId: s.id,
      lat,
      lng,
      speedKmh: body.speedKmh ?? null,
      heading: body.heading ?? null,
      accuracyMeters: body.accuracyMeters ?? null,
    });
    // Actualiza denormalizado en Shipment.
    await tenantDb
      .update(schema.shipments)
      .set({ lastLat: lat, lastLng: lng, lastLocationAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.shipments.id, s.id));

    broadcastEvent(tenantId, {
      type: 'shipment.position',
      payload: { shipmentId: s.id, lat, lng, at: Date.now() },
    } as any);

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

async function getTenantDb(tenantId: string) {
  const publicDb = ClientFactory.getClient('public');
  const [t] = await publicDb
    .select({ schemaName: schema.tenants.schemaName })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId));
  if (!t) throw new Error('tenant no encontrado');
  return ClientFactory.getClient(t.schemaName);
}
