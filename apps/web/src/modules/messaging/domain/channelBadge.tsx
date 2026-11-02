/**
 * Sello del canal (Telegram…) en el avatar de las conversaciones con clientes,
 * para distinguirlas de un vistazo en la lista y en la cabecera. Lo pinta el
 * `Avatar` del kit a través de `renderConversationBadge` (ver `MessagingHost`).
 * El color es el de la marca del canal, no un token del tema.
 */

interface Seal {
  color: string;
  /** Glifo en blanco, en una caja de 24×24. */
  path: string;
}

const SEALS: Record<string, Seal> = {
  telegram: {
    color: '#229ED9',
    path: 'M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z',
  },
};

/** Sello de "hay una llamada en curso" en esta conversación. */
export function callBadge(label: string) {
  return {
    label,
    badge: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="12" fill="#16a34a" />
        <path
          d="M4 8a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM16.5 10.5 20 8v8l-3.5-2.5z"
          fill="#ffffff"
          transform="translate(12 12) scale(0.72) translate(-12 -12)"
        />
      </svg>
    ),
  };
}

/** El sello del canal, o `null` si ese canal no tiene. */
export function channelBadge(channel: string, label: string) {
  const seal = SEALS[channel];
  if (!seal) return null;
  return {
    label,
    badge: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="12" fill={seal.color} />
        <path
          d={seal.path}
          fill="#ffffff"
          transform="translate(12 12) scale(0.72) translate(-12.3 -11.6)"
        />
      </svg>
    ),
  };
}
