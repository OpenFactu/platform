/**
 * Los correos que recibe el cliente en cada etapa de su envío.
 *
 * El texto se escribe en español y sale por `tr`, como el resto del servidor: el
 * inglés está en `i18n/messages/en/shipmentEmails.ts` y un plugin puede añadir otro
 * idioma entero. Las frases van completas, con sus `<b>`, para poder traducirlas.
 *
 * Tablas + estilos inline porque muchos clientes de correo (Outlook, Gmail web, apps
 * móviles) no soportan flexbox/grid y recortan clases CSS.
 */
import { tr, type Locale } from '../../i18n';

export const SHIPMENT_EMAIL_STAGES = [
  'pending',
  'picking',
  'packed',
  'ready',
  'dispatched',
  'in_transit',
  'out_for_delivery',
  'postponed',
  'delivered',
  'exception',
  'returned',
  'cancelled',
] as const;

export type ShipmentEmailStage = (typeof SHIPMENT_EMAIL_STAGES)[number];

export interface ShipmentEmailData {
  code: string;
  trackUrl: string;
  address: string | null;
  photoCid?: string;
  signatureCid?: string;
  recipientName?: string | null;
  podNotes?: string | null;
}

interface Hero {
  accent: string;
  emoji: string;
  hero: string;
  sub: string;
  body: string;
  ctaLabel?: string;
}

interface Copy {
  subject: (t: Translate, code: string) => string;
  content: (t: Translate, data: ShipmentEmailData) => Hero;
}

type Translate = (text: string, vars?: Record<string, string | number>) => string;

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

const paragraph = (text: string) => `<p style="margin:0 0 12px">${text}</p>`;

function renderShell(t: Translate, locale: Locale, data: ShipmentEmailData, hero: Hero): string {
  const { code, trackUrl } = data;
  const { accent, emoji, sub, body } = hero;
  const ctaLabel = hero.ctaLabel ?? t('Ver seguimiento en vivo');
  return `<!doctype html>
<html lang="${escapeHtml(locale)}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
<title>${escapeHtml(hero.hero)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08)">
        <!-- Accent bar -->
        <tr><td style="background:${accent};height:6px;line-height:6px;font-size:6px">&nbsp;</td></tr>

        <!-- Hero -->
        <tr><td style="padding:28px 28px 12px">
          <div style="font-size:44px;line-height:1;margin-bottom:8px">${emoji}</div>
          <div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${accent};margin-bottom:4px">${t('Pedido {code}', { code: escapeHtml(code) })}</div>
          <h1 style="font-size:24px;font-weight:800;letter-spacing:-0.01em;margin:0 0 6px;color:#0f172a;line-height:1.2">${hero.hero}</h1>
          <p style="font-size:14px;color:#64748b;margin:0;line-height:1.5">${sub}</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:4px 28px 20px;font-size:14px;line-height:1.55;color:#334155">${body}</td></tr>

        <!-- CTA -->
        <tr><td align="center" style="padding:8px 28px 28px">
          <a href="${trackUrl}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;letter-spacing:.01em">${ctaLabel} →</a>
          <p style="font-size:11px;color:#94a3b8;margin:10px 0 0">${t('O copia este enlace:')}<br/><a href="${trackUrl}" style="color:#94a3b8;text-decoration:underline;word-break:break-all">${trackUrl}</a></p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;line-height:1.5">
          ${t('Este email es automático. Si tienes alguna duda responde a este mensaje y te contestaremos lo antes posible.')}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const COPY: Record<ShipmentEmailStage, Copy> = {
  pending: {
    subject: (t, code) => `📦 ${t('Tu pedido {code} está en preparación', { code })}`,
    content: (t) => ({
      accent: '#0D9488',
      emoji: '📦',
      hero: t('¡Tenemos tu pedido!'),
      sub: t('Ya está en nuestro almacén y vamos a prepararlo para ti.'),
      body: paragraph(
        t(
          'En breve nuestro equipo empezará a picarlo. Te mandaremos un correo con cada paso — cuando esté empaquetado, cuando salga, y cuando se entregue.',
        ),
      ),
    }),
  },
  picking: {
    subject: (t, code) => `🏷️ ${code} · ${t('Preparándose en almacén')}`,
    content: (t) => ({
      accent: '#f59e0b',
      emoji: '🏷️',
      hero: t('Tu pedido se está preparando'),
      sub: t('Nuestro equipo lo está picando ahora mismo.'),
      body: paragraph(
        t(
          'Estamos cogiendo cada uno de tus artículos del almacén y comprobando lotes y cantidades. Cuando todo esté listo, te avisamos.',
        ),
      ),
    }),
  },
  packed: {
    subject: (t, code) => `📮 ${code} · ${t('Empaquetado y listo')}`,
    content: (t) => ({
      accent: '#3b82f6',
      emoji: '📮',
      hero: t('Empaquetado con cariño'),
      sub: t('Tu pedido ya está preparado esperando a salir.'),
      body: paragraph(
        t(
          'Lo tendremos en ruta en cuanto salga el siguiente reparto. Te escribiremos de nuevo cuando el conductor salga hacia ti.',
        ),
      ),
    }),
  },
  ready: {
    subject: (t, code) => `🚦 ${code} · ${t('Listo para salir')}`,
    content: (t) => ({
      accent: '#3b82f6',
      emoji: '🚦',
      hero: t('Listo para salir'),
      sub: t('Tu pedido saldrá en cuanto el conductor lo recoja del almacén.'),
      body: paragraph(t('Ya puedes seguir el viaje en directo desde el enlace de abajo.')),
    }),
  },
  dispatched: {
    subject: (t, code) => `🚛 ${code} · ${t('Despachado')}`,
    content: (t) => ({
      accent: '#6366f1',
      emoji: '🚛',
      hero: t('Tu pedido está listo para salir'),
      sub: t('Ya está asignado a una ruta de reparto — saldrá hacia ti muy pronto.'),
      body: paragraph(
        t('Te avisaremos en cuanto salga. Desde el enlace puedes seguir cada paso de tu envío.'),
      ),
      ctaLabel: t('Seguir mi pedido'),
    }),
  },
  in_transit: {
    subject: (t, code) => `🗺️ ${code} · ${t('En camino')}`,
    content: (t) => ({
      accent: '#6366f1',
      emoji: '🗺️',
      hero: t('En camino hacia ti'),
      sub: t('Tu pedido está circulando. Puedes ver su posición en el mapa.'),
      body: paragraph(
        t(
          'Te avisaremos cuando el conductor salga para tu dirección específica, así tendrás tiempo de estar en casa.',
        ),
      ),
      ctaLabel: t('Ver mapa en vivo'),
    }),
  },
  out_for_delivery: {
    subject: (t, code) => `🛵 ${code} · ${t('Sale hoy hacia ti')}`,
    content: (t, { address }) => ({
      accent: '#8b5cf6',
      emoji: '🛵',
      hero: t('¡Sale hoy hacia ti!'),
      sub: t('El conductor ha empezado su ruta con tu pedido.'),
      body: `
        ${paragraph(address ? t('Tu pedido sale hoy en reparto. Lo entregaremos en:') : t('Tu pedido sale hoy en reparto.'))}
        ${
          address
            ? `<div style="background:#faf5ff;border-left:3px solid #8b5cf6;padding:10px 14px;border-radius:6px;margin:12px 0">
                 <div style="font-size:11px;color:#7c3aed;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">${t('Dirección de entrega')}</div>
                 <div style="font-size:14px;color:#0f172a;font-weight:600">${escapeHtml(address)}</div>
               </div>`
            : ''
        }
        ${paragraph(t('Asegúrate de que haya alguien para recibir el paquete. Si no, lo intentaremos más tarde.'))}
      `,
      ctaLabel: t('Ver posición del repartidor'),
    }),
  },
  // Texto neutro: se usa tanto cuando el conductor no pudo entregar como cuando la
  // ruta se finalizó con paradas pendientes — no siempre hubo un intento en la puerta.
  postponed: {
    subject: (t, code) => `⏸ ${code} · ${t('Entrega aplazada')}`,
    content: (t, { code, address }) => ({
      accent: '#f59e0b',
      emoji: '⏸',
      hero: t('Tu entrega se ha aplazado'),
      sub: t('No hemos podido completarla en esta ruta.'),
      body: `
        ${paragraph(
          address
            ? t(
                'No hemos podido entregar tu pedido <b>{code}</b> en <b>{address}</b> en el reparto de hoy.',
                {
                  code: escapeHtml(code),
                  address: escapeHtml(address),
                },
              )
            : t('No hemos podido entregar tu pedido <b>{code}</b> en el reparto de hoy.', {
                code: escapeHtml(code),
              }),
        )}
        ${paragraph(t('Lo reintentaremos pronto. Si prefieres coordinar un horario concreto, responde a este correo y lo organizamos.'))}
      `,
    }),
  },
  delivered: {
    subject: (t, code) => `✅ ${code} · ${t('Entregado')}`,
    content: (t, { recipientName, podNotes, photoCid, signatureCid }) => ({
      accent: '#10b981',
      emoji: '✅',
      hero: t('¡Entregado!'),
      sub: recipientName
        ? t('Firmado por {name}.', { name: escapeHtml(recipientName) })
        : t('Tu pedido ha llegado correctamente.'),
      body: `
        ${
          signatureCid
            ? `<div style="margin:16px 0">
                 <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">${t('Firma del receptor')}</div>
                 <img src="cid:${signatureCid}" alt="${t('Firma')}" style="max-width:100%;width:380px;border:1px solid #e2e8f0;border-radius:10px;padding:6px;background:#fff;display:block"/>
               </div>`
            : ''
        }
        ${
          photoCid
            ? `<div style="margin:16px 0">
                 <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">${t('Foto de la entrega')}</div>
                 <img src="cid:${photoCid}" alt="${t('Foto')}" style="max-width:100%;width:380px;border-radius:10px;display:block"/>
               </div>`
            : ''
        }
        ${
          podNotes
            ? `<div style="background:#f8fafc;padding:10px 14px;border-radius:6px;margin:12px 0;font-size:13px;color:#64748b">${t('<b>Observaciones:</b> {notes}', { notes: escapeHtml(podNotes) })}</div>`
            : ''
        }
        <p style="margin:12px 0 0">${t('¡Gracias por confiar en nosotros! Si todo ha ido bien, nos encantaría que nos lo hicieras saber.')}</p>
      `,
      ctaLabel: t('Ver prueba de entrega'),
    }),
  },
  exception: {
    subject: (t, code) => `⚠️ ${code} · ${t('Incidencia en la entrega')}`,
    content: (t, { code }) => ({
      accent: '#ef4444',
      emoji: '⚠️',
      hero: t('Ha ocurrido una incidencia'),
      sub: t('Algo no ha ido como esperábamos con tu pedido {code}.', { code: escapeHtml(code) }),
      body: paragraph(
        t(
          'Nuestro equipo te contactará en breve para resolverlo. Mientras tanto puedes consultar el historial del pedido y los detalles de la incidencia en el enlace de abajo.',
        ),
      ),
    }),
  },
  returned: {
    subject: (t, code) => `↩️ ${code} · ${t('Devuelto')}`,
    content: (t, { code }) => ({
      accent: '#ef4444',
      emoji: '↩️',
      hero: t('Tu pedido ha sido devuelto'),
      sub: t('El pedido {code} ha vuelto a nuestro almacén.', { code: escapeHtml(code) }),
      body: paragraph(
        t(
          'Si esto no era lo que esperabas, respóndenos y lo organizamos. Puedes ver el historial completo en el seguimiento.',
        ),
      ),
    }),
  },
  cancelled: {
    subject: (t, code) => `🚫 ${code} · ${t('Pedido cancelado')}`,
    content: (t, { code }) => ({
      accent: '#64748b',
      emoji: '🚫',
      hero: t('Pedido cancelado'),
      sub: t('El pedido {code} ha sido cancelado.', { code: escapeHtml(code) }),
      body: paragraph(
        t(
          'Si necesitas más información sobre la cancelación, respóndenos a este correo y te la facilitamos.',
        ),
      ),
    }),
  },
};

/**
 * Variantes para RECOGIDAS (`shipment.kind === 'pickup_return'`): el sentido se
 * invierte — no le llevamos un pedido al cliente, vamos a su dirección a RECOGER un
 * paquete. Solo se sobreescriben las etapas que una recogida atraviesa de verdad; el
 * resto cae al texto genérico.
 */
const PICKUP_COPY: Partial<Record<ShipmentEmailStage, Copy>> = {
  pending: {
    subject: (t, code) => `📦 ${t('Recogida {code} programada', { code })}`,
    content: (t) => ({
      accent: '#8b5cf6',
      emoji: '📦',
      hero: t('Vamos a recoger tu paquete'),
      sub: t('Hemos programado una recogida en tu dirección.'),
      body: paragraph(
        t(
          'Pasaremos a recoger el paquete. Te avisaremos cuando el repartidor salga hacia ti y el día que pase por tu dirección — no hace falta que hagas nada más, solo tenerlo a mano.',
        ),
      ),
    }),
  },
  dispatched: {
    subject: (t, code) => `🚛 ${t('Recogida {code} · Asignada a ruta', { code })}`,
    content: (t) => ({
      accent: '#6366f1',
      emoji: '🚛',
      hero: t('Tu recogida ya está planificada'),
      sub: t('La hemos asignado a una ruta — pasaremos pronto a por el paquete.'),
      body: paragraph(
        t(
          'Te avisaremos cuando el repartidor salga hacia tu dirección. Desde el enlace puedes seguir el estado de la recogida.',
        ),
      ),
      ctaLabel: t('Seguir mi recogida'),
    }),
  },
  in_transit: {
    subject: (t, code) => `🗺️ ${t('Recogida {code} · El repartidor está en ruta', { code })}`,
    content: (t) => ({
      accent: '#6366f1',
      emoji: '🗺️',
      hero: t('Vamos de camino a por tu paquete'),
      sub: t('El repartidor ha salido de ruta.'),
      body: paragraph(
        t('Puedes seguir su posición en tiempo real. Ten el paquete preparado para cuando llegue.'),
      ),
      ctaLabel: t('Ver mapa en vivo'),
    }),
  },
  out_for_delivery: {
    subject: (t, code) => `🛵 ${t('Recogida {code} · ¡Hoy pasamos a por él!', { code })}`,
    content: (t, { code, address }) => ({
      accent: '#8b5cf6',
      emoji: '🛵',
      hero: t('¡Hoy recogemos tu paquete!'),
      sub: t('El repartidor pasará hoy por tu dirección.'),
      body: `
        ${paragraph(
          address
            ? t(
                'Hoy pasamos por <b>{address}</b> a recoger el paquete de la recogida <b>{code}</b>.',
                {
                  code: escapeHtml(code),
                  address: escapeHtml(address),
                },
              )
            : t('Hoy pasamos por tu dirección a recoger el paquete de la recogida <b>{code}</b>.', {
                code: escapeHtml(code),
              }),
        )}
        ${paragraph(t('Por favor, ten el paquete preparado y asegúrate de que haya alguien para entregárselo al repartidor.'))}
      `,
    }),
  },
  postponed: {
    subject: (t, code) => `⏸ ${t('Recogida {code} · Aplazada', { code })}`,
    content: (t, { code, address }) => ({
      accent: '#f59e0b',
      emoji: '⏸',
      hero: t('Tu recogida se ha aplazado'),
      sub: t('No hemos podido recoger el paquete en esta ruta.'),
      body: `
        ${paragraph(
          address
            ? t(
                'No hemos podido recoger tu paquete <b>{code}</b> en <b>{address}</b> en el reparto de hoy.',
                {
                  code: escapeHtml(code),
                  address: escapeHtml(address),
                },
              )
            : t('No hemos podido recoger tu paquete <b>{code}</b> en el reparto de hoy.', {
                code: escapeHtml(code),
              }),
        )}
        ${paragraph(t('Lo reintentaremos pronto. Si prefieres coordinar un horario concreto, responde a este correo y lo organizamos.'))}
      `,
    }),
  },
  delivered: {
    subject: (t, code) => `✅ ${t('Recogida {code} · Paquete recogido', { code })}`,
    content: (t, { code, recipientName, podNotes, photoCid, signatureCid }) => ({
      accent: '#10b981',
      emoji: '✅',
      hero: t('¡Paquete recogido!'),
      sub: t('Ya lo tenemos — gracias por tenerlo preparado.'),
      body: `
        ${paragraph(
          `${
            recipientName
              ? t('Hemos recogido tu paquete <b>{code}</b>, entregado por <b>{name}</b>.', {
                  code: escapeHtml(code),
                  name: escapeHtml(recipientName),
                })
              : t('Hemos recogido tu paquete <b>{code}</b>.', { code: escapeHtml(code) })
          } ${t('Nuestro equipo lo revisará en cuanto llegue al almacén y te contactaremos con la resolución.')}`,
        )}
        ${podNotes ? `<p style="margin:0 0 12px;color:#64748b;font-size:13px">${t('Notas del repartidor: {notes}', { notes: escapeHtml(podNotes) })}</p>` : ''}
        ${signatureCid ? `<p style="margin:0 0 6px;font-size:12px;color:#64748b">${t('Firma:')}</p><img src="cid:${signatureCid}" alt="${t('Firma')}" style="max-width:220px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:12px"/>` : ''}
        ${photoCid ? `<p style="margin:0 0 6px;font-size:12px;color:#64748b">${t('Comprobante de la recogida:')}</p><img src="cid:${photoCid}" alt="${t('Foto')}" style="max-width:100%;border:1px solid #e2e8f0;border-radius:8px"/>` : ''}
      `,
    }),
  },
  cancelled: {
    subject: (t, code) => `🚫 ${t('Recogida {code} · Cancelada', { code })}`,
    content: (t, { code }) => ({
      accent: '#64748b',
      emoji: '🚫',
      hero: t('Recogida cancelada'),
      sub: t('La recogida {code} ha sido cancelada.', { code: escapeHtml(code) }),
      body: paragraph(
        t('Si necesitas más información, respóndenos a este correo y te la facilitamos.'),
      ),
    }),
  },
};

export function renderShipmentEmail(
  stage: ShipmentEmailStage,
  kind: string | null | undefined,
  locale: Locale,
  data: ShipmentEmailData,
): { subject: string; html: string } {
  const t: Translate = (text, vars) => tr(locale, text, vars);
  const copy = (kind === 'pickup_return' && PICKUP_COPY[stage]) || COPY[stage];
  return {
    subject: copy.subject(t, data.code),
    html: renderShell(t, locale, data, copy.content(t, data)),
  };
}
