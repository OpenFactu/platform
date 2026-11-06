/**
 * Objetos del sistema a los que se puede enlazar un campo de usuario, como en SAP: al
 * crear el campo se elige "Interlocutor" o "Factura de venta", no una tabla.
 *
 * Tabla y columnas salen siempre de aquí, nunca de lo que mande el navegador, y los
 * valores van como parámetros. Cada objeto dice qué permiso pide para mirarlo.
 */
import { and, eq, sql, type SQL } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { DocumentRegistry } from '../documents/DocumentRegistry';
import { TenantScopedRegistry } from '../plugins/TenantScopedRegistry';

export interface LinkableObject {
  id: string;
  label: string;
  /** Tabla física. No sale de la API. */
  table: string;
  /** Columnas que forman el nombre con el que se enseña un registro. */
  display: string[];
  search: string[];
  /** Permiso de lectura que hace falta para buscarlo o ver su nombre. */
  permissionPath: string;
  /** Pantalla que lo abre; `:id` se cambia por el del registro. */
  route: string;
  isDocument?: boolean;
}

const USER_PLUGIN_ID = '__user__';

const CORE_OBJECTS: LinkableObject[] = [
  {
    id: 'partner',
    label: 'Interlocutor',
    table: 'BusinessPartner',
    display: ['code', 'name'],
    search: ['code', 'name', 'nif'],
    permissionPath: '/partners',
    route: '/partners/:id',
  },
  {
    id: 'item',
    label: 'Artículo',
    table: 'Item',
    display: ['code', 'name'],
    search: ['code', 'name', 'barcode'],
    permissionPath: '/items',
    route: '/items/:id',
  },
  {
    id: 'warehouse',
    label: 'Almacén',
    table: 'Warehouse',
    display: ['name'],
    search: ['name'],
    permissionPath: '/warehouses',
    route: '/warehouses',
  },
  {
    id: 'employee',
    label: 'Empleado',
    table: 'Employee',
    display: ['code', 'firstName', 'lastName'],
    search: ['code', 'firstName', 'lastName'],
    permissionPath: '/hr/employees',
    route: '/hr/employees/:id',
  },
  {
    id: 'account',
    label: 'Cuenta contable',
    table: 'ChartOfAccount',
    display: ['code', 'name'],
    search: ['code', 'name'],
    permissionPath: '/chart-of-accounts',
    route: '/chart-of-accounts',
  },
  {
    id: 'costCenter',
    label: 'Centro de coste',
    table: 'CostCenter',
    display: ['code', 'name'],
    search: ['code', 'name'],
    permissionPath: '/cost-centers',
    route: '/cost-centers',
  },
  {
    id: 'project',
    label: 'Proyecto',
    table: 'InternalOrder',
    display: ['code', 'name'],
    search: ['code', 'name'],
    permissionPath: '/internal-orders',
    route: '/internal-orders',
  },
];

/** Los que aportan los plugins, solo en las empresas que los tengan activos. */
const pluginObjects = new TenantScopedRegistry<LinkableObject>();

export const LinkableObjects = {
  register(pluginId: string, object: LinkableObject): void {
    if (!object?.id) throw new Error(`[Plugin ${pluginId}] linkableObjects.register: falta id`);
    pluginObjects.add(pluginId, object);
  },
};

const DOC_PREFIX = 'doc:';
const TABLE_PREFIX = 'table:';

function documentObject(config: any): LinkableObject {
  return {
    id: `${DOC_PREFIX}${config.docType}`,
    label: config.label,
    table: config.headerPgName,
    display: ['docNum'],
    search: ['docNum'],
    permissionPath: config.uiRoute || `/documents/${config.docType}`,
    route: `${config.uiRoute || `/documents/${config.docType}`}/:id`,
    isDocument: true,
  };
}

const documentObjects = () =>
  DocumentRegistry.getAll()
    .filter((config) => config.schemaTable.partnerId !== undefined)
    .map(documentObject);

function userTableObject(row: {
  tableName: string;
  label?: string | null;
  displayField?: string | null;
}): LinkableObject {
  const display = row.displayField || 'id';
  return {
    id: `${TABLE_PREFIX}${row.tableName}`,
    label: row.label || row.tableName,
    table: row.tableName,
    display: [display],
    search: [display],
    permissionPath: '/user-tables',
    route: `/user-tables/${row.tableName}`,
  };
}

const userTableRows = async (publicDb: any, tenantId: string, tableName?: string) =>
  publicDb
    .select()
    .from(schema.pluginTables)
    .where(
      and(
        eq(schema.pluginTables.pluginId, USER_PLUGIN_ID),
        eq(schema.pluginTables.tenantId, tenantId),
        ...(tableName ? [eq(schema.pluginTables.tableName, tableName)] : []),
      ),
    );

export interface LinkContext {
  /** Cliente de la empresa. */
  db: any;
  publicDb: any;
  tenantId: string;
}

export async function listLinkableObjects(ctx: LinkContext): Promise<LinkableObject[]> {
  const tables = await userTableRows(ctx.publicDb, ctx.tenantId);
  return [
    ...CORE_OBJECTS,
    ...documentObjects(),
    ...tables.map(userTableObject),
    ...pluginObjects.activeFor(ctx.tenantId),
  ];
}

export async function linkableObjectById(
  ctx: LinkContext,
  id: string,
): Promise<LinkableObject | null> {
  if (id.startsWith(TABLE_PREFIX)) {
    const [row] = await userTableRows(ctx.publicDb, ctx.tenantId, id.slice(TABLE_PREFIX.length));
    return row ? userTableObject(row) : null;
  }
  return (
    CORE_OBJECTS.find((o) => o.id === id) ??
    documentObjects().find((o) => o.id === id) ??
    pluginObjects.activeFor(ctx.tenantId).find((o) => o.id === id) ??
    null
  );
}

/** El objeto de un campo: el que dice o, en los campos antiguos, el de su tabla. */
export function effectiveRefObject(field: {
  refObject?: string | null;
  refTable?: string | null;
}): string | null {
  if (field.refObject) return field.refObject;
  const table = field.refTable;
  if (!table) return null;
  if (table.startsWith('pt_')) return `${TABLE_PREFIX}${table}`;
  const known = [...CORE_OBJECTS, ...documentObjects(), ...pluginObjects.all()].find(
    (o) => o.table === table,
  );
  return known?.id ?? null;
}

const columnText = (column: string) => sql`t.${sql.identifier(column)}::text`;

/** El nombre con el que se enseña un registro, como expresión SQL. */
function labelExpression(object: LinkableObject): SQL {
  if (object.isDocument) {
    return sql`concat_ws(' · ',
      concat_ws('-', s."prefix",
        CASE WHEN s."numberingMode" = 'MANUAL' THEN NULL ELSE p."code" END,
        lpad(t."docNum"::text, 6, '0')),
      b."name")`;
  }
  const columns = object.display.map(columnText);
  return sql`concat_ws(' · ', ${sql.join(columns, sql`, `)})`;
}

/** Tabla con lo que hace falta para el nombre: un documento lleva serie, periodo y a quién. */
function fromClause(object: LinkableObject): SQL {
  const table = sql`${sql.identifier(object.table)} t`;
  if (!object.isDocument) return table;
  return sql`${table}
    LEFT JOIN "DocumentSeries" s ON s."id" = t."seriesId"
    LEFT JOIN "AccountingPeriod" p ON p."id" = t."periodId"
    LEFT JOIN "BusinessPartner" b ON b."id" = t."partnerId"`;
}

export async function searchLinkedObject(
  db: any,
  object: LinkableObject,
  query: string,
): Promise<Array<{ id: string; label: string }>> {
  const label = labelExpression(object);
  const text = query.trim().toLowerCase();
  // `strpos` y no `ILIKE`: un `%` o un `_` del usuario son solo texto.
  const matches = text
    ? sql`WHERE strpos(lower(${label}), ${text}) > 0`
    : sql``;
  const result: any = await db.execute(
    sql`SELECT t."id", ${label} AS "label" FROM ${fromClause(object)} ${matches} ORDER BY 2 LIMIT 20`,
  );
  return (result.rows ?? result).map((row: any) => ({ id: row.id, label: row.label }));
}

/** Los nombres de estos registros, por id. Lo que no existe no aparece. */
export async function linkedObjectLabels(
  db: any,
  object: LinkableObject,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const list = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
  const result: any = await db.execute(
    sql`SELECT t."id", ${labelExpression(object)} AS "label" FROM ${fromClause(object)} WHERE t."id" IN (${list})`,
  );
  return new Map((result.rows ?? result).map((row: any) => [row.id, row.label]));
}

export const linkedObjectRoute = (object: LinkableObject, id: string) =>
  object.route.replace(':id', encodeURIComponent(id));

/** La empresa como contexto de enlace, cuando solo se tiene su id. */
export async function linkContextForTenant(
  publicDb: any,
  clientFor: (schemaName: string) => any,
  tenantId: string,
): Promise<LinkContext | null> {
  const [tenant] = await publicDb
    .select({ schemaName: schema.tenants.schemaName })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId));
  return tenant ? { db: clientFor(tenant.schemaName), publicDb, tenantId } : null;
}

/** En un PDF o una plantilla: el nombre del registro; si no se puede, el valor tal cual. */
export async function linkedFieldText(ctx: LinkContext, field: any, value: unknown): Promise<string> {
  const raw = value === null || value === undefined ? '' : String(value);
  const objectId = raw ? effectiveRefObject(field) : null;
  if (!objectId) return raw;
  const object = await linkableObjectById(ctx, objectId);
  if (!object) return raw;
  const labels = await linkedObjectLabels(ctx.db, object, [raw]);
  return labels.get(raw) ?? raw;
}
