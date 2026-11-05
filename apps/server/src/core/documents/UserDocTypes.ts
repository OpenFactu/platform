/**
 * Tipos de documento de las tablas propias: una tabla creada desde la UI con
 * `kind='document'` es un tipo más para las plantillas y los PDF, por empresa. Su
 * código es el nombre de la tabla (`pt_contratos`) y sus registros son fichas
 * planas: campos, sin tercero, líneas ni totales.
 *
 * No entran en el DocumentRegistry: ese es común a todas las empresas y sus tipos
 * llevan series, stock y asientos que aquí no existen.
 */
import { effectiveRefObject, linkedFieldText } from '../customFields/linkableObjects';
import crypto from 'crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { PdfRenderer, getDefaultTemplate, getDefaultTemplateName } from '@openfactu/pdf';
import * as schema from '../../db/schema';
import { ClientFactory } from '../tenant/ClientFactory';
import { DocumentRegistry } from './DocumentRegistry';
import { intlLocale, tr, type Locale } from '../../i18n';

const USER_PLUGIN_ID = '__user__';
const USER_DOC_TYPE_RE = /^pt_[a-z0-9_]+$/i;

export interface UserDocType {
  docType: string;
  label: string;
  displayField: string | null;
}

export function isUserDocType(docType: unknown): docType is string {
  return typeof docType === 'string' && USER_DOC_TYPE_RE.test(docType);
}

/** Tipos con los que se puede crear o previsualizar una plantilla en esta empresa. */
export async function isTemplateDocType(
  tenantId: string | null | undefined,
  docType: unknown,
): Promise<boolean> {
  if (typeof docType !== 'string') return false;
  if (docType === 'FREE' || docType === 'LABEL' || DocumentRegistry.has(docType)) return true;
  return isUserDocType(docType) && !!(await UserDocTypes.find(tenantId, docType));
}

export function isFieldVisibleInPdf(field: any): boolean {
  return (
    !field.visibleIn ||
    !Array.isArray(field.visibleIn) ||
    field.visibleIn.length === 0 ||
    field.visibleIn.includes('pdf')
  );
}

function optionLabel(options: unknown, value: unknown): string {
  const found = Array.isArray(options)
    ? options.find((o: any) => (typeof o === 'string' ? o : o?.value) === value)
    : undefined;
  return String((typeof found === 'object' && found?.label) || value);
}

function formatDate(value: unknown, locale: Locale): string {
  // Una fecha sin hora no debe cambiar de día según la zona horaria del servidor.
  const m = typeof value === 'string' ? value.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  const date = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value as any);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(intlLocale(locale));
}

/** El valor de un campo tal como se imprime. Vacío si no tiene valor. */
export function formatFieldValue(
  field: { fieldType: string; options?: unknown },
  value: unknown,
  locale: Locale,
  currency?: string,
): string {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  const numeric = (options: Intl.NumberFormatOptions) =>
    Number.isNaN(number) ? String(value) : number.toLocaleString(intlLocale(locale), options);

  switch (field.fieldType) {
    case 'BOOLEAN':
      return tr(locale, value === true || value === 'true' ? 'Sí' : 'No');
    case 'DATE':
      return formatDate(value, locale);
    case 'INTEGER':
      return numeric({ maximumFractionDigits: 0 });
    case 'DECIMAL':
      return numeric({ maximumFractionDigits: 4 });
    case 'CURRENCY':
      return numeric(
        currency
          ? { style: 'currency', currency }
          : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      );
    case 'PERCENT':
      return `${numeric({ maximumFractionDigits: 2 })}%`;
    case 'ENUM':
      return optionLabel(field.options, value);
    case 'MULTISELECT': {
      let list: unknown = value;
      if (typeof value === 'string') {
        try {
          list = JSON.parse(value);
        } catch {
          return value;
        }
      }
      return Array.isArray(list)
        ? list.map((v) => optionLabel(field.options, v)).join(', ')
        : String(value);
    }
    case 'JSONB':
      return typeof value === 'string' ? value : JSON.stringify(value);
    default:
      return String(value);
  }
}

export const UserDocTypes = {
  async list(tenantId: string | null | undefined): Promise<UserDocType[]> {
    if (!tenantId) return [];
    const rows = await ClientFactory.getClient('public')
      .select()
      .from(schema.pluginTables)
      .where(
        and(
          eq(schema.pluginTables.pluginId, USER_PLUGIN_ID),
          eq(schema.pluginTables.tenantId, tenantId),
          eq(schema.pluginTables.kind, 'document'),
        ),
      )
      .orderBy(asc(schema.pluginTables.tableName));
    return rows.map((r: any) => ({
      docType: r.tableName,
      label: r.label || r.tableName,
      displayField: r.displayField ?? null,
    }));
  },

  async find(
    tenantId: string | null | undefined,
    docType: string,
  ): Promise<UserDocType | undefined> {
    if (!isUserDocType(docType)) return undefined;
    return (await this.list(tenantId)).find((t) => t.docType === docType);
  },

  /** Campos que salen en el PDF para este rol, en el orden del formulario. */
  async fieldsFor(tenantId: string, docType: string, role?: string): Promise<any[]> {
    const rows = await ClientFactory.getClient('public')
      .select()
      .from(schema.pluginFields)
      .where(
        and(
          eq(schema.pluginFields.pluginId, USER_PLUGIN_ID),
          eq(schema.pluginFields.tenantId, tenantId),
          eq(schema.pluginFields.tableName, docType),
        ),
      )
      .orderBy(asc(schema.pluginFields.displayOrder), asc(schema.pluginFields.createdAt));
    return rows.filter(isFieldVisibleInPdf).filter((f: any) => {
      const roles: string[] = Array.isArray(f.readRoles) ? f.readRoles : [];
      return roles.length === 0 || (!!role && roles.includes(role));
    });
  },

  async readRow(db: any, docType: string, id: string): Promise<Record<string, any> | null> {
    const result: any = await db.execute(
      sql`SELECT * FROM ${sql.identifier(docType)} WHERE "id" = ${id}`,
    );
    return result.rows?.[0] ?? null;
  },

  async latestRowId(db: any, docType: string): Promise<string | null> {
    const result: any = await db.execute(
      sql`SELECT "id" FROM ${sql.identifier(docType)} ORDER BY "createdAt" DESC LIMIT 1`,
    );
    return result.rows?.[0]?.id ?? null;
  },

  /** Lo que se enseña de otra tabla en un campo de referencia, en lugar de su id. */
  async referenceValue(db: any, field: any, value: unknown): Promise<string> {
    if (!field.refTable || value === null || value === undefined || value === '') {
      return value === null || value === undefined ? '' : String(value);
    }
    try {
      if (effectiveRefObject(field)?.startsWith('doc:')) {
        return await linkedFieldText({ db, publicDb: null, tenantId: '' }, field, value);
      }
      const column = field.refDisplayField || 'name';
      const result: any = await db.execute(
        sql`SELECT ${sql.identifier(column)} AS "display" FROM ${sql.identifier(field.refTable)} WHERE "id" = ${String(value)}`,
      );
      return String(result.rows?.[0]?.display ?? value);
    } catch {
      return String(value);
    }
  },

  /**
   * Deja lista la plantilla estándar del tipo. Solo se regenera la de fábrica; una
   * que alguien haya editado deja de serlo (ver el PUT de plantillas) y no se toca.
   */
  async ensureTemplate(db: any, type: UserDocType): Promise<void> {
    const html = getDefaultTemplate(type.docType, { layout: 'record' });
    const name = getDefaultTemplateName(type.docType, type.label);
    const rows = await db
      .select()
      .from(schema.documentTemplates)
      .where(eq(schema.documentTemplates.docType, type.docType))
      .orderBy(desc(schema.documentTemplates.isFactoryDefault));
    const factory = rows.find((r: any) => r.isFactoryDefault);
    if (factory) {
      if (factory.html === html && factory.name === name) return;
      await db
        .update(schema.documentTemplates)
        .set({ html, name })
        .where(eq(schema.documentTemplates.id, factory.id));
      PdfRenderer.invalidateCache();
      return;
    }
    await db.insert(schema.documentTemplates).values({
      id: crypto.randomUUID(),
      docType: type.docType,
      name,
      html,
      isDefault: !rows.some((r: any) => r.isDefault),
      isFactoryDefault: true,
    });
  },

  async ensureTemplates(tenantId: string | null | undefined, db: any): Promise<UserDocType[]> {
    const types = await this.list(tenantId);
    for (const type of types) await this.ensureTemplate(db, type);
    return types;
  },

  /** Al borrar la tabla: sus plantillas ya no tienen de dónde sacar datos. */
  async dropTemplates(db: any, docType: string): Promise<void> {
    await db.delete(schema.documentTemplates).where(eq(schema.documentTemplates.docType, docType));
    PdfRenderer.invalidateCache();
  },
};
