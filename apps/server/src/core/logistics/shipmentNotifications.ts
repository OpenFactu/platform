/**
 * Notificaciones por email al destinatario de un envío cuando cambia de etapa.
 *
 * Se enfila (no se envía sincrónico) vía `enqueueMail` — para que un fallo
 * del SMTP no bloquee el PATCH del envío. El MailQueue reintenta.
 *
 * Se notifica CUALQUIER etapa listada en `NOTIFY_STAGES` (logistics.ts) que
 * llegue vía `emitTransition` o un PATCH de status — el ciclo típico outbound:
 *   pending/picking/packed/ready → dispatched ("asignado a reparto")
 *   → in_transit ("en camino", al pulsar Iniciar ruta el conductor)
 *   → out_for_delivery ("sale hoy hacia ti", cuando su parada arranca)
 *   → delivered (adjunta firma + foto si existen)
 *   más los excepcionales: postponed / exception / returned / cancelled.
 *
 * El email de destino se resuelve desde el partner de la Sales Delivery Note
 * o Purchase Delivery Note vinculada al envío.
 */

import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { enqueueMail } from '../email/MailQueue';

type Stage =
  | 'pending'
  | 'picking'
  | 'packed'
  | 'ready'
  | 'dispatched'
  | 'in_transit'
  | 'out_for_delivery'
  | 'postponed'
  | 'delivered'
  | 'exception'
  | 'returned'
  | 'cancelled';

/**
 * Template base del email. Tablas + estilos inline porque muchos clientes
 * de correo (Outlook, Gmail web, apps móviles) no soportan flexbox/grid
 * y recortan clases CSS.
 */
function renderShell(opts: {
  code: string;
  trackUrl: string;
  accent: string;
  emoji: string;
  hero: string;
  sub: string;
  body: string;
  ctaLabel?: string;
}): string {
  const {
    code,
    trackUrl,
    accent,
    emoji,
    hero,
    sub,
    body,
    ctaLabel = 'Ver seguimiento en vivo',
  } = opts;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
<title>${escapeHtml(hero)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08)">
        <!-- Accent bar -->
        <tr><td style="background:${accent};height:6px;line-height:6px;font-size:6px">&nbsp;</td></tr>

        <!-- Hero -->
        <tr><td style="padding:28px 28px 12px">
          <div style="font-size:44px;line-height:1;margin-bottom:8px">${emoji}</div>
          <div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${accent};margin-bottom:4px">Pedido ${escapeHtml(code)}</div>
          <h1 style="font-size:24px;font-weight:800;letter-spacing:-0.01em;margin:0 0 6px;color:#0f172a;line-height:1.2">${hero}</h1>
          <p style="font-size:14px;color:#64748b;margin:0;line-height:1.5">${sub}</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:4px 28px 20px;font-size:14px;line-height:1.55;color:#334155">${body}</td></tr>

        <!-- CTA -->
        <tr><td align="center" style="padding:8px 28px 28px">
          <a href="${trackUrl}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;letter-spacing:.01em">${ctaLabel} →</a>
          <p style="font-size:11px;color:#94a3b8;margin:10px 0 0">O copia este enlace:<br/><a href="${trackUrl}" style="color:#94a3b8;text-decoration:underline;word-break:break-all">${trackUrl}</a></p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;line-height:1.5">
          Este email es automático. Si tienes alguna duda responde a este mensaje y te contestaremos lo antes posible.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const COPY: Record<
  Stage,
  {
    subject: (code: string) => string;
    body: (opts: {
      code: string;
      trackUrl: string;
      address: string | null;
      photoCid?: string;
      signatureCid?: string;
      recipientName?: string | null;
      podNotes?: string | null;
    }) => string;
  }
> = {
  pending: {
    subject: (c) => `📦 Tu pedido ${c} está en preparación`,
    body: ({ code, trackUrl }) =>
      renderShell({
        code,
        trackUrl,
        accent: '#0D9488',
        emoji: '📦',
        hero: '¡Tenemos tu pedido!',
        sub: 'Ya está en nuestro almacén y vamos a prepararlo para ti.',
        body: `<p style="margin:0 0 12px">En breve nuestro equipo empezará a picarlo. Te mandaremos un correo con cada paso — cuando esté empaquetado, cuando salga, y cuando se entregue.</p>`,
      }),
  },
  picking: {
    subject: (c) => `🏷️ ${c} · Preparándose en almacén`,
    body: ({ code, trackUrl }) =>
      renderShell({
        code,
        trackUrl,
        accent: '#f59e0b',
        emoji: '🏷️',
        hero: 'Tu pedido se está preparando',
        sub: 'Nuestro equipo lo está picando ahora mismo.',
        body: `<p style="margin:0 0 12px">Estamos cogiendo cada uno de tus artículos del almacén y comprobando lotes y cantidades. Cuando todo esté listo, te avisamos.</p>`,
      }),
  },
  packed: {
    subject: (c) => `📮 ${c} · Empaquetado y listo`,
    body: ({ code, trackUrl }) =>
      renderShell({
        code,
        trackUrl,
        accent: '#3b82f6',
        emoji: '📮',
        hero: 'Empaquetado con cariño',
        sub: 'Tu pedido ya está preparado esperando a salir.',
        body: `<p style="margin:0 0 12px">Lo tendremos en ruta en cuanto salga el siguiente reparto. Te escribiremos de nuevo cuando el conductor salga hacia ti.</p>`,
      }),
  },
  ready: {
    subject: (c) => `🚦 ${c} · Listo para salir`,
    body: ({ code, trackUrl }) =>
      renderShell({
        code,
        trackUrl,
        accent: '#3b82f6',
        emoji: '🚦',
        hero: 'Listo para salir',
        sub: 'Tu pedido saldrá en cuanto el conductor lo recoja del almacén.',
        body: `<p style="margin:0 0 12px">Ya puedes seguir el viaje en directo desde el enlace de abajo.</p>`,
      }),
  },
  dispatched: {
    subject: (c) => `🚛 ${c} · Despachado`,
    body: ({ code, trackUrl }) =>
      renderShell({
        code,
        trackUrl,
        accent: '#6366f1',
        emoji: '🚛',
        hero: 'Tu pedido está listo para salir',
        sub: 'Ya está asignado a una ruta de reparto — saldrá hacia ti muy pronto.',
        body: `<p style="margin:0 0 12px">Te avisaremos en cuanto salga. Desde el enlace puedes seguir cada paso de tu envío.</p>`,
        ctaLabel: 'Seguir mi pedido',
      }),
  },
  in_transit: {
    subject: (c) => `🗺️ ${c} · En camino`,
    body: ({ code, trackUrl }) =>
      renderShell({
        code,
        trackUrl,
        accent: '#6366f1',
        emoji: '🗺️',
        hero: 'En camino hacia ti',
        sub: 'Tu pedido está circulando. Puedes ver su posición en el mapa.',
        body: `<p style="margin:0 0 12px">Te avisaremos cuando el conductor salga para tu dirección específica, así tendrás tiempo de estar en casa.</p>`,
        ctaLabel: 'Ver mapa en vivo',
      }),
  },
  out_for_delivery: {
    subject: (c) => `🛵 ${c} · Sale hoy hacia ti`,
    body: ({ code, trackUrl, address }) =>
      renderShell({
        code,
        trackUrl,
        accent: '#8b5cf6',
        emoji: '🛵',
        hero: '¡Sale hoy hacia ti!',
        sub: 'El conductor ha empezado su ruta con tu pedido.',
        body: `
          <p style="margin:0 0 12px">Tu pedido sale hoy en reparto.${address ? ` Lo entregaremos en:` : ''}</p>
          ${
            address
              ? `<div style="background:#faf5ff;border-left:3px solid #8b5cf6;padding:10px 14px;border-radius:6px;margin:12px 0">
                   <div style="font-size:11px;color:#7c3aed;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Dirección de entrega</div>
                   <div style="font-size:14px;color:#0f172a;font-weight:600">${escapeHtml(address)}</div>
                 </div>`
              : ''
          }
          <p style="margin:0 0 12px">Asegúrate de que haya alguien para recibir el paquete. Si no, lo intentaremos más tarde.</p>
        `,
        ctaLabel: 'Ver posición del repartidor',
      }),
  },
  postponed: {
    // Texto neutro: se usa tanto cuando el conductor no pudo entregar como
    // cuando la ruta se finalizó con paradas pendientes — no siempre hubo
    // un intento en la puerta.
    subject: (c) => `⏸ ${c} · Entrega aplazada`,
    body: ({ code, trackUrl, address }) =>
      renderShell({
        code,
        trackUrl,
        accent: '#f59e0b',
        emoji: '⏸',
        hero: 'Tu entrega se ha aplazado',
        sub: 'No hemos podido completarla en esta ruta.',
        body: `
          <p style="margin:0 0 12px">No hemos podido entregar tu pedido <b>${escapeHtml(code)}</b>${address ? ` en <b>${escapeHtml(address)}</b>` : ''} en el reparto de hoy.</p>
          <p style="margin:0 0 12px">Lo reintentaremos pronto. Si prefieres coordinar un horario concreto, responde a este correo y lo organizamos.</p>
        `,
      }),
  },
  delivered: {
    subject: (c) => `✅ ${c} · Entregado`,
    body: ({ code, trackUrl, recipientName, podNotes, photoCid, signatureCid }) =>
      renderShell({
        code,
        trackUrl,
        accent: '#10b981',
        emoji: '✅',
        hero: '¡Entregado!',
        sub: recipientName
          ? `Firmado por ${escapeHtml(recipientName)}.`
          : 'Tu pedido ha llegado correctamente.',
        body: `
          ${
            signatureCid
              ? `<div style="margin:16px 0">
                   <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Firma del receptor</div>
                   <img src="cid:${signatureCid}" alt="Firma" style="max-width:100%;width:380px;border:1px solid #e2e8f0;border-radius:10px;padding:6px;background:#fff;display:block"/>
                 </div>`
              : ''
          }
          ${
            photoCid
              ? `<div style="margin:16px 0">
                   <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Foto de la entrega</div>
                   <img src="cid:${photoCid}" alt="Foto" style="max-width:100%;width:380px;border-radius:10px;display:block"/>
                 </div>`
              : ''
          }
          ${
            podNotes
              ? `<div style="background:#f8fafc;padding:10px 14px;border-radius:6px;margin:12px 0;font-size:13px;color:#64748b"><b>Observaciones:</b> ${escapeHtml(podNotes)}</div>`
              : ''
          }
          <p style="margin:12px 0 0">¡Gracias por confiar en nosotros! Si todo ha ido bien, nos encantaría que nos lo hicieras saber.</p>
        `,
        ctaLabel: 'Ver prueba de entrega',
      }),
  },
  exception: {
    subject: (c) => `⚠️ ${c} · Incidencia en la entrega`,
    body: ({ code, trackUrl }) =>
      renderShell({
        code,
        trackUrl,
        accent: '#ef4444',
        emoji: '⚠️',
        hero: 'Ha ocurrido una incidencia',
        sub: `Algo no ha ido como esperábamos con tu pedido ${escapeHtml(code)}.`,
        body: `<p style="margin:0 0 12px">Nuestro equipo te contactará en breve para resolverlo. Mientras tanto puedes consultar el historial del pedido y los detalles de la incidencia en el enlace de abajo.</p>`,
      }),
  },
  returned: {
    subject: (c) => `↩️ ${c} · Devuelto`,
    body: ({ code, trackUrl }) =>
      renderShell({
        code,
        trackUrl,
        accent: '#ef4444',
        emoji: '↩️',
        hero: 'Tu pedido ha sido devuelto',
        sub: `El pedido ${escapeHtml(code)} ha vuelto a nuestro almacén.`,
        body: `<p style="margin:0 0 12px">Si esto no era lo que esperabas, respóndenos y lo organizamos. Puedes ver el historial completo en el seguimiento.</p>`,
      }),
  },
  cancelled: {
    subject: (c) => `🚫 ${c} · Pedido cancelado`,
    body: ({ code, trackUrl }) =>
      renderShell({
        code,
        trackUrl,
        accent: '#64748b',
        emoji: '🚫',
        hero: 'Pedido cancelado',
        sub: `El pedido ${escapeHtml(code)} ha sido cancelado.`,
        body: `<p style="margin:0 0 12px">Si necesitas más información sobre la cancelación, respóndenos a este correo y te la facilitamos.</p>`,
      }),
  },
};

/**
 * Variantes para RECOGIDAS (`shipment.kind === 'pickup_return'`): el sentido
 * se invierte — no le llevamos un pedido al cliente, vamos a su dirección a
 * RECOGER un paquete (típicamente por una incidencia o devolución). Solo se
 * sobreescriben las etapas que una recogida atraviesa de verdad; el resto cae
 * al copy genérico.
 */
const PICKUP_COPY: Partial<typeof COPY> = {
  pending: {
    subject: (c) => `📦 Recogida ${c} programada`,
    body: ({ code, trackUrl }) =>
      renderShell({
        code,
        trackUrl,
        accent: '#8b5cf6',
        emoji: '📦',
        hero: 'Vamos a recoger tu paquete',
        sub: 'Hemos programado una recogida en tu dirección.',
        body: `<p style="margin:0 0 12px">Pasaremos a recoger el paquete. Te avisaremos cuando el repartidor salga hacia ti y el día que pase por tu dirección — no hace falta que hagas nada más, solo tenerlo a mano.</p>`,
      }),
  },
  dispatched: {
    subject: (c) => `🚛 Recogida ${c} · Asignada a ruta`,
    body: ({ code, trackUrl }) =>
      renderShell({
        code,
        trackUrl,
        accent: '#6366f1',
        emoji: '🚛',
        hero: 'Tu recogida ya está planificada',
        sub: 'La hemos asignado a una ruta — pasaremos pronto a por el paquete.',
        body: `<p style="margin:0 0 12px">Te avisaremos cuando el repartidor salga hacia tu dirección. Desde el enlace puedes seguir el estado de la recogida.</p>`,
        ctaLabel: 'Seguir mi recogida',
      }),
  },
  in_transit: {
    subject: (c) => `🗺️ Recogida ${c} · El repartidor está en ruta`,
    body: ({ code, trackUrl }) =>
      renderShell({
        code,
        trackUrl,
        accent: '#6366f1',
        emoji: '🗺️',
        hero: 'Vamos de camino a por tu paquete',
        sub: 'El repartidor ha salido de ruta.',
        body: `<p style="margin:0 0 12px">Puedes seguir su posición en tiempo real. Ten el paquete preparado para cuando llegue.</p>`,
        ctaLabel: 'Ver mapa en vivo',
      }),
  },
  out_for_delivery: {
    subject: (c) => `🛵 Recogida ${c} · ¡Hoy pasamos a por él!`,
    body: ({ code, trackUrl, address }) =>
      renderShell({
        code,
        trackUrl,
        accent: '#8b5cf6',
        emoji: '🛵',
        hero: '¡Hoy recogemos tu paquete!',
        sub: 'El repartidor pasará hoy por tu dirección.',
        body: `
          <p style="margin:0 0 12px">Hoy pasamos${address ? ` por <b>${escapeHtml(address)}</b>` : ' por tu dirección'} a recoger el paquete de la recogida <b>${escapeHtml(code)}</b>.</p>
          <p style="margin:0 0 12px">Por favor, ten el paquete preparado y asegúrate de que haya alguien para entregárselo al repartidor.</p>
        `,
      }),
  },
  postponed: {
    subject: (c) => `⏸ Recogida ${c} · Aplazada`,
    body: ({ code, trackUrl, address }) =>
      renderShell({
        code,
        trackUrl,
        accent: '#f59e0b',
        emoji: '⏸',
        hero: 'Tu recogida se ha aplazado',
        sub: 'No hemos podido recoger el paquete en esta ruta.',
        body: `
          <p style="margin:0 0 12px">No hemos podido recoger tu paquete <b>${escapeHtml(code)}</b>${address ? ` en <b>${escapeHtml(address)}</b>` : ''} en el reparto de hoy.</p>
          <p style="margin:0 0 12px">Lo reintentaremos pronto. Si prefieres coordinar un horario concreto, responde a este correo y lo organizamos.</p>
        `,
      }),
  },
  delivered: {
    subject: (c) => `✅ Recogida ${c} · Paquete recogido`,
    body: ({ code, trackUrl, recipientName, podNotes, photoCid, signatureCid }) =>
      renderShell({
        code,
        trackUrl,
        accent: '#10b981',
        emoji: '✅',
        hero: '¡Paquete recogido!',
        sub: 'Ya lo tenemos — gracias por tenerlo preparado.',
        body: `
          <p style="margin:0 0 12px">Hemos recogido tu paquete <b>${escapeHtml(code)}</b>${recipientName ? `, entregado por <b>${escapeHtml(recipientName)}</b>` : ''}. Nuestro equipo lo revisará en cuanto llegue al almacén y te contactaremos con la resolución.</p>
          ${podNotes ? `<p style="margin:0 0 12px;color:#64748b;font-size:13px">Notas del repartidor: ${escapeHtml(podNotes)}</p>` : ''}
          ${signatureCid ? `<p style="margin:0 0 6px;font-size:12px;color:#64748b">Firma:</p><img src="cid:${signatureCid}" alt="Firma" style="max-width:220px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:12px"/>` : ''}
          ${photoCid ? `<p style="margin:0 0 6px;font-size:12px;color:#64748b">Comprobante de la recogida:</p><img src="cid:${photoCid}" alt="Foto" style="max-width:100%;border:1px solid #e2e8f0;border-radius:8px"/>` : ''}
        `,
      }),
  },
  cancelled: {
    subject: (c) => `🚫 Recogida ${c} · Cancelada`,
    body: ({ code, trackUrl }) =>
      renderShell({
        code,
        trackUrl,
        accent: '#64748b',
        emoji: '🚫',
        hero: 'Recogida cancelada',
        sub: `La recogida ${escapeHtml(code)} ha sido cancelada.`,
        body: `<p style="margin:0 0 12px">Si necesitas más información, respóndenos a este correo y te la facilitamos.</p>`,
      }),
  },
};

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      (
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }) as Record<
          string,
          string
        >
      )[c] as string,
  );
}

/**
 * Email del destinatario. Prioridad:
 *   1. `shipment.recipientEmail` (modo standalone — rellenado al alta).
 *   2. Partner de la SDN/PDN vinculada.
 */
async function resolveRecipientEmail(client: any, shipment: any): Promise<string | null> {
  // 1) Campo directo del shipment.
  if (shipment.recipientEmail?.trim()) return shipment.recipientEmail.trim();

  if (!shipment.deliveryNoteId) {
    console.log(
      `[shipmentNotifications] shipment ${shipment.id} sin deliveryNoteId — no se puede resolver destinatario`,
    );
    return null;
  }
  const docType = shipment.sourceDocType;
  const table = docType === 'PDN' ? schema.purchaseDeliveryNotes : schema.salesDeliveryNotes;
  const [dn] = await client
    .select({ partnerId: table.partnerId })
    .from(table)
    .where(eq(table.id, shipment.deliveryNoteId));
  if (!dn?.partnerId) {
    console.log(
      `[shipmentNotifications] deliveryNote ${shipment.deliveryNoteId} (${docType || 'SDN'}) no encontrada o sin partnerId`,
    );
    return null;
  }
  const [p] = await client
    .select({ email: schema.businessPartners.email, name: schema.businessPartners.name })
    .from(schema.businessPartners)
    .where(eq(schema.businessPartners.id, dn.partnerId));
  if (!p) return null;
  if (!p.email) {
    console.log(
      `[shipmentNotifications] partner "${p.name}" (${dn.partnerId}) sin email — rellénalo en Interlocutores`,
    );
    return null;
  }
  return p.email;
}

/**
 * Resuelve la prueba de entrega (PoD) del envío: busca en `routeStops`
 * alguna parada ENTREGADA con este `shipmentId` y extrae firma/foto.
 */
async function resolveDeliveryProof(
  client: any,
  shipmentId: string,
): Promise<{
  recipientName: string | null;
  recipientDocument: string | null;
  signatureImage: string | null;
  photoImage: string | null;
  podNotes: string | null;
} | null> {
  try {
    const [stop] = await client
      .select({
        recipientName: schema.routeStops.recipientName,
        recipientDocument: schema.routeStops.recipientDocument,
        signatureImage: schema.routeStops.signatureImage,
        photoImage: schema.routeStops.photoImage,
        podNotes: schema.routeStops.podNotes,
      })
      .from(schema.routeStops)
      .where(
        and(
          eq(schema.routeStops.shipmentId, shipmentId),
          eq(schema.routeStops.status, 'delivered'),
        ),
      )
      .limit(1);
    if (!stop) return null;
    return stop as any;
  } catch {
    return null;
  }
}

/** data URL → { mimeType, content: Buffer }. Útil para convertir firma/foto
 *  en adjuntos `nodemailer` inline. Si no es data URL válido, devuelve null. */
function dataUrlToAttachment(dataUrl: string): { mimeType: string; content: Buffer } | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  try {
    return { mimeType: m[1], content: Buffer.from(m[2], 'base64') };
  } catch {
    return null;
  }
}

export async function notifyShipmentStageChange(
  tenantClient: any,
  tenantId: string,
  shipmentId: string,
  stage: Stage,
  publicBaseUrl: string,
): Promise<void> {
  try {
    console.log(
      `[shipmentNotifications] → invocado para shipment=${shipmentId} stage=${stage} tenant=${tenantId}`,
    );
    const [ship] = await tenantClient
      .select()
      .from(schema.shipments)
      .where(eq(schema.shipments.id, shipmentId));
    if (!ship) {
      console.log(`[shipmentNotifications] shipment ${shipmentId} no encontrado`);
      return;
    }

    const to = await resolveRecipientEmail(tenantClient, ship);
    if (!to) return;

    const code = ship.trackingNumber || ship.id.slice(0, 8);
    const trackUrl = `${publicBaseUrl.replace(/\/$/, '')}/track/${ship.reportToken}`;
    // Recogidas: copy invertido ("vamos a por tu paquete") si existe variante.
    const copy = (ship.kind === 'pickup_return' && PICKUP_COPY[stage]) || COPY[stage];

    // Sólo en `delivered` intentamos adjuntar firma+foto.
    const attachments: Array<{
      filename: string;
      content: Buffer;
      contentType?: string;
      cid?: string;
    }> = [];
    let photoCid: string | undefined;
    let signatureCid: string | undefined;
    let recipientName: string | null = null;
    let podNotes: string | null = null;

    if (stage === 'delivered') {
      const pod = await resolveDeliveryProof(tenantClient, shipmentId);
      if (pod) {
        // El nombre que firma (receptor) puede venir del PoD o del shipment.
        recipientName = pod.recipientName || ship.recipientName || null;
        podNotes = pod.podNotes;

        if (pod.signatureImage) {
          const att = dataUrlToAttachment(pod.signatureImage);
          if (att) {
            signatureCid = 'pod-signature';
            attachments.push({
              filename: 'firma.png',
              content: att.content,
              contentType: att.mimeType,
              cid: signatureCid,
            });
          }
        }
        if (pod.photoImage) {
          const att = dataUrlToAttachment(pod.photoImage);
          if (att) {
            photoCid = 'pod-photo';
            const ext = att.mimeType.includes('jpeg') ? 'jpg' : 'png';
            attachments.push({
              filename: `entrega.${ext}`,
              content: att.content,
              contentType: att.mimeType,
              cid: photoCid,
            });
          }
        }
      }
    }

    const html = copy.body({
      code,
      trackUrl,
      address: ship.destinationAddress,
      photoCid,
      signatureCid,
      recipientName,
      podNotes,
    });

    const mailId = enqueueMail(tenantId, {
      to,
      subject: copy.subject(code),
      html,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    console.log(
      `[shipmentNotifications] ✉  enfilado ${mailId} → ${to} · ${code} · stage=${stage}${attachments.length ? ` (+${attachments.length} adjuntos)` : ''}`,
    );
  } catch (e: any) {
    console.warn('[shipmentNotifications] no se pudo encolar el email:', e?.message);
  }
}

export type ShipmentStage = Stage;
