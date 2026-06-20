/**
 * Cola de envío de correo desatendida.
 *
 * Los callers enfilan con `enqueue(...)` y obtienen inmediatamente un `id`,
 * SIN esperar al SMTP. Un worker en background procesa la cola y reintenta
 * en caso de fallo con backoff exponencial (2s, 8s, 32s, 128s, 512s → tope 5
 * intentos).
 *
 * Limitaciones conocidas (v1):
 *   - La cola vive en memoria: si el servidor se reinicia los mensajes
 *     pendientes se pierden. Es aceptable para notificaciones tipo "factura
 *     enviada" donde el user reintenta desde el UI si falla. Si en el futuro
 *     queremos durabilidad, añadir una tabla `MailOutbox` por tenant y
 *     persistir allí.
 *   - Un solo worker global — si hay muchos tenants con mucho volumen
 *     convendrá partir en worker-per-tenant.
 */

import crypto from 'crypto';
import { sendMail, type SendMailInput } from './Mailer';
import { ClientFactory } from '../tenant/ClientFactory';
import { NotificationService } from '../notifications/NotificationService';

export type MailStatus = 'queued' | 'sending' | 'sent' | 'failed';

interface QueueItem {
  id: string;
  tenantId: string;
  input: SendMailInput;
  attempts: number;
  nextAttemptAt: number; // epoch ms
  status: MailStatus;
  lastError?: string;
  createdAt: number;
  sentAt?: number;
  /** Usuario al que notificar cuando termine el envío (éxito o fallo). */
  notifyUserId?: string;
  /** Etiqueta humana para la notificación, ej. "Factura FA-2026-0042". */
  notifyLabel?: string;
  /** Link al documento, ej. "/sales/invoices/xyz". */
  notifyLink?: string;
}

const MAX_ATTEMPTS = 5;
// Backoff en segundos: 2, 8, 32, 128, 512.
const BACKOFF_S = [2, 8, 32, 128, 512];

class Queue {
  private items: QueueItem[] = [];
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  start() {
    if (this.timer) return;
    // Tick cada 1s — el worker solo procesa items cuyo nextAttemptAt haya pasado.
    this.timer = setInterval(() => this.tick(), 1000);
    // unref para no bloquear el shutdown del proceso.
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  enqueue(
    tenantId: string,
    input: SendMailInput,
    notify?: { userId?: string; label?: string; link?: string },
  ): string {
    const id = crypto.randomUUID();
    this.items.push({
      id,
      tenantId,
      input,
      attempts: 0,
      nextAttemptAt: Date.now(),
      status: 'queued',
      createdAt: Date.now(),
      notifyUserId: notify?.userId,
      notifyLabel: notify?.label,
      notifyLink: notify?.link,
    });
    return id;
  }

  peek(id: string): QueueItem | null {
    return this.items.find((i) => i.id === id) || null;
  }

  /** Snapshot ligero para debug/cockpit. */
  list(): Array<Omit<QueueItem, 'input'> & { to: string | string[] }> {
    return this.items.map((i) => ({
      id: i.id,
      tenantId: i.tenantId,
      attempts: i.attempts,
      nextAttemptAt: i.nextAttemptAt,
      status: i.status,
      lastError: i.lastError,
      createdAt: i.createdAt,
      sentAt: i.sentAt,
      to: i.input.to,
    }));
  }

  private async tick() {
    if (this.processing) return;
    this.processing = true;
    try {
      const now = Date.now();
      // Procesamos ítems ready de uno en uno para no saturar el SMTP.
      const next = this.items.find((i) => i.status === 'queued' && i.nextAttemptAt <= now);
      if (!next) return;
      next.status = 'sending';
      next.attempts += 1;
      try {
        const tenantDb = await ClientFactory.getTenantClient(next.tenantId);
        await sendMail(next.tenantId, tenantDb, next.input);
        next.status = 'sent';
        next.sentAt = Date.now();
        // Notifica al usuario que inició el envío (si procede).
        if (next.notifyUserId) {
          const label = next.notifyLabel || 'email';
          const to = Array.isArray(next.input.to) ? next.input.to.join(', ') : next.input.to;
          try {
            await NotificationService.notify(tenantDb, {
              userId: next.notifyUserId,
              title: `✓ ${label} enviado`,
              body: `Entregado a ${to}`,
              level: 'success',
              link: next.notifyLink,
            });
          } catch (nErr: any) {
            console.warn('[MailQueue] No se pudo crear notificación:', nErr?.message);
          }
        }
        // Limpia los sent viejos (>1h) para no crecer infinito.
        const cutoff = Date.now() - 60 * 60 * 1000;
        this.items = this.items.filter((i) => !(i.status === 'sent' && (i.sentAt || 0) < cutoff));
      } catch (e: any) {
        next.lastError = e?.message || String(e);
        if (next.attempts >= MAX_ATTEMPTS) {
          next.status = 'failed';
          console.error(
            `[MailQueue] ${next.id} falló tras ${MAX_ATTEMPTS} intentos:`,
            next.lastError,
          );
          // Notifica el fallo definitivo.
          if (next.notifyUserId) {
            try {
              const tenantDb = await ClientFactory.getTenantClient(next.tenantId);
              await NotificationService.notify(tenantDb, {
                userId: next.notifyUserId,
                title: `⚠ Envío fallido: ${next.notifyLabel || 'email'}`,
                body: `${next.lastError}. Reintenta desde el documento.`,
                level: 'error',
                link: next.notifyLink,
              });
            } catch {
              /* silencioso */
            }
          }
        } else {
          const backoffMs = BACKOFF_S[next.attempts - 1] * 1000;
          next.status = 'queued';
          next.nextAttemptAt = Date.now() + backoffMs;
          console.warn(
            `[MailQueue] ${next.id} intento ${next.attempts} falló: ${next.lastError}. ` +
              `Retry en ${backoffMs / 1000}s`,
          );
        }
      }
    } finally {
      this.processing = false;
    }
  }
}

export const mailQueue = new Queue();
mailQueue.start();

/**
 * Enfila un correo y devuelve inmediatamente. El caller NO espera al SMTP.
 *
 * Si se pasa `notify.userId`, al terminar el envío el worker inserta una
 * notificación in-app al usuario indicado (éxito o fallo tras reintentos).
 */
export function enqueueMail(
  tenantId: string,
  input: SendMailInput,
  notify?: { userId?: string; label?: string; link?: string },
): string {
  return mailQueue.enqueue(tenantId, input, notify);
}
