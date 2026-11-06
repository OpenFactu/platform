/**
 * Reportes de la aplicación: lo que el conductor cuenta sobre la propia app (algo que
 * no funciona, una idea). No son incidencias del reparto, que van con su parada.
 * La foto es pesada, así que el listado no la trae.
 */
import crypto from 'crypto';
import { desc, eq, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { notifyAdmins } from '../realtime/notifyAdmins';
import { LogisticsError } from './shipmentLifecycle';

const CATEGORIES = ['bug', 'idea', 'other'];
const MAX_TEXT = 4000;

const parseContext = (raw: string | null) => {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export async function createAppReport(
  db: any,
  tenantId: string,
  user: { id?: string; username?: string } | undefined,
  input: any,
) {
  const message = String(input?.message ?? '')
    .trim()
    .slice(0, MAX_TEXT);
  if (!message) throw new LogisticsError('Cuéntanos qué ha pasado.', 400);
  const id = crypto.randomUUID();
  await db.insert(schema.appReports).values({
    id,
    userId: user?.id ?? null,
    userName: user?.username ?? null,
    category: CATEGORIES.includes(input?.category) ? input.category : 'other',
    message,
    photo:
      typeof input?.photo === 'string' && input.photo.startsWith('data:image/')
        ? input.photo
        : null,
    context: JSON.stringify(input?.context ?? {}).slice(0, MAX_TEXT),
  });
  await notifyAdmins(tenantId, db, {
    title: 'Nuevo reporte de la aplicación',
    body: message.slice(0, 140),
    link: '/logistics/settings',
    excludeUserId: user?.id ?? null,
  });
  return { id };
}

export async function listAppReports(db: any) {
  const rows = await db
    .select({
      id: schema.appReports.id,
      userId: schema.appReports.userId,
      userName: schema.appReports.userName,
      category: schema.appReports.category,
      message: schema.appReports.message,
      context: schema.appReports.context,
      status: schema.appReports.status,
      createdAt: schema.appReports.createdAt,
      resolvedAt: schema.appReports.resolvedAt,
      hasPhoto: sql<boolean>`"photo" IS NOT NULL`,
    })
    .from(schema.appReports)
    .orderBy(desc(schema.appReports.createdAt))
    .limit(200);
  return rows.map((row: any) => ({ ...row, context: parseContext(row.context) }));
}

export async function getAppReport(db: any, id: string) {
  const [row] = await db.select().from(schema.appReports).where(eq(schema.appReports.id, id));
  if (!row) throw new LogisticsError('Reporte no encontrado', 404);
  return { ...row, context: parseContext(row.context) };
}

export async function setAppReportStatus(db: any, id: string, status: unknown) {
  const resolved = status === 'resolved';
  const updated = await db
    .update(schema.appReports)
    .set({ status: resolved ? 'resolved' : 'open', resolvedAt: resolved ? new Date() : null })
    .where(eq(schema.appReports.id, id))
    .returning({ id: schema.appReports.id });
  if (updated.length === 0) throw new LogisticsError('Reporte no encontrado', 404);
  return { status: resolved ? 'resolved' : 'open' };
}
