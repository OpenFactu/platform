/**
 * Servicio de notificaciones in-app por tenant.
 *
 * Una notificación == una fila por destinatario. Si un evento afecta a varios
 * usuarios, insertamos N filas con el mismo contenido y `readAt` independiente
 * para cada uno.
 *
 * El resto del ERP llama a `notify()` / `notifyUsers()` desde los puntos
 * donde pasan cosas (factura confirmada, error en envío de correo, etc.).
 * El UI consume `list()` y `unreadCount()`.
 */

import crypto from 'crypto';
import { and, eq, desc, isNull, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';

export type NotificationLevel = 'info' | 'warn' | 'error' | 'success';

export interface NotifyInput {
  userId: string;
  title: string;
  body?: string;
  level?: NotificationLevel;
  link?: string;
}

export interface NotificationRow {
  id: string;
  userId: string;
  title: string;
  body: string | null;
  level: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export class NotificationService {
  static async notify(tenantDb: any, input: NotifyInput): Promise<string> {
    const id = crypto.randomUUID();
    await tenantDb.insert(schema.notifications).values({
      id,
      userId: input.userId,
      title: input.title,
      body: input.body || null,
      level: input.level || 'info',
      link: input.link || null,
    });
    return id;
  }

  static async notifyUsers(
    tenantDb: any,
    userIds: string[],
    partial: Omit<NotifyInput, 'userId'>,
  ): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = userIds.map((userId) => ({
      id: crypto.randomUUID(),
      userId,
      title: partial.title,
      body: partial.body || null,
      level: partial.level || 'info',
      link: partial.link || null,
    }));
    await tenantDb.insert(schema.notifications).values(rows);
    return rows.map((r) => r.id);
  }

  static async list(
    tenantDb: any,
    userId: string,
    opts: { unreadOnly?: boolean; limit?: number } = {},
  ): Promise<NotificationRow[]> {
    const limit = Math.min(opts.limit ?? 50, 200);
    const where = opts.unreadOnly
      ? and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt))
      : eq(schema.notifications.userId, userId);
    return await tenantDb
      .select()
      .from(schema.notifications)
      .where(where)
      .orderBy(desc(schema.notifications.createdAt))
      .limit(limit);
  }

  static async unreadCount(tenantDb: any, userId: string): Promise<number> {
    const rows: any = await tenantDb.execute(
      sql.raw(
        `SELECT COUNT(*)::int AS n FROM "Notification" WHERE "userId" = '${userId.replace(/'/g, "''")}' AND "readAt" IS NULL`,
      ),
    );
    return Number(rows?.rows?.[0]?.n || 0);
  }

  static async markRead(tenantDb: any, userId: string, id: string): Promise<void> {
    await tenantDb
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, userId)));
  }

  static async markAllRead(tenantDb: any, userId: string): Promise<void> {
    await tenantDb
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
  }

  static async remove(tenantDb: any, userId: string, id: string): Promise<void> {
    await tenantDb
      .delete(schema.notifications)
      .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, userId)));
  }
}
