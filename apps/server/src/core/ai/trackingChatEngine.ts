/**
 * Motor de chat de Keiro para la página pública de seguimiento
 * (`/track/:token`, sin login) — ver `publicTrackRouter` en
 * `apps/server/src/api/logistics.ts`.
 *
 * Deliberadamente NO reutiliza `buildChatTools`/`ChatToolContext` (el motor
 * interno, para usuarios ERP autenticados con rol/tenant/permisos): aquí el
 * interlocutor es un visitante público anónimo, identificado solo por el
 * `reportToken` de UN envío. El alcance está grabado en piedra:
 *  - Los datos del envío (status, eventos) se incrustan en el prompt YA
 *    RESUELTOS por la ruta — el modelo nunca elige qué envío consultar, ni
 *    puede pedir otro.
 *  - Una única tool, `report_incident`, sin `needsApproval` (esta página no
 *    tiene tarjeta de confirmación) — inserta un `ShipmentEvent` con el
 *    `shipmentId` fijado por el servidor, nunca por el modelo.
 *  - Nada de search_partners/SQL/documentos — cero acceso a datos fuera de
 *    este envío.
 */

import { streamText, stepCountIs, convertToModelMessages, tool, type UIMessage } from 'ai';
import { z } from 'zod';
import crypto from 'crypto';
import { getLanguageModel } from './index';
import type { AiConfig } from './types';
import * as schema from '../../db/schema';
import { notifyTenant } from '../realtime/notifyTenant';
import { broadcastEvent } from '../realtime/EventSocket';

const MAX_STEPS = 4;
const MAX_OUTPUT_TOKENS = 1024;

export interface TrackedShipmentEvent {
  kind: string;
  status: string | null;
  description: string | null;
  createdAt: Date | string;
}

export interface TrackedShipment {
  id: string;
  status: string | null;
  /** 'delivery' (entrega normal) o 'pickup_return' (vamos a RECOGER un paquete). */
  kind?: string | null;
  destinationAddress: string | null;
  estimatedDelivery: Date | string | null;
  deliveredAt: Date | string | null;
  events: TrackedShipmentEvent[];
}

function buildSystemPrompt(shipment: TrackedShipment): string {
  const today = new Date().toISOString().slice(0, 10);
  const isPickup = shipment.kind === 'pickup_return';
  return [
    'Eres el asistente de seguimiento de UN ÚNICO envío para un cliente externo, sin cuenta ni login. NO eres el asistente interno del ERP — no tienes acceso a nada más que los datos de ESTE envío, que se te dan a continuación.',
    isPickup
      ? '- OJO: este envío es una RECOGIDA (kind=pickup_return): NO le llevamos un pedido al cliente, vamos a SU dirección a recoger un paquete (normalmente por una incidencia o devolución). Habla siempre en esos términos: "pasaremos a recoger", "ten el paquete preparado", "recogido" en vez de "entregado".'
      : null,
    '',
    'Reglas ESTRICTAS:',
    '- Solo puedes hablar de este envío. Si te piden cualquier otra cosa (datos de otros clientes, precios, información interna de la empresa, otros pedidos), rehúsa con claridad: no tienes acceso a eso.',
    '- NUNCA prometas reembolsos, compensaciones económicas ni cambios de fecha de entrega — no está en tu mano. Si el cliente lo pide, dile que el equipo lo revisará.',
    '- Si el cliente reporta un problema con el envío (no ha llegado, llegó dañado, nadie fue a recogerlo, tarda demasiado, etc.), usa report_incident para dejarlo registrado — resume el problema en la descripción. Confirma que ha quedado registrado SOLO si la tool devolvió ok:true; si devolvió ok:false, discúlpate, di que no se ha podido registrar y sugiere contactar con la empresa por otro canal. NUNCA afirmes que algo quedó registrado sin haber usado la tool con éxito.',
    '- No inventes información que no esté en los datos de abajo. Si no sabes algo, dilo.',
    '- Responde en el idioma del cliente (probablemente español), de forma breve, cercana y clara — esto es un chat de atención al cliente, no un informe.',
    '',
    `Fecha de hoy: ${today}.`,
    '',
    'Datos del envío (JSON):',
    JSON.stringify(
      {
        kind: shipment.kind || 'delivery',
        status: shipment.status,
        destination: shipment.destinationAddress,
        estimatedDelivery: shipment.estimatedDelivery,
        deliveredAt: shipment.deliveredAt,
        events: shipment.events,
      },
      null,
      2,
    ),
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

// Rate limiting best-effort, en memoria, por reportToken. No existe infra
// de rate-limit en el proyecto (confirmado por grep) — esto es
// deliberadamente simple y de un solo proceso; si hiciera falta algo más
// robusto (Redis, multi-proceso) queda para más adelante, mismo espíritu
// pragmático que el TODO de caché ya existente en
// `resolveTenantByReportToken` (logistics.ts).
const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const rateLimitState = new Map<string, { count: number; resetAt: number }>();

/** true si la request puede continuar; false si se ha superado el límite. */
export function checkTrackingChatRateLimit(token: string): boolean {
  const now = Date.now();
  const entry = rateLimitState.get(token);
  if (!entry || now > entry.resetAt) {
    rateLimitState.set(token, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

export async function streamTrackingChat(opts: {
  aiConfig: AiConfig;
  tenantClient: any;
  tenantId: string;
  shipment: TrackedShipment;
  messages: UIMessage[];
}) {
  const model = getLanguageModel(opts.aiConfig);

  const tools = {
    report_incident: tool({
      description:
        'Registra una incidencia reportada por el cliente sobre ESTE envío: queda en el historial, notifica al equipo y aparece en Logística → Incidencias ("Reportadas por clientes"). Úsala cuando el cliente reporte un problema real con su envío.',
      inputSchema: z.object({
        description: z
          .string()
          .describe('Resumen breve y claro del problema reportado por el cliente'),
      }),
      execute: async ({ description }: { description: string }) => {
        // Nunca dejar que un fallo aquí reviente el stream — devolvemos
        // ok:false y el prompt obliga al modelo a NO afirmar que se registró.
        try {
          const id = crypto.randomUUID();
          await opts.tenantClient.insert(schema.shipmentEvents).values({
            id,
            shipmentId: opts.shipment.id,
            kind: 'incident',
            description,
          });
          // Aviso al equipo: campana persistente + realtime para refrescar
          // la pestaña de incidencias. Best-effort — el registro ya está.
          notifyTenant({
            tenantId: opts.tenantId,
            tenantClient: opts.tenantClient,
            title: 'Incidencia reportada por un cliente',
            body: description.slice(0, 300),
            level: 'warn',
            link: `/logistics/shipments/${opts.shipment.id}`,
          }).catch(() => {});
          broadcastEvent(opts.tenantId, {
            type: 'shipment.incident',
            payload: { shipmentId: opts.shipment.id, description },
          } as any);
          return { ok: true };
        } catch (e: any) {
          console.error('[trackingChat] report_incident falló:', e?.message);
          return { ok: false, error: 'No se pudo registrar la incidencia' };
        }
      },
    }),
  };

  return streamText({
    model,
    system: buildSystemPrompt(opts.shipment),
    // ignoreIncompleteToolCalls: si un turno anterior se cortó a mitad de una
    // tool-call, el historial reenviado trae partes huérfanas que romperían
    // la conversión ("messages do not match the ModelMessage[] schema").
    messages: await convertToModelMessages(opts.messages, { ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    abortSignal: AbortSignal.timeout(60_000),
  });
}
