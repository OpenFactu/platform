/** Un aviso solo para quien puede hacer algo: sin destinatarios, `notifyTenant` avisaría a todos. */
import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { ClientFactory } from '../tenant/ClientFactory';
import { notifyTenant, type NotifLevel } from './notifyTenant';

export async function notifyAdmins(
  tenantId: string,
  db: any,
  notice: {
    title: string;
    body?: string;
    level?: NotifLevel;
    link?: string;
    excludeUserId?: string | null;
  },
): Promise<void> {
  const admins = await ClientFactory.getClient('public')
    .select({ userId: schema.userTenantMemberships.userId })
    .from(schema.userTenantMemberships)
    .where(
      and(
        eq(schema.userTenantMemberships.tenantId, tenantId),
        inArray(schema.userTenantMemberships.role, ['ADMIN', 'SUPERUSER']),
      ),
    );
  if (admins.length === 0) return;
  await notifyTenant({
    tenantId,
    tenantClient: db,
    ...notice,
    userIds: admins.map((admin: any) => admin.userId),
  });
}
