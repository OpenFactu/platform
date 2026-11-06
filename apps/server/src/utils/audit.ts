import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import crypto from 'crypto';

export interface AuditLogOptions {
  tenantClient: any;
  tenantId: string;
  userId?: string;
  entityType: string;
  entityId: string;
  action:
    | 'CREATE'
    | 'UPDATE'
    | 'DELETE'
    | 'APPROVE'
    | 'POST'
    | 'REVERSE'
    | 'CLOSE'
    | 'OVERRIDE'
    | 'CANCEL'
    | 'RETURN';
  oldValue?: any;
  newValue?: any;
}

/**
 * Registra una entrada en la tabla de auditoría global.
 */
export async function logAudit(options: AuditLogOptions) {
  try {
    const { tenantClient, tenantId, userId, entityType, entityId, action, oldValue, newValue } =
      options;

    await tenantClient.insert(schema.auditLogs).values({
      id: crypto.randomUUID(),
      tenantId,
      userId,
      entityType,
      entityId,
      action,
      oldValue: oldValue ? JSON.stringify(oldValue) : null,
      newValue: newValue ? JSON.stringify(newValue) : null,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error(`[AuditLogger] Error al grabar auditoría para ${options.entityType}:`, error);
    // No lanzamos el error para no bloquear la operación principal si falla el log
  }
}
