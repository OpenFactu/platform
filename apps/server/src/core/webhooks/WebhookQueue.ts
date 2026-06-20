/**
 * Cola de webhooks salientes por tenant.
 *
 * Se llama a `dispatchEvent(tenantId, eventName, payload)` desde cualquier
 * parte del core cuando ocurre algo relevante (p. ej. `shipment.delivered`).
 * La cola busca las suscripciones activas del tenant que incluyan ese
 * `eventName` y encola un POST por cada una. Reintentos exponenciales como
 * MailQueue — para que un endpoint caído no bloquee al core.
 *
 * El payload se firma con HMAC-SHA256 usando el `secret` de la suscripción
 * (si está definido) y se envía en el header `X-Keirost-Signature`.
 */

import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { ClientFactory } from '../tenant/ClientFactory';

interface QueueItem {
  id: string;
  tenantId: string;
  subscriptionId: string;
  url: string;
  event: string;
  payload: any;
  secret: string | null;
  attempts: number;
  nextAttemptAt: number;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  lastError?: string;
  createdAt: number;
  sentAt?: number;
}

const MAX_ATTEMPTS = 5;
const BACKOFF_S = [2, 8, 32, 128, 512];

class Queue {
  private items: QueueItem[] = [];
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch(() => {}), 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  enqueue(
    tenantId: string,
    subscriptionId: string,
    url: string,
    event: string,
    payload: any,
    secret: string | null,
  ): string {
    const id = crypto.randomUUID();
    this.items.push({
      id,
      tenantId,
      subscriptionId,
      url,
      event,
      payload,
      secret,
      attempts: 0,
      nextAttemptAt: Date.now(),
      status: 'queued',
      createdAt: Date.now(),
    });
    return id;
  }

  private async tick() {
    if (this.processing) return;
    this.processing = true;
    try {
      const now = Date.now();
      const next = this.items.find((i) => i.status === 'queued' && i.nextAttemptAt <= now);
      if (!next) return;
      next.status = 'sending';
      next.attempts += 1;
      try {
        const body = JSON.stringify({
          event: next.event,
          data: next.payload,
          deliveredAt: new Date().toISOString(),
        });
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Keirost-Event': next.event,
          'X-Keirost-Delivery': next.id,
        };
        if (next.secret) {
          headers['X-Keirost-Signature'] = crypto
            .createHmac('sha256', next.secret)
            .update(body)
            .digest('hex');
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        try {
          const res = await fetch(next.url, {
            method: 'POST',
            headers,
            body,
            signal: controller.signal,
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
        } finally {
          clearTimeout(timer);
        }
        next.status = 'sent';
        next.sentAt = Date.now();
        // Purga las entregas antiguas.
        const cutoff = Date.now() - 60 * 60 * 1000;
        this.items = this.items.filter((i) => !(i.status === 'sent' && (i.sentAt || 0) < cutoff));
      } catch (e: any) {
        next.lastError = e?.message || String(e);
        if (next.attempts >= MAX_ATTEMPTS) {
          next.status = 'failed';
          console.error(
            `[WebhookQueue] ${next.id} falló tras ${MAX_ATTEMPTS} intentos: ${next.lastError}`,
          );
        } else {
          const backoffMs = BACKOFF_S[next.attempts - 1] * 1000;
          next.status = 'queued';
          next.nextAttemptAt = Date.now() + backoffMs;
          console.warn(
            `[WebhookQueue] ${next.id} intento ${next.attempts} falló: ${next.lastError}. Retry en ${backoffMs / 1000}s`,
          );
        }
      }
    } finally {
      this.processing = false;
    }
  }

  list() {
    return this.items.map((i) => ({
      id: i.id,
      subscriptionId: i.subscriptionId,
      event: i.event,
      status: i.status,
      attempts: i.attempts,
      lastError: i.lastError,
      createdAt: i.createdAt,
    }));
  }
}

export const webhookQueue = new Queue();
webhookQueue.start();

/**
 * API pública: dispara un evento. Busca las subscripciones activas del
 * tenant que escuchan ese evento y encola un POST por cada una.
 */
export async function dispatchEvent(tenantId: string, event: string, payload: any): Promise<void> {
  try {
    const tenantDb = await ClientFactory.getTenantClient(tenantId);
    const subs = await tenantDb
      .select()
      .from(schema.webhookSubscriptions)
      .where(eq(schema.webhookSubscriptions.isActive, true));

    for (const s of subs) {
      const events: string[] = Array.isArray(s.events) ? s.events : [];
      if (events.length > 0 && !events.includes(event)) continue;
      webhookQueue.enqueue(tenantId, s.id, s.url, event, payload, s.secret || null);
    }
  } catch (e: any) {
    console.warn('[WebhookQueue] dispatchEvent falló:', e?.message);
  }
}
