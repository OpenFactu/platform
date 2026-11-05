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
import type { Locale } from '../../i18n';
import { localeForCountry } from '../email/recipientLocale';
import { getCompanyConfig } from '../config/companyConfig';
import { enqueueMail } from '../email/MailQueue';
import { ClientFactory } from '../tenant/ClientFactory';
import { renderShipmentEmail, type ShipmentEmailStage } from './shipmentEmails';

type Stage = ShipmentEmailStage;

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

/** El país del interlocutor del albarán, si el envío viene de uno. */
async function partnerCountry(client: any, shipment: any): Promise<string | null> {
  if (!shipment.deliveryNoteId) return null;
  const table =
    shipment.sourceDocType === 'PDN' ? schema.purchaseDeliveryNotes : schema.salesDeliveryNotes;
  const [row] = await client
    .select({ countryCode: schema.businessPartners.countryCode })
    .from(table)
    .innerJoin(schema.businessPartners, eq(table.partnerId, schema.businessPartners.id))
    .where(eq(table.id, shipment.deliveryNoteId));
  return row?.countryCode || null;
}

/**
 * El idioma del correo: el del país del cliente y, si no consta, el de la empresa.
 */
export async function recipientLocale(client: any, shipment: any): Promise<Locale> {
  return localeForCountry(
    (await partnerCountry(client, shipment)) || (await getCompanyConfig(client)).country,
  );
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
    if (!publicBaseUrl) {
      console.warn('[shipmentNotifications] sin URL pública: un correo sin enlace no sirve');
      return;
    }

    const code = ship.code || ship.trackingNumber || ship.id.slice(0, 8);
    const trackUrl = `${publicBaseUrl.replace(/\/$/, '')}/track/${ship.reportToken}`;
    const locale = await recipientLocale(tenantClient, ship);

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

    const { subject, html } = renderShipmentEmail(stage, ship.kind, locale, {
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
      subject,
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
