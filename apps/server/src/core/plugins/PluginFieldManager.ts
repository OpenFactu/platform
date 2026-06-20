import { ClientFactory } from '../tenant/ClientFactory';
import { TenantPluginCache } from './TenantPluginCache';
import * as schema from '../../db/schema';
import { and, eq, sql } from 'drizzle-orm';

const URL_RE = /^https?:\/\/[^\s]+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s().-]{5,}$/;
const COLOR_RE = /^#[0-9a-f]{3,8}$/i;

export class PluginFieldManager {
  /** Lee, valida y extrae los campos de plugin presentes en el body. */
  public static async validateAndExtract(
    tableName: string,
    body: any,
    tenantId?: string,
    userRole?: string,
    schemaName?: string,
  ): Promise<Record<string, any>> {
    const publicDb = ClientFactory.getClient('public');

    let definitions = await publicDb
      .select()
      .from(schema.pluginFields)
      .where(eq(schema.pluginFields.tableName, tableName));

    if (tenantId) {
      definitions = definitions.filter((def) => {
        if (def.pluginId === '__user__') return (def as any).tenantId === tenantId;
        return TenantPluginCache.isActive(tenantId, def.pluginId);
      });
    }

    const extracted: Record<string, any> = {};

    for (const def of definitions) {
      const d = def as any;
      const writeRoles: string[] = Array.isArray(d.writeRoles) ? d.writeRoles : [];

      // Si el rol del usuario no puede escribir el campo, lo ignoramos silenciosamente.
      if (writeRoles.length > 0 && userRole && !writeRoles.includes(userRole)) {
        continue;
      }

      let value = body[def.fieldName];

      // `readOnly` ⇒ el valor enviado por el cliente se descarta.
      if (d.readOnly) value = undefined;

      const empty = value === undefined || value === null || value === '';

      if (empty) {
        // Aplicar valor por defecto si está definido.
        if (d.defaultValue !== null && d.defaultValue !== undefined && d.defaultValue !== '') {
          try {
            extracted[def.fieldName] = JSON.parse(d.defaultValue);
          } catch {
            extracted[def.fieldName] = d.defaultValue;
          }
          continue;
        }
        if (d.required) {
          throw new Error(`El campo "${def.label || def.fieldName}" es obligatorio.`);
        }
        continue;
      }

      if (!this.isValidType(value, def.fieldType, d.options)) {
        throw new Error(
          `Valor inválido para "${def.label || def.fieldName}" (tipo ${def.fieldType}).`,
        );
      }

      // Validaciones finas declaradas en `validation`.
      const v = d.validation || {};
      if (['INTEGER', 'DECIMAL', 'CURRENCY', 'PERCENT'].includes(def.fieldType)) {
        const n = Number(value);
        if (typeof v.min === 'number' && n < v.min)
          throw new Error(`"${def.label}" debe ser ≥ ${v.min}.`);
        if (typeof v.max === 'number' && n > v.max)
          throw new Error(`"${def.label}" debe ser ≤ ${v.max}.`);
      }
      if (typeof value === 'string') {
        if (typeof v.minLength === 'number' && value.length < v.minLength)
          throw new Error(`"${def.label}" debe tener al menos ${v.minLength} caracteres.`);
        if (typeof v.maxLength === 'number' && value.length > v.maxLength)
          throw new Error(`"${def.label}" debe tener máximo ${v.maxLength} caracteres.`);
        if (typeof v.pattern === 'string' && v.pattern) {
          try {
            if (!new RegExp(v.pattern).test(value))
              throw new Error(`"${def.label}" no respeta el patrón requerido.`);
          } catch (e: any) {
            if (e?.message?.includes('no respeta')) throw e;
            // regex inválida → ignorar en vez de bloquear.
          }
        }
      }

      // Unicidad dentro de la tabla.
      if (v.unique && schemaName) {
        const tenantDb = ClientFactory.getClient(schemaName);
        const res: any = await tenantDb.execute(
          sql.raw(
            `SELECT COUNT(*)::int AS c FROM "${schemaName}"."${tableName}" WHERE "${def.fieldName}" = '${String(value).replace(/'/g, "''")}'`,
          ),
        );
        const c = Number(res.rows?.[0]?.c ?? 0);
        if (c > 0) throw new Error(`"${def.label}" ya existe. Debe ser único.`);
      }

      extracted[def.fieldName] = value;
    }

    return extracted;
  }

  private static isValidType(value: any, expectedType: string, options?: any): boolean {
    switch (expectedType) {
      case 'TEXT':
        return typeof value === 'string';
      case 'INTEGER':
        return Number.isInteger(Number(value));
      case 'DECIMAL':
      case 'CURRENCY':
      case 'PERCENT':
        return !isNaN(parseFloat(value));
      case 'BOOLEAN':
        return typeof value === 'boolean';
      case 'DATE':
        return typeof value === 'string' && !isNaN(Date.parse(value));
      case 'JSONB':
        return typeof value === 'object';
      case 'ENUM': {
        if (typeof value !== 'string') return false;
        if (!Array.isArray(options)) return true;
        return options.some((o: any) => (typeof o === 'string' ? o === value : o?.value === value));
      }
      case 'MULTISELECT': {
        if (!Array.isArray(value)) return false;
        if (!Array.isArray(options)) return true;
        const allowed = new Set(options.map((o: any) => (typeof o === 'string' ? o : o?.value)));
        return value.every((v) => allowed.has(v));
      }
      case 'URL':
        return typeof value === 'string' && URL_RE.test(value);
      case 'EMAIL':
        return typeof value === 'string' && EMAIL_RE.test(value);
      case 'PHONE':
        return typeof value === 'string' && PHONE_RE.test(value);
      case 'COLOR':
        return typeof value === 'string' && COLOR_RE.test(value);
      case 'REFERENCE':
        return typeof value === 'string' && value.length > 0;
      case 'FILE':
        return typeof value === 'string';
      default:
        return true;
    }
  }

  /** Filtra un objeto ya persistido dejando solo los campos que el rol
   *  dado puede leer. Útil cuando el backend devuelve un documento al UI. */
  public static async filterReadable(
    tableName: string,
    row: Record<string, any>,
    tenantId: string,
    userRole?: string,
  ): Promise<Record<string, any>> {
    const publicDb = ClientFactory.getClient('public');
    const defs = await publicDb
      .select()
      .from(schema.pluginFields)
      .where(eq(schema.pluginFields.tableName, tableName));
    const blocked: string[] = [];
    for (const d of defs as any[]) {
      const rr: string[] = Array.isArray(d.readRoles) ? d.readRoles : [];
      if (rr.length > 0 && userRole && !rr.includes(userRole)) {
        blocked.push(d.fieldName);
      }
    }
    if (blocked.length === 0) return row;
    const clone: Record<string, any> = { ...row };
    for (const f of blocked) delete clone[f];
    return clone;
  }
}
