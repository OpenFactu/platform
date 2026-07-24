import {
  pgTable,
  text,
  timestamp,
  decimal,
  doublePrecision,
  integer,
  boolean,
  unique,
  jsonb,
  bigint,
  date,
} from 'drizzle-orm/pg-core';

/**
 * ESQUEMA GLOBAL (Esquema 'public')
 */
export const tenants = pgTable('Tenant', {
  id: text('id').primaryKey(),
  name: text('name').unique().notNull(),
  schemaName: text('schemaName').unique().notNull(),
  config: text('config'), // JSON almacenado como texto
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

export const globalUsers = pgTable('GlobalUser', {
  id: text('id').primaryKey(),
  email: text('email').unique().notNull(),
  username: text('username').unique().notNull(),
  password: text('password').notNull(),
  role: text('role').default('USER').notNull(),
  tenantId: text('tenantId').references(() => tenants.id),
  permissions: text('permissions'), // Almacena JSON de permisos granulares
  // Foto de perfil — se usa en la tabla de Usuarios y en el chat de IA.
  avatarImageUrl: text('avatarImageUrl'),
  // Firma del usuario para PDFs. Si está informada, prevalece sobre la
  // firma de empresa (modelo híbrido — override por usuario).
  signatureName: text('signatureName'),
  signatureRole: text('signatureRole'),
  signatureImageUrl: text('signatureImageUrl'),
  // Recuperación de contraseña — se guarda solo el hash SHA-256 del token.
  resetTokenHash: text('resetTokenHash'),
  resetTokenExpiresAt: timestamp('resetTokenExpiresAt'),
  // Autenticación en dos pasos (TOTP). El secreto se cifra en reposo (AES-GCM).
  totpSecret: text('totpSecret'),
  totpEnabled: boolean('totpEnabled').default(false).notNull(),
  totpBackupCodes: text('totpBackupCodes'), // JSON con hashes SHA-256 de un solo uso
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

export const userTenantMemberships = pgTable(
  'UserTenantMembership',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => globalUsers.id, { onDelete: 'cascade' }),
    tenantId: text('tenantId')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    role: text('role').default('USER').notNull(),
    permissions: text('permissions'),
    createdAt: timestamp('createdAt').defaultNow().notNull(),
    updatedAt: timestamp('updatedAt').defaultNow().notNull(),
  },
  (t) => ({ unq: unique().on(t.userId, t.tenantId) }),
);

export const pluginFields = pgTable('PluginField', {
  id: text('id').primaryKey(),
  /** `pluginId = '__user__'` indica un campo creado desde la UI (no de
   *  ningún plugin). Para estos casos `tenantId` acota el ámbito a un
   *  único tenant; para fields de plugin, `tenantId` es null y la
   *  visibilidad la marca la activación del plugin. */
  pluginId: text('pluginId').notNull(),
  tenantId: text('tenantId'),
  tableName: text('tableName').notNull(),
  fieldName: text('fieldName').notNull(),
  /** `TEXT` | `INTEGER` | `DECIMAL` | `BOOLEAN` | `DATE` | `JSONB` | `ENUM`. */
  fieldType: text('fieldType').notNull(),
  label: text('label').notNull(),
  /** Para `ENUM`/`MULTISELECT`: array de opciones `[{value, label}]`. */
  options: jsonb('options'),
  /** Si `true`, el backend rechaza la creación del documento si el campo
   *  no viene en el body (o viene vacío). El frontend lo marca con `*`. */
  required: boolean('required').default(false).notNull(),
  /** Texto de ayuda bajo el input. */
  helpText: text('helpText'),
  /** Placeholder del input. */
  placeholder: text('placeholder'),
  /** Valor por defecto al crear un nuevo registro (string JSON). */
  defaultValue: text('defaultValue'),
  /** Visible pero no editable en el form. */
  readOnly: boolean('readOnly').default(false).notNull(),
  /** Anchura en el grid: `full` | `half` | `third`. */
  width: text('width').default('half').notNull(),
  /** Orden dentro del panel (menor = arriba). */
  displayOrder: integer('displayOrder').default(0).notNull(),
  /** Sección para agrupar (p.ej. "Logística"). */
  section: text('section'),
  /** Array de sitios donde aparecer: `form`, `detail`, `list`, `pdf`. */
  visibleIn: jsonb('visibleIn'),
  /** Si true, aparece como columna en el listado maestro. */
  showInList: boolean('showInList').default(false).notNull(),
  /** Array de roles que pueden leerlo ([] = todos). */
  readRoles: jsonb('readRoles'),
  /** Array de roles que pueden editarlo ([] = todos). */
  writeRoles: jsonb('writeRoles'),
  /** Reglas extra: `{min, max, pattern, minLength, maxLength, unique}`. */
  validation: jsonb('validation'),
  /** Para `REFERENCE`: tabla referenciada (p.ej. `BusinessPartner`). */
  refTable: text('refTable'),
  /** Para `REFERENCE`: campo a mostrar (default `name`). */
  refDisplayField: text('refDisplayField'),
  isManaged: boolean('isManaged').default(true).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export const pluginTables = pgTable('PluginTable', {
  id: text('id').primaryKey(),
  /** `pluginId='__user__'` indica tabla creada desde la UI por un admin. */
  pluginId: text('pluginId').notNull(),
  /** Para tablas de usuario: tenant dueño; null para tablas de plugin globales. */
  tenantId: text('tenantId'),
  tableName: text('tableName').notNull(),
  definition: text('definition').notNull(),
  /** Etiqueta visible en menú/listado. */
  label: text('label'),
  /** `master` (maestro) | `document` (documento). */
  kind: text('kind').default('master').notNull(),
  /** Nombre lucide-react para el icono del menú. */
  iconName: text('iconName'),
  /** Módulo al que se añade en el menú (id de `CORE_MODULES`). */
  menuModule: text('menuModule'),
  /** Si se asigna a un `UserModule` custom, su id. Tiene prioridad sobre `menuModule`. */
  userModuleId: text('userModuleId'),
  /** Campo a usar como "título" de una fila (ej. `p_code`, `p_name`). */
  displayField: text('displayField'),
  description: text('description'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

/**
 * Widget de dashboard creado desde la propia web (sin plugin en disco), por
 * un admin del tenant. Dos formas, elegidas por `kind`:
 *  - `metric`: muestra el valor de una métrica del catálogo curado
 *    (`DASHBOARD_METRICS`) — nunca ejecuta SQL arbitrario del usuario.
 *  - `code`: el admin escribe un componente React (TSX) directamente desde
 *    la web (`sourceCode`), que el server transpila on-the-fly (esbuild) y
 *    sirve como módulo ESM. El componente solo tiene acceso a llamadas de
 *    lectura vía el helper `@openfactu/widget-api` (`get(path)` — sin
 *    post/put/delete); ver `apps/web/src/sdk/sdk-proxy.ts`.
 */
export const userDashboardWidgets = pgTable('UserDashboardWidget', {
  id: text('id').primaryKey(),
  tenantId: text('tenantId').notNull(),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  /** `metric` (catálogo curado) | `code` (componente React del usuario) | `query` (declarativo con SQL de solo lectura, ver DeclarativeWidget). */
  kind: text('kind').default('metric').notNull(),
  /** Clave del catálogo de métricas curado (ej. 'items.count'). Solo si kind='metric'. */
  metricKey: text('metricKey'),
  /** Código fuente TSX del componente. Solo si kind='code'. */
  sourceCode: text('sourceCode'),
  /** { chartType: 'kpi'|'bar'|'table', sql, xField?, yField?, valueField? }. Solo si kind='query'. */
  queryConfig: jsonb('queryConfig'),
  /** Tamaño en la grid de 4 columnas: sm=1, md=2, lg=3, full=4. */
  size: text('size').default('md').notNull(),
  displayOrder: integer('displayOrder').default(100).notNull(),
  createdBy: text('createdBy'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

/**
 * Conversación guardada del chat de IA — vive en `public` acotada por
 * tenantId + userId (mismo patrón que UserDashboardWidget: dato de usuario,
 * no de negocio del tenant, así que no necesita su propia migración por
 * tenant). `messages` guarda tal cual el array de UIMessage del AI SDK
 * (partes de texto/razonamiento/tool-calls ya son JSON serializable).
 */
export const aiConversations = pgTable('AiConversation', {
  id: text('id').primaryKey(),
  tenantId: text('tenantId').notNull(),
  userId: text('userId').notNull(),
  title: text('title'),
  messages: jsonb('messages').notNull().default([]),
  /** Último modelo usado en esta conversación — informativo, para el historial. */
  model: text('model'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

export const tenantPlugins = pgTable(
  'TenantPlugin',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    pluginId: text('pluginId').notNull(),
    isActive: boolean('isActive').default(false).notNull(),
    config: text('config'),
    activatedAt: timestamp('activatedAt').defaultNow(),
    deactivatedAt: timestamp('deactivatedAt'),
  },
  (t) => ({ unq: unique().on(t.tenantId, t.pluginId) }),
);

export const devApiKeys = pgTable('DevApiKey', {
  id: text('id').primaryKey(),
  clientId: text('clientId').notNull().unique(),
  clientSecret: text('clientSecret').notNull(),
  name: text('name').notNull(),
  createdBy: text('createdBy')
    .notNull()
    .references(() => globalUsers.id),
  tenantId: text('tenantId').references(() => tenants.id),
  permissions: text('permissions').default('plugin:push,plugin:reload'),
  isActive: boolean('isActive').default(true).notNull(),
  lastUsedAt: timestamp('lastUsedAt'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

/**
 * Tokens de API para integraciones server-to-server (plugins, sistemas
 * externos). Vive en `public` porque se resuelve antes del tenant context;
 * `tenantId` dirige al schema del tenant. Solo se guarda el SHA-256 del
 * token — el valor en claro se muestra una sola vez al crearlo.
 */
export const apiTokens = pgTable('ApiToken', {
  id: text('id').primaryKey(),
  tenantId: text('tenantId').notNull(),
  name: text('name').notNull(),
  tokenHash: text('tokenHash').notNull().unique(),
  /** Primeros caracteres legibles (`tk_xxxxxxxx…`) para identificarlo en UI. */
  prefix: text('prefix').notNull(),
  /** CSV: `read:logistics,write:logistics,...` */
  scopes: text('scopes').notNull(),
  createdByUserId: text('createdByUserId'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  lastUsedAt: timestamp('lastUsedAt'),
  revokedAt: timestamp('revokedAt'),
});

/**
 * Resolución pública de sitios web (módulo Website). Vive en `public` porque
 * el serving de la web resuelve slug/hostname → tenant ANTES del tenant
 * context, con una sola query indexada (nunca iterando tenants). El UNIQUE en
 * `value` reserva además los slugs globalmente entre tenants.
 */
export const websiteHosts = pgTable('WebsiteHost', {
  id: text('id').primaryKey(),
  /** slug | subdomain | domain */
  kind: text('kind').notNull(),
  /** Slug ('acme') o hostname completo en minúsculas ('acme.webs.com'). */
  value: text('value').notNull().unique(),
  tenantId: text('tenantId').notNull(),
  siteId: text('siteId').notNull(),
  /** Solo aplica a kind='domain': verificación DNS pendiente hasta true. */
  verified: boolean('verified').default(false).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

/**
 * DATOS GEOGRÁFICOS GENÉRICOS (public, compartidos entre tenants)
 * Soporta multi-país con jerarquía flexible:
 *   Country → Region (opcional) → SubRegion → Locality
 * Las tablas de tenant no usan FKs físicas a estas, solo guardan el id como text.
 */
export const countries = pgTable('Country', {
  code: text('code').primaryKey(), // 'ES' ISO 3166-1 alpha-2
  name: text('name').notNull(), // 'España'
  nameEn: text('nameEn').notNull(), // 'Spain'
  phonePrefix: text('phonePrefix').notNull(), // '+34'
  currency: text('currency').notNull(), // 'EUR'
  localeDefault: text('localeDefault').notNull(), // 'es-ES'
  taxIdRegex: text('taxIdRegex').notNull(),
  taxIdLabel: text('taxIdLabel').notNull(), // 'NIF/CIF'
  taxIdExample: text('taxIdExample').notNull(), // 'B12345678'
  postalCodeRegex: text('postalCodeRegex').notNull(),
  postalCodeLabel: text('postalCodeLabel').notNull(),
  regionLabel: text('regionLabel'), // null si no hay nivel region
  subRegionLabel: text('subRegionLabel').notNull(),
  localityLabel: text('localityLabel').notNull(),
});

export const regions = pgTable(
  'Region',
  {
    id: text('id').primaryKey(),
    countryCode: text('countryCode')
      .notNull()
      .references(() => countries.code),
    code: text('code').notNull(),
    name: text('name').notNull(),
  },
  (t) => ({ unq: unique().on(t.countryCode, t.code) }),
);

export const subRegions = pgTable(
  'SubRegion',
  {
    id: text('id').primaryKey(),
    countryCode: text('countryCode')
      .notNull()
      .references(() => countries.code),
    regionId: text('regionId').references((): any => regions.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
  },
  (t) => ({ unq: unique().on(t.countryCode, t.code) }),
);

export const localities = pgTable(
  'Locality',
  {
    id: text('id').primaryKey(),
    countryCode: text('countryCode')
      .notNull()
      .references(() => countries.code),
    subRegionId: text('subRegionId')
      .notNull()
      .references((): any => subRegions.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
  },
  (t) => ({ unq: unique().on(t.countryCode, t.code) }),
);

/**
 * ESQUEMA DE NEGOCIO (Multi-tenant)
 */

export const systemConfigs = pgTable('SystemConfig', {
  id: text('id').primaryKey(),
  key: text('key').unique().notNull(),
  value: text('value'),
  description: text('description'),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

// Grupos de Socios de Negocio (Tipos configurables)
export const partnerGroups = pgTable('PartnerGroup', {
  id: text('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  codePrefix: text('codePrefix'), // Ej: 'CLI' -> CLI-0001
  isCustomer: boolean('isCustomer').default(false).notNull(),
  isVendor: boolean('isVendor').default(false).notNull(),
});

// Maestro de Socios (Clientes / Proveedores)
export const businessPartners = pgTable('BusinessPartner', {
  id: text('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  // nif nullable: muchos clientes ocasionales o partners extranjeros se dan
  // de alta sin NIF. La unicidad se mantiene solo cuando tiene valor (índice
  // único parcial creado en la migración 029_partner_nif_nullable.sql).
  nif: text('nif'),
  foreignName: text('foreignName'),
  phone: text('phone'),
  email: text('email'),
  website: text('website'),
  groupId: text('groupId').references(() => partnerGroups.id),
  priceListId: text('priceListId').references(() => priceLists.id),
  countryCode: text('countryCode'),
  // Mig 033 — defaults fiscales y datos bancarios del interlocutor
  defaultDocumentTypeId: text('defaultDocumentTypeId'),
  defaultPaymentMethodId: text('defaultPaymentMethodId'),
  defaultPaymentTermId: text('defaultPaymentTermId'),
  defaultWithholdingRate: decimal('defaultWithholdingRate', { precision: 5, scale: 2 }),
  iban: text('iban'),
  bankName: text('bankName'),
  bankSwift: text('bankSwift'),
});

export const partnerAddresses = pgTable('PartnerAddress', {
  id: text('id').primaryKey(),
  partnerId: text('partnerId')
    .notNull()
    .references(() => businessPartners.id),
  name: text('name').notNull(),
  street: text('street'),
  city: text('city'),
  state: text('state'),
  zipCode: text('zipCode'),
  country: text('country'),
  countryCode: text('countryCode'),
  subRegionId: text('subRegionId'),
  localityId: text('localityId'),
  type: text('type').default('B').notNull(),
  isDefault: boolean('isDefault').default(false).notNull(),
});

// --- CONFIGURACIÓN CONTABLE Y FISCAL ---

// Periodos Contables (Ejercicios)
export const accountingPeriods = pgTable('AccountingPeriod', {
  id: text('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  startDate: timestamp('startDate').notNull(),
  endDate: timestamp('endDate').notNull(),
  status: text('status').default('O').notNull(),
});

// Plan contable. `type` ∈ {asset, liability, equity, income, expense}.
// `isAnalytical=true` fuerza al usuario a asignar al menos una dimensión
// analítica en los asientos que usen esta cuenta.
export const chartOfAccounts = pgTable('ChartOfAccount', {
  id: text('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  parentId: text('parentId'),
  isAnalytical: boolean('isAnalytical').default(false).notNull(),
  isActive: boolean('isActive').default(true).notNull(),
  notes: text('notes'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

// Centros de coste — dimensión analítica jerárquica, responsabilidad CO.
export const costCenters = pgTable('CostCenter', {
  id: text('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  parentId: text('parentId'),
  managerEmployeeId: text('managerEmployeeId'),
  isActive: boolean('isActive').default(true).notNull(),
  notes: text('notes'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

// Centros de beneficio — dimensión ortogonal a centros de coste.
export const profitCenters = pgTable('ProfitCenter', {
  id: text('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  parentId: text('parentId'),
  managerEmployeeId: text('managerEmployeeId'),
  isActive: boolean('isActive').default(true).notNull(),
  notes: text('notes'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

// Proyectos / órdenes internas / WBS — tercera dimensión analítica.
// `type` ∈ {project, internal_order, wbs}.
export const internalOrders = pgTable('InternalOrder', {
  id: text('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  type: text('type').default('project').notNull(),
  startDate: date('startDate'),
  endDate: date('endDate'),
  budgetAmount: decimal('budgetAmount', { precision: 15, scale: 2 }),
  status: text('status').default('open').notNull(),
  costCenterId: text('costCenterId').references(() => costCenters.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

// Asientos contables (cabecera).
// status ∈ {draft, posted, reversed}. source ∈ {manual, sales_invoice,
// purchase_invoice, payment, payroll, period_close, period_open, reversal}.
export const journalEntries = pgTable('JournalEntry', {
  id: text('id').primaryKey(),
  number: integer('number').notNull(),
  date: timestamp('date').notNull(),
  periodId: text('periodId')
    .notNull()
    .references(() => accountingPeriods.id),
  description: text('description'),
  source: text('source').default('manual').notNull(),
  sourceDocumentId: text('sourceDocumentId'),
  status: text('status').default('draft').notNull(),
  reversedById: text('reversedById'),
  createdBy: text('createdBy'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  postedAt: timestamp('postedAt'),
  postedBy: text('postedBy'),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

// Líneas de asiento. La suma de debit == suma de credit en el conjunto
// de líneas de un mismo entryId es invariante: se valida al postear.
export const journalEntryLines = pgTable('JournalEntryLine', {
  id: text('id').primaryKey(),
  entryId: text('entryId')
    .notNull()
    .references(() => journalEntries.id, { onDelete: 'cascade' }),
  lineNumber: integer('lineNumber').notNull(),
  accountId: text('accountId')
    .notNull()
    .references(() => chartOfAccounts.id),
  debit: decimal('debit', { precision: 15, scale: 4 }).default('0').notNull(),
  credit: decimal('credit', { precision: 15, scale: 4 }).default('0').notNull(),
  description: text('description'),
  costCenterId: text('costCenterId').references(() => costCenters.id, { onDelete: 'set null' }),
  profitCenterId: text('profitCenterId').references(() => profitCenters.id, {
    onDelete: 'set null',
  }),
  internalOrderId: text('internalOrderId').references(() => internalOrders.id, {
    onDelete: 'set null',
  }),
  partnerId: text('partnerId'),
  taxId: text('taxId'),
  currency: text('currency').default('EUR').notNull(),
  exchangeRate: decimal('exchangeRate', { precision: 15, scale: 6 }).default('1').notNull(),
});

// Reglas de mapeo para generación automática de asientos.
// kind ∈ {sales_revenue, sales_vat_output, customer_receivable,
//         purchase_expense, purchase_vat_input, supplier_payable,
//         cash, bank, payroll_gross, payroll_irpf, payroll_ss_employee,
//         payroll_ss_employer, payroll_net, retained_earnings, result}
// key permite override por partner, taxGroup, etc. 'default' si no.
export const accountMappings = pgTable('AccountMapping', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  key: text('key').default('default').notNull(),
  accountId: text('accountId')
    .notNull()
    .references(() => chartOfAccounts.id, { onDelete: 'cascade' }),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────
// RECURSOS HUMANOS (módulo core, conectado con contabilidad via AccountMapping)
// ─────────────────────────────────────────────────────────────────────

export const departments = pgTable('Department', {
  id: text('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  parentId: text('parentId'),
  managerEmployeeId: text('managerEmployeeId'),
  costCenterId: text('costCenterId').references(() => costCenters.id, { onDelete: 'set null' }),
  isActive: boolean('isActive').default(true).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

export const positions = pgTable('Position', {
  id: text('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  departmentId: text('departmentId').references(() => departments.id, { onDelete: 'set null' }),
  description: text('description'),
  isActive: boolean('isActive').default(true).notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
});

export const employees = pgTable('Employee', {
  id: text('id').primaryKey(),
  code: text('code').unique().notNull(),
  firstName: text('firstName').notNull(),
  lastName: text('lastName').notNull(),
  dni: text('dni'),
  email: text('email'),
  phone: text('phone'),
  birthDate: date('birthDate'),
  hireDate: date('hireDate'),
  terminationDate: date('terminationDate'),
  address: jsonb('address'),
  iban: text('iban'),
  departmentId: text('departmentId').references(() => departments.id, { onDelete: 'set null' }),
  costCenterId: text('costCenterId').references(() => costCenters.id, { onDelete: 'set null' }),
  profitCenterId: text('profitCenterId').references(() => profitCenters.id, {
    onDelete: 'set null',
  }),
  status: text('status').default('active').notNull(),
  userId: text('userId'),
  // PIN personal para fichar en kioskos compartidos (4-8 dígitos).
  kioskPin: text('kioskPin'),
  notes: text('notes'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

export const contracts = pgTable('Contract', {
  id: text('id').primaryKey(),
  employeeId: text('employeeId')
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  positionId: text('positionId').references(() => positions.id, { onDelete: 'set null' }),
  type: text('type').default('indefinite').notNull(),
  startDate: date('startDate').notNull(),
  endDate: date('endDate'),
  grossSalary: decimal('grossSalary', { precision: 15, scale: 2 }).default('0').notNull(),
  paymentsPerYear: integer('paymentsPerYear').default(12).notNull(),
  workHoursPerWeek: decimal('workHoursPerWeek', { precision: 5, scale: 2 }).default('40'),
  collectiveAgreement: text('collectiveAgreement'),
  // Convenio relacional (opcional). Si está definido, en UI se prefiere su
  // baseSalary y vacationDays para sugerencias de salario y vacaciones.
  collectiveAgreementId: text('collectiveAgreementId'),
  probationDays: integer('probationDays'),
  noticeDays: integer('noticeDays'),
  isPartTime: boolean('isPartTime').default(false).notNull(),
  partTimeRatio: decimal('partTimeRatio', { precision: 4, scale: 3 }),
  documentUrl: text('documentUrl'),
  signedAt: timestamp('signedAt'),
  isActive: boolean('isActive').default(true).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export const payrolls = pgTable(
  'Payroll',
  {
    id: text('id').primaryKey(),
    employeeId: text('employeeId')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    contractId: text('contractId').references(() => contracts.id),
    periodYear: integer('periodYear').notNull(),
    periodMonth: integer('periodMonth').notNull(),
    gross: decimal('gross', { precision: 15, scale: 2 }).default('0').notNull(),
    irpfAmount: decimal('irpfAmount', { precision: 15, scale: 2 }).default('0').notNull(),
    ssEmployee: decimal('ssEmployee', { precision: 15, scale: 2 }).default('0').notNull(),
    ssEmployer: decimal('ssEmployer', { precision: 15, scale: 2 }).default('0').notNull(),
    netPay: decimal('netPay', { precision: 15, scale: 2 }).default('0').notNull(),
    status: text('status').default('draft').notNull(),
    journalEntryId: text('journalEntryId'),
    paymentId: text('paymentId'),
    notes: text('notes'),
    createdAt: timestamp('createdAt').defaultNow().notNull(),
    approvedAt: timestamp('approvedAt'),
    approvedBy: text('approvedBy'),
  },
  (t) => ({ unq: unique().on(t.employeeId, t.periodYear, t.periodMonth) }),
);

// Catálogo de conceptos de nómina configurable por empresa.
// kind ∈ {devengo, deduccion, aportacion_empresa}.
// calculation ∈ {fixed, percent_of_base, per_hour}.
export const payrollConcepts = pgTable('PayrollConcept', {
  id: text('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  taxableIrpf: boolean('taxableIrpf').default(true).notNull(),
  taxableSs: boolean('taxableSs').default(true).notNull(),
  calculation: text('calculation').default('fixed').notNull(),
  defaultAmount: decimal('defaultAmount', { precision: 15, scale: 2 }),
  defaultPercent: decimal('defaultPercent', { precision: 6, scale: 3 }),
  accountId: text('accountId').references(() => chartOfAccounts.id, { onDelete: 'set null' }),
  isActive: boolean('isActive').default(true).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

export const payrollLines = pgTable('PayrollLine', {
  id: text('id').primaryKey(),
  payrollId: text('payrollId')
    .notNull()
    .references(() => payrolls.id, { onDelete: 'cascade' }),
  // FK opcional al catálogo; se mantiene `concept` libre como fallback / texto histórico.
  conceptId: text('conceptId').references(() => payrollConcepts.id, { onDelete: 'set null' }),
  concept: text('concept').notNull(),
  type: text('type').notNull(),
  // Para cálculo por horas/unidades o porcentual.
  quantity: decimal('quantity', { precision: 12, scale: 4 }),
  rate: decimal('rate', { precision: 15, scale: 4 }),
  baseAmount: decimal('baseAmount', { precision: 15, scale: 2 }),
  amount: decimal('amount', { precision: 15, scale: 2 }).default('0').notNull(),
  accountId: text('accountId').references(() => chartOfAccounts.id, { onDelete: 'set null' }),
});

// ── RRHH AVANZADO (Plan 2) ────────────────────────────────────────────
// Catálogo configurable por empresa. Permite que la empresa defina sus
// tipos de ausencia/incidencia con su propia política (si requiere
// sustitución, si descuenta saldo, si afecta a la nómina, etc.).
export const incidentTypes = pgTable('IncidentType', {
  id: text('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  requiresSubstitution: boolean('requiresSubstitution').default(false).notNull(),
  affectsPayroll: boolean('affectsPayroll').default(false).notNull(),
  consumesLeaveBalance: boolean('consumesLeaveBalance').default(false).notNull(),
  requiresDocument: boolean('requiresDocument').default(false).notNull(),
  paid: boolean('paid').default(true).notNull(),
  color: text('color'),
  isActive: boolean('isActive').default(true).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

// Incidencia concreta de un empleado. Si su tipo requiere sustitución y
// solapa con un turno asignado, se dispara el flujo de `Substitution`.
// status: pending | approved | rejected | covered.
export const incidents = pgTable('Incident', {
  id: text('id').primaryKey(),
  employeeId: text('employeeId')
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  incidentTypeId: text('incidentTypeId')
    .notNull()
    .references(() => incidentTypes.id, { onDelete: 'restrict' }),
  startAt: timestamp('startAt').notNull(),
  endAt: timestamp('endAt'),
  status: text('status').default('pending').notNull(),
  documentUrl: text('documentUrl'),
  notes: text('notes'),
  createdBy: text('createdBy'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  approvedBy: text('approvedBy'),
  approvedAt: timestamp('approvedAt'),
});

// Sustitución asistida — propuesta y posible aceptación de un sustituto
// para cubrir un turno afectado por una incidencia.
// status: proposed | accepted | rejected.
export const substitutions = pgTable('Substitution', {
  id: text('id').primaryKey(),
  incidentId: text('incidentId')
    .notNull()
    .references(() => incidents.id, { onDelete: 'cascade' }),
  originalEmployeeId: text('originalEmployeeId')
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  substituteEmployeeId: text('substituteEmployeeId')
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  shiftAssignmentId: text('shiftAssignmentId'),
  status: text('status').default('proposed').notNull(),
  notifiedAt: timestamp('notifiedAt'),
  respondedAt: timestamp('respondedAt'),
  notes: text('notes'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

// Plantilla de turno por horas libres (no fija de 8h-15h, hora real).
export const shiftTemplates = pgTable('ShiftTemplate', {
  id: text('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  startTime: text('startTime').notNull(), // 'HH:mm'
  endTime: text('endTime').notNull(),
  breakMinutes: integer('breakMinutes').default(0).notNull(),
  // Turno partido opcional (segundo tramo). Si ambos están definidos,
  // al aplicar la plantilla se crean DOS shiftAssignments por día.
  secondStartTime: text('secondStartTime'),
  secondEndTime: text('secondEndTime'),
  color: text('color'),
  isActive: boolean('isActive').default(true).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

// Patrón de rotación cíclica (cycleWeeks semanas, slots = matriz
// week × dayOfWeek → shiftTemplateId).
export const shiftPatterns = pgTable('ShiftPattern', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  cycleWeeks: integer('cycleWeeks').default(1).notNull(),
  slots: jsonb('slots').default([]).notNull(),
  isActive: boolean('isActive').default(true).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

// Asignación de un patrón a un empleado, con offset (en qué semana del
// ciclo entra) y vigencia.
export const shiftPatternAssignments = pgTable('ShiftPatternAssignment', {
  id: text('id').primaryKey(),
  patternId: text('patternId')
    .notNull()
    .references(() => shiftPatterns.id, { onDelete: 'cascade' }),
  employeeId: text('employeeId')
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  weekOffset: integer('weekOffset').default(0).notNull(),
  validFrom: date('validFrom').notNull(),
  validTo: date('validTo'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

// Asignación materializada (fila real por empleado/día). El "expand" del
// patrón genera estas filas; modificarlas no rompe el patrón.
// status: scheduled | cancelled | substituted.
export const shiftAssignments = pgTable('ShiftAssignment', {
  id: text('id').primaryKey(),
  employeeId: text('employeeId')
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  startAt: timestamp('startAt').notNull(),
  endAt: timestamp('endAt').notNull(),
  breakMinutes: integer('breakMinutes').default(0).notNull(),
  shiftTemplateId: text('shiftTemplateId').references(() => shiftTemplates.id, {
    onDelete: 'set null',
  }),
  patternId: text('patternId').references(() => shiftPatterns.id, { onDelete: 'set null' }),
  status: text('status').default('scheduled').notNull(),
  substitutedFromId: text('substitutedFromId'),
  notes: text('notes'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

// Fichajes — un evento por entrada/salida/inicio-fin de pausa.
// kind: in | out | break_start | break_end.
// source: web | kiosk | admin.
export const timeclockEntries = pgTable('TimeclockEntry', {
  id: text('id').primaryKey(),
  employeeId: text('employeeId')
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  userId: text('userId'), // id del GlobalUser que registró (puede ser el propio empleado o un kiosko admin)
  kind: text('kind').notNull(),
  at: timestamp('at').defaultNow().notNull(),
  source: text('source').default('web').notNull(),
  latitude: decimal('latitude', { precision: 9, scale: 6 }),
  longitude: decimal('longitude', { precision: 9, scale: 6 }),
  device: text('device'),
  notes: text('notes'),
  // Tarea opcional a la que se imputa el fichaje (para sumar a actualHours).
  taskId: text('taskId'),
});

// Kioskos físicos compartidos. Cada kiosko se autentica con su token y
// los empleados marcan su PIN personal (Employee.kioskPin) para fichar.
export const timeclockKiosks = pgTable('TimeclockKiosk', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  location: text('location'),
  token: text('token').unique().notNull(),
  isActive: boolean('isActive').default(true).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export const leaves = pgTable('Leave', {
  id: text('id').primaryKey(),
  employeeId: text('employeeId')
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  startDate: date('startDate').notNull(),
  endDate: date('endDate').notNull(),
  days: decimal('days', { precision: 5, scale: 2 }),
  status: text('status').default('pending').notNull(),
  approvedBy: text('approvedBy'),
  notes: text('notes'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

// ── RRHH avanzado+ ────────────────────────────────────────────────
// Convenio colectivo de aplicación.
export const collectiveAgreements = pgTable('CollectiveAgreement', {
  id: text('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  sector: text('sector'),
  validFrom: date('validFrom'),
  validTo: date('validTo'),
  baseSalary: decimal('baseSalary', { precision: 15, scale: 2 }).default('0'),
  vacationDays: integer('vacationDays').default(22),
  weeklyHours: decimal('weeklyHours', { precision: 5, scale: 2 }).default('40'),
  documentUrl: text('documentUrl'),
  notes: text('notes'),
  isActive: boolean('isActive').default(true).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

// Ciclo de evaluación de desempeño (p.ej. Q1 2026, Anual 2026...).
export const evaluationCycles = pgTable('EvaluationCycle', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  startDate: date('startDate').notNull(),
  endDate: date('endDate').notNull(),
  status: text('status').default('draft').notNull(), // draft|active|closed
  notes: text('notes'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

// Catálogo de competencias. Reutilizable entre ciclos.
export const evaluationCompetencies = pgTable('EvaluationCompetency', {
  id: text('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  description: text('description'),
  weight: decimal('weight', { precision: 5, scale: 2 }).default('1'),
  scaleMax: integer('scaleMax').default(5).notNull(),
  isActive: boolean('isActive').default(true).notNull(),
});

// Una evaluación = un empleado dentro de un ciclo.
export const employeeEvaluations = pgTable('EmployeeEvaluation', {
  id: text('id').primaryKey(),
  cycleId: text('cycleId')
    .notNull()
    .references(() => evaluationCycles.id, { onDelete: 'cascade' }),
  employeeId: text('employeeId')
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  managerId: text('managerId').references(() => employees.id, { onDelete: 'set null' }),
  status: text('status').default('pending').notNull(), // pending|self_done|manager_done|closed
  selfReviewedAt: timestamp('selfReviewedAt'),
  managerReviewedAt: timestamp('managerReviewedAt'),
  finalScore: decimal('finalScore', { precision: 5, scale: 2 }),
  notes: text('notes'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

// Puntuación por competencia dentro de una evaluación.
export const employeeEvaluationScores = pgTable('EmployeeEvaluationScore', {
  id: text('id').primaryKey(),
  evaluationId: text('evaluationId')
    .notNull()
    .references(() => employeeEvaluations.id, { onDelete: 'cascade' }),
  competencyId: text('competencyId')
    .notNull()
    .references(() => evaluationCompetencies.id, { onDelete: 'cascade' }),
  scoreSelf: decimal('scoreSelf', { precision: 5, scale: 2 }),
  scoreManager: decimal('scoreManager', { precision: 5, scale: 2 }),
  comments: text('comments'),
});

// Objetivos SMART por empleado (opcionalmente ligados a un ciclo).
export const employeeObjectives = pgTable('EmployeeObjective', {
  id: text('id').primaryKey(),
  employeeId: text('employeeId')
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  cycleId: text('cycleId').references(() => evaluationCycles.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  targetMetric: text('targetMetric'),
  targetValue: decimal('targetValue', { precision: 15, scale: 2 }),
  achievedValue: decimal('achievedValue', { precision: 15, scale: 2 }),
  weight: decimal('weight', { precision: 5, scale: 2 }).default('1'),
  status: text('status').default('pending').notNull(), // pending|in_progress|achieved|missed
  dueDate: date('dueDate'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

// Regla de comisión: % o tramos sobre base (neto/bruto/margen).
export const commissionRules = pgTable('CommissionRule', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  scope: text('scope').default('employee').notNull(), // employee|department|all
  employeeId: text('employeeId').references(() => employees.id, { onDelete: 'cascade' }),
  departmentId: text('departmentId').references(() => departments.id, { onDelete: 'set null' }),
  basis: text('basis').default('net_amount').notNull(), // net_amount|gross_amount|margin
  kind: text('kind').default('flat_pct').notNull(), // flat_pct|tiered
  pct: decimal('pct', { precision: 6, scale: 3 }).default('0'),
  tiers: jsonb('tiers'),
  payrollConceptId: text('payrollConceptId').references(() => payrollConcepts.id, {
    onDelete: 'set null',
  }),
  validFrom: date('validFrom'),
  validTo: date('validTo'),
  isActive: boolean('isActive').default(true).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

// Acumulado por documento+empleado: una fila por venta atribuida.
// `paid` cuando se vuelca a una nómina.
export const commissionAccruals = pgTable('CommissionAccrual', {
  id: text('id').primaryKey(),
  employeeId: text('employeeId')
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  ruleId: text('ruleId').references(() => commissionRules.id, { onDelete: 'set null' }),
  periodYear: integer('periodYear').notNull(),
  periodMonth: integer('periodMonth').notNull(),
  sourceDocType: text('sourceDocType').notNull(), // SINV|SO|SDN
  sourceDocId: text('sourceDocId').notNull(),
  base: decimal('base', { precision: 15, scale: 2 }).default('0').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).default('0').notNull(),
  status: text('status').default('pending').notNull(), // pending|paid|cancelled
  payrollLineId: text('payrollLineId'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  paidAt: timestamp('paidAt'),
});

// Tareas — planificador ligero (Kanban + Gantt).
export const tasks = pgTable('Task', {
  id: text('id').primaryKey(),
  code: text('code').unique().notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('todo').notNull(), // backlog|todo|in_progress|blocked|done|cancelled
  priority: text('priority').default('normal').notNull(), // low|normal|high|urgent
  assigneeId: text('assigneeId').references(() => employees.id, { onDelete: 'set null' }),
  internalOrderId: text('internalOrderId').references(() => internalOrders.id, {
    onDelete: 'set null',
  }),
  departmentId: text('departmentId').references(() => departments.id, { onDelete: 'set null' }),
  startDate: date('startDate'),
  dueDate: date('dueDate'),
  startAt: timestamp('startAt'),
  endAt: timestamp('endAt'),
  estimatedHours: decimal('estimatedHours', { precision: 8, scale: 2 }),
  actualHours: decimal('actualHours', { precision: 8, scale: 2 }).default('0'),
  progress: integer('progress').default(0).notNull(),
  parentTaskId: text('parentTaskId'),
  notes: text('notes'),
  createdBy: text('createdBy'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  closedAt: timestamp('closedAt'),
});

// Dependencia entre tareas (FS por defecto, con lag opcional).
export const taskDependencies = pgTable('TaskDependency', {
  id: text('id').primaryKey(),
  predecessorId: text('predecessorId')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  successorId: text('successorId')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  kind: text('kind').default('finish_to_start').notNull(),
  lagDays: integer('lagDays').default(0).notNull(),
});

// Comentario corto en una tarea.
export const taskComments = pgTable('TaskComment', {
  id: text('id').primaryKey(),
  taskId: text('taskId')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  userId: text('userId'),
  body: text('body').notNull(),
  at: timestamp('at').defaultNow().notNull(),
});

// Reglas por cuenta: fuerzan o prohíben cada dimensión en asientos.
// Sin fila para una cuenta = todas las dimensiones son opcionales.
export const dimensionRules = pgTable('DimensionRule', {
  id: text('id').primaryKey(),
  accountId: text('accountId')
    .notNull()
    .unique()
    .references(() => chartOfAccounts.id, { onDelete: 'cascade' }),
  requiresCostCenter: boolean('requiresCostCenter').default(false).notNull(),
  requiresProfitCenter: boolean('requiresProfitCenter').default(false).notNull(),
  requiresInternalOrder: boolean('requiresInternalOrder').default(false).notNull(),
  forbidsCostCenter: boolean('forbidsCostCenter').default(false).notNull(),
  forbidsProfitCenter: boolean('forbidsProfitCenter').default(false).notNull(),
  forbidsInternalOrder: boolean('forbidsInternalOrder').default(false).notNull(),
});

// Series de Documentos
export const documentSeries = pgTable('DocumentSeries', {
  id: text('id').primaryKey(),
  name: text('name').unique().notNull(),
  description: text('description'),
  periodId: text('periodId')
    .notNull()
    .references(() => accountingPeriods.id),
  docType: text('docType').notNull(),
  firstNumber: integer('firstNumber').notNull(),
  nextNumber: integer('nextNumber').notNull(),
  lastNumber: integer('lastNumber').notNull(),
  prefix: text('prefix'),
  suffix: text('suffix'),
  isDefault: boolean('isDefault').default(false).notNull(),
  // Modo de numeración: 'AUTO' (auto-incremento desde nextNumber) o 'MANUAL'
  // (el número lo teclea el usuario al crear cada documento).
  numberingMode: text('numberingMode').default('AUTO').notNull(),
});

// Grupos de Impuestos
export const taxGroups = pgTable('TaxGroup', {
  id: text('id').primaryKey(),
  code: text('code').unique().notNull(),
  rate: decimal('rate', { precision: 5, scale: 2 }).notNull(),
});

// Listas de Precios
export const priceLists = pgTable('PriceList', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
});

export const itemPrices = pgTable(
  'ItemPrice',
  {
    id: text('id').primaryKey(),
    priceListId: text('priceListId')
      .notNull()
      .references(() => priceLists.id),
    itemId: text('itemId')
      .notNull()
      .references(() => items.id),
    price: decimal('price', { precision: 12, scale: 4 }).notNull(),
  },
  (t) => ({
    unq: unique().on(t.priceListId, t.itemId),
  }),
);

// Maestro de Artículos
export const items = pgTable('Item', {
  id: text('id').primaryKey(),
  code: text('code').unique().notNull(),
  /**
   * Código de barras imprimible (EAN-13/UPC/Code128). Independiente del `code`
   * interno: éste último es la referencia de inventario, mientras que `barcode`
   * es lo que se escanea en TPV o se imprime en una etiqueta de producto.
   * Nullable; índice único parcial sólo aplica cuando hay valor.
   */
  barcode: text('barcode'),
  name: text('name').notNull(),
  description: text('description'),
  uomId: text('uomId')
    .notNull()
    .references(() => unitsOfMeasure.id),
  categoryId: text('categoryId').references(() => categories.id),
  taxGroupId: text('taxGroupId').references(() => taxGroups.id),
  manageBy: text('manageBy').default('N').notNull(),
  basePrice: decimal('basePrice', { precision: 12, scale: 4 }).notNull(),
  stock: doublePrecision('stock').default(0).notNull(),
  minStock: doublePrecision('minStock').default(0).notNull(),
  defaultWarehouseId: text('defaultWarehouseId'),
  defaultZoneId: text('defaultZoneId'),
  /** `product` (default) | `box` (caja/embalaje). Se gestiona como cualquier
   *  item de stock pero se filtra aparte en la UI de empaquetado. */
  kind: text('kind').default('product').notNull(),
  boxLengthMm: integer('boxLengthMm'),
  boxWidthMm: integer('boxWidthMm'),
  boxHeightMm: integer('boxHeightMm'),
  boxMaxWeightKg: doublePrecision('boxMaxWeightKg'),
  boxTareWeightKg: doublePrecision('boxTareWeightKg'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

// Trazabilidad
export const itemBatches = pgTable('ItemBatch', {
  id: text('id').primaryKey(),
  batchNum: text('batchNum').notNull(),
  itemId: text('itemId')
    .notNull()
    .references(() => items.id),
  quantity: doublePrecision('quantity').default(0).notNull(),
  expiryDate: timestamp('expiryDate'),
});

export const itemSerials = pgTable('ItemSerial', {
  id: text('id').primaryKey(),
  serialNum: text('serialNum').unique().notNull(),
  itemId: text('itemId')
    .notNull()
    .references(() => items.id),
  status: text('status').default('A').notNull(),
});

// Almacenes
export const warehouseZones = pgTable('WarehouseZone', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  warehouseId: text('warehouseId').references(() => warehouses.id),
});

export const warehouses = pgTable('Warehouse', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  location: text('location'),
  isDefault: boolean('isDefault').default(false).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

export const itemWarehouseStocks = pgTable(
  'ItemWarehouseStock',
  {
    itemId: text('itemId')
      .notNull()
      .references(() => items.id),
    warehouseId: text('warehouseId')
      .notNull()
      .references(() => warehouses.id),
    stock: doublePrecision('stock').default(0).notNull(),
    updatedAt: timestamp('updatedAt').defaultNow().notNull(),
  },
  (t) => ({
    pk: unique().on(t.itemId, t.warehouseId),
  }),
);

export const itemZoneStocks = pgTable(
  'ItemZoneStock',
  {
    itemId: text('itemId')
      .notNull()
      .references(() => items.id),
    warehouseId: text('warehouseId')
      .notNull()
      .references(() => warehouses.id),
    zoneId: text('zoneId')
      .notNull()
      .references(() => warehouseZones.id),
    stock: doublePrecision('stock').default(0).notNull(),
    updatedAt: timestamp('updatedAt').defaultNow().notNull(),
  },
  (t) => ({
    pk: unique().on(t.itemId, t.warehouseId, t.zoneId),
  }),
);

/**
 * Cantidad de un lote/serie POR almacén — a diferencia de `itemBatches`
 * (cantidad global), esto permite saber en qué almacén concreto está cada
 * lote AHORA MISMO. Se mantiene con upserts por delta desde todos los flujos
 * que tocan lotes (traspasos, entradas/salidas, facturas y albaranes de venta
 * y compra, incluidas sus cancelaciones) — ver `StockPoster.ts`.
 */
export const itemBatchStocks = pgTable(
  'ItemBatchStock',
  {
    itemId: text('itemId')
      .notNull()
      .references(() => items.id),
    batchNum: text('batchNum').notNull(),
    warehouseId: text('warehouseId')
      .notNull()
      .references(() => warehouses.id),
    quantity: doublePrecision('quantity').default(0).notNull(),
    updatedAt: timestamp('updatedAt').defaultNow().notNull(),
  },
  (t) => ({
    pk: unique().on(t.itemId, t.batchNum, t.warehouseId),
  }),
);

export const unitsOfMeasure = pgTable('UnitOfMeasure', {
  id: text('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  baseValue: decimal('baseValue', { precision: 12, scale: 4 }).default('1.0000').notNull(),
  baseUomId: text('baseUomId').references((): any => unitsOfMeasure.id),
});

export const itemAlternativeUoms = pgTable('ItemAlternativeUom', {
  id: text('id').primaryKey(),
  itemId: text('itemId')
    .notNull()
    .references(() => items.id),
  uomId: text('uomId')
    .notNull()
    .references(() => unitsOfMeasure.id),
  factor: decimal('factor', { precision: 12, scale: 4 }).notNull(),
});

export const categories = pgTable('Category', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  codePrefix: text('codePrefix'),
  parentId: text('parentId').references((): any => categories.id),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

// --- VENTAS ---

export const salesOrders = pgTable('SalesOrder', {
  id: text('id').primaryKey(),
  seriesId: text('seriesId')
    .references(() => documentSeries.id)
    .notNull(),
  docNum: integer('docNum').notNull(),
  periodId: text('periodId')
    .references(() => accountingPeriods.id)
    .notNull(),
  partnerId: text('partnerId')
    .references(() => businessPartners.id)
    .notNull(),
  date: timestamp('date').notNull(),
  deliveryDate: timestamp('deliveryDate'),
  documentDate: timestamp('documentDate'),
  status: text('status').default('O').notNull(),
  billToAddress: text('billToAddress'),
  shipToAddress: text('shipToAddress'),
  warehouseId: text('warehouseId').references(() => warehouses.id),
  internalOrderId: text('internalOrderId').references(() => internalOrders.id, {
    onDelete: 'set null',
  }),
  subtotal: decimal('subtotal', { precision: 15, scale: 4 }).default('0').notNull(),
  taxTotal: decimal('taxTotal', { precision: 15, scale: 4 }).default('0').notNull(),
  total: decimal('total', { precision: 15, scale: 4 }).default('0').notNull(),
  taxBreakdown: text('taxBreakdown'),
  // Comercial asignado (para cálculo de comisiones).
  salesAgentId: text('salesAgentId'),
  createdBy: text('createdBy'),
  createdAt: timestamp('createdAt').defaultNow(),
  // Mig 063 — enlace al presupuesto de venta que originó el pedido.
  quoteId: text('quoteId'),
});

export const salesOrderLines = pgTable('SalesOrderLine', {
  id: text('id').primaryKey(),
  orderId: text('orderId')
    .references(() => salesOrders.id)
    .notNull(),
  lineNum: integer('lineNum').notNull(),
  itemId: text('itemId')
    .references(() => items.id)
    .notNull(),
  warehouseId: text('warehouseId').references(() => warehouses.id),
  zoneId: text('zoneId').references(() => warehouseZones.id),
  // OJO: la columna física en BD es "quantity" (común a todas las líneas de documento).
  // A nivel de app se expone como orderedQty para emparejar con deliveredQty.
  orderedQty: decimal('quantity', { precision: 12, scale: 4 }).notNull(),
  deliveredQty: decimal('deliveredQty', { precision: 12, scale: 4 }).default('0').notNull(),
  price: decimal('price', { precision: 15, scale: 4 }).notNull(),
  taxGroupId: text('taxGroupId').references(() => taxGroups.id),
  lineTotal: decimal('lineTotal', { precision: 15, scale: 4 }).notNull(),
  uomId: text('uomId').references(() => unitsOfMeasure.id),
  uomFactor: decimal('uomFactor', { precision: 12, scale: 4 }).default('1.0000'),
  pluginData: jsonb('pluginData').default({}),
  // Mig 032 — descuentos, retenciones, proyecto por línea
  description: text('description'),
  discountRate: decimal('discountRate', { precision: 5, scale: 2 }).default('0'),
  discountAmount: decimal('discountAmount', { precision: 15, scale: 4 }).default('0'),
  taxRate: decimal('taxRate', { precision: 5, scale: 2 }),
  taxAmount: decimal('taxAmount', { precision: 15, scale: 4 }),
  withholdingRate: decimal('withholdingRate', { precision: 5, scale: 2 }),
  withholdingAmount: decimal('withholdingAmount', { precision: 15, scale: 4 }),
  /** @deprecated Usar internalOrderId. Se conserva por compatibilidad. */
  projectId: text('projectId'),
  costCenterId: text('costCenterId'),
  profitCenterId: text('profitCenterId'),
  internalOrderId: text('internalOrderId'),
});

// Mig 063 — Presupuestos de venta. Clon de SalesOrder sin campos de entrega
// (no mueve ni reserva stock), con validez y ciclo O/A/R/X.
export const salesQuotes = pgTable('SalesQuote', {
  id: text('id').primaryKey(),
  seriesId: text('seriesId')
    .references(() => documentSeries.id)
    .notNull(),
  docNum: integer('docNum').notNull(),
  periodId: text('periodId')
    .references(() => accountingPeriods.id)
    .notNull(),
  partnerId: text('partnerId')
    .references(() => businessPartners.id)
    .notNull(),
  date: timestamp('date').notNull(),
  documentDate: timestamp('documentDate'),
  validUntil: timestamp('validUntil'),
  status: text('status').default('O').notNull(),
  billToAddress: text('billToAddress'),
  shipToAddress: text('shipToAddress'),
  internalOrderId: text('internalOrderId').references(() => internalOrders.id, {
    onDelete: 'set null',
  }),
  subtotal: decimal('subtotal', { precision: 15, scale: 4 }).default('0').notNull(),
  taxTotal: decimal('taxTotal', { precision: 15, scale: 4 }).default('0').notNull(),
  total: decimal('total', { precision: 15, scale: 4 }).default('0').notNull(),
  taxBreakdown: text('taxBreakdown'),
  salesAgentId: text('salesAgentId'),
  createdBy: text('createdBy'),
  createdAt: timestamp('createdAt').defaultNow(),
});

export const salesQuoteLines = pgTable('SalesQuoteLine', {
  id: text('id').primaryKey(),
  quoteId: text('quoteId')
    .references(() => salesQuotes.id)
    .notNull(),
  lineNum: integer('lineNum').notNull(),
  itemId: text('itemId')
    .references(() => items.id)
    .notNull(),
  quantity: decimal('quantity', { precision: 12, scale: 4 }).notNull(),
  price: decimal('price', { precision: 15, scale: 4 }).notNull(),
  taxGroupId: text('taxGroupId').references(() => taxGroups.id),
  lineTotal: decimal('lineTotal', { precision: 15, scale: 4 }).notNull(),
  uomId: text('uomId').references(() => unitsOfMeasure.id),
  uomFactor: decimal('uomFactor', { precision: 12, scale: 4 }).default('1.0000'),
  pluginData: jsonb('pluginData').default({}),
  description: text('description'),
  discountRate: decimal('discountRate', { precision: 5, scale: 2 }).default('0'),
  discountAmount: decimal('discountAmount', { precision: 15, scale: 4 }).default('0'),
  taxRate: decimal('taxRate', { precision: 5, scale: 2 }),
  taxAmount: decimal('taxAmount', { precision: 15, scale: 4 }),
  withholdingRate: decimal('withholdingRate', { precision: 5, scale: 2 }),
  withholdingAmount: decimal('withholdingAmount', { precision: 15, scale: 4 }),
  costCenterId: text('costCenterId'),
  profitCenterId: text('profitCenterId'),
  internalOrderId: text('internalOrderId'),
});

export const salesDeliveryNotes = pgTable('SalesDeliveryNote', {
  id: text('id').primaryKey(),
  seriesId: text('seriesId')
    .references(() => documentSeries.id)
    .notNull(),
  docNum: integer('docNum').notNull(),
  periodId: text('periodId')
    .references(() => accountingPeriods.id)
    .notNull(),
  partnerId: text('partnerId')
    .references(() => businessPartners.id)
    .notNull(),
  orderId: text('orderId').references(() => salesOrders.id),
  date: timestamp('date').notNull(),
  status: text('status').default('O').notNull(),
  billToAddress: text('billToAddress'),
  shipToAddress: text('shipToAddress'),
  warehouseId: text('warehouseId').references(() => warehouses.id),
  internalOrderId: text('internalOrderId').references(() => internalOrders.id, {
    onDelete: 'set null',
  }),
  subtotal: decimal('subtotal', { precision: 15, scale: 4 }).default('0').notNull(),
  taxTotal: decimal('taxTotal', { precision: 15, scale: 4 }).default('0').notNull(),
  total: decimal('total', { precision: 15, scale: 4 }).default('0').notNull(),
  taxBreakdown: text('taxBreakdown'),
  salesAgentId: text('salesAgentId'),
  createdBy: text('createdBy'),
  createdAt: timestamp('createdAt').defaultNow(),
});

export const salesDeliveryNoteLines = pgTable('SalesDeliveryNoteLine', {
  id: text('id').primaryKey(),
  deliveryId: text('deliveryId')
    .references(() => salesDeliveryNotes.id)
    .notNull(),
  lineNum: integer('lineNum').notNull(),
  itemId: text('itemId')
    .references(() => items.id)
    .notNull(),
  warehouseId: text('warehouseId').references(() => warehouses.id),
  zoneId: text('zoneId').references(() => warehouseZones.id),
  quantity: decimal('quantity', { precision: 12, scale: 4 }).notNull(),
  price: decimal('price', { precision: 15, scale: 4 }).notNull(),
  taxGroupId: text('taxGroupId').references(() => taxGroups.id),
  lineTotal: decimal('lineTotal', { precision: 15, scale: 4 }).notNull(),
  baseLine: integer('baseLine'),
  uomId: text('uomId').references(() => unitsOfMeasure.id),
  uomFactor: decimal('uomFactor', { precision: 12, scale: 4 }).default('1.0000'),
  pluginData: jsonb('pluginData').default({}),
  // Mig 032 — descuentos, retenciones, proyecto por línea
  description: text('description'),
  discountRate: decimal('discountRate', { precision: 5, scale: 2 }).default('0'),
  discountAmount: decimal('discountAmount', { precision: 15, scale: 4 }).default('0'),
  taxRate: decimal('taxRate', { precision: 5, scale: 2 }),
  taxAmount: decimal('taxAmount', { precision: 15, scale: 4 }),
  withholdingRate: decimal('withholdingRate', { precision: 5, scale: 2 }),
  withholdingAmount: decimal('withholdingAmount', { precision: 15, scale: 4 }),
  /** @deprecated Usar internalOrderId. Se conserva por compatibilidad. */
  projectId: text('projectId'),
  costCenterId: text('costCenterId'),
  profitCenterId: text('profitCenterId'),
  internalOrderId: text('internalOrderId'),
});

export const salesDeliveryNoteLineBatches = pgTable('SalesDeliveryNoteLineBatch', {
  id: text('id').primaryKey(),
  deliveryLineId: text('deliveryLineId')
    .notNull()
    .references(() => salesDeliveryNoteLines.id),
  batchNum: text('batchNum').notNull(),
  quantity: doublePrecision('quantity').default(1).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export const salesInvoices = pgTable('SalesInvoice', {
  id: text('id').primaryKey(),
  seriesId: text('seriesId')
    .references(() => documentSeries.id)
    .notNull(),
  docNum: integer('docNum').notNull(),
  periodId: text('periodId')
    .references(() => accountingPeriods.id)
    .notNull(),
  partnerId: text('partnerId')
    .references(() => businessPartners.id)
    .notNull(),
  date: timestamp('date').notNull(),
  status: text('status').default('O').notNull(),
  billToAddress: text('billToAddress'),
  shipToAddress: text('shipToAddress'),
  subtotal: decimal('subtotal', { precision: 15, scale: 4 }).default('0').notNull(),
  taxTotal: decimal('taxTotal', { precision: 15, scale: 4 }).default('0').notNull(),
  total: decimal('total', { precision: 15, scale: 4 }).default('0').notNull(),
  taxBreakdown: text('taxBreakdown'),
  salesAgentId: text('salesAgentId'),
  createdBy: text('createdBy'),
  createdAt: timestamp('createdAt').defaultNow(),
  // ── Lock al asentar (mig 032) ──────────────────────────────────
  isLocked: boolean('isLocked').default(false).notNull(),
  lockedAt: timestamp('lockedAt'),
  // ── Tipo de documento fiscal ──────────────────────────────────
  documentTypeId: text('documentTypeId'),
  // ── Fechas ────────────────────────────────────────────────────
  dueDate: date('dueDate'),
  supplyDate: date('supplyDate'),
  // ── Pago ──────────────────────────────────────────────────────
  paymentMethodId: text('paymentMethodId'),
  paymentTermId: text('paymentTermId'),
  paymentDueLines: jsonb('paymentDueLines').default([]),
  paymentStatus: text('paymentStatus').default('pending').notNull(),
  amountPaid: decimal('amountPaid', { precision: 15, scale: 4 }).default('0').notNull(),
  // ── Retenciones ───────────────────────────────────────────────
  withholdingRate: decimal('withholdingRate', { precision: 5, scale: 2 }),
  withholdingAmount: decimal('withholdingAmount', { precision: 15, scale: 4 }),
  // ── Rectificativa ─────────────────────────────────────────────
  rectifyRef: text('rectifyRef'),
  rectifyReason: text('rectifyReason'),
  rectifyType: text('rectifyType'),
  // ── Multi-divisa ──────────────────────────────────────────────
  currencyId: text('currencyId'),
  exchangeRate: decimal('exchangeRate', { precision: 12, scale: 6 }).default('1'),
  totalCurrency: decimal('totalCurrency', { precision: 15, scale: 4 }),
  // ── Direcciones normalizadas ──────────────────────────────────
  billingAddressId: text('billingAddressId'),
  shippingAddressId: text('shippingAddressId'),
  // ── Notas ─────────────────────────────────────────────────────
  notes: text('notes'),
  internalNotes: text('internalNotes'),
  // ── Fiscal genérico (plugin) ──────────────────────────────────
  fiscalHash: text('fiscalHash'),
  fiscalHashPrev: text('fiscalHashPrev'),
  fiscalStatus: text('fiscalStatus'),
  fiscalSentAt: timestamp('fiscalSentAt'),
  fiscalRef: text('fiscalRef'),
  // ── Proyecto ──────────────────────────────────────────────────
  /** @deprecated Usar internalOrderId. Se conserva por compatibilidad. */
  projectId: text('projectId'),
  costCenterId: text('costCenterId'),
  profitCenterId: text('profitCenterId'),
  internalOrderId: text('internalOrderId'),
});

export const salesInvoiceLines = pgTable('SalesInvoiceLine', {
  id: text('id').primaryKey(),
  invoiceId: text('invoiceId')
    .references(() => salesInvoices.id)
    .notNull(),
  lineNum: integer('lineNum').notNull(),
  itemId: text('itemId')
    .references(() => items.id)
    .notNull(),
  warehouseId: text('warehouseId').references(() => warehouses.id),
  zoneId: text('zoneId').references(() => warehouseZones.id),
  quantity: decimal('quantity', { precision: 12, scale: 4 }).notNull(),
  price: decimal('price', { precision: 15, scale: 4 }).notNull(),
  taxGroupId: text('taxGroupId').references(() => taxGroups.id),
  lineTotal: decimal('lineTotal', { precision: 15, scale: 4 }).notNull(),
  baseType: text('baseType'),
  baseId: text('baseId'),
  baseLine: integer('baseLine'),
  uomId: text('uomId').references(() => unitsOfMeasure.id),
  uomFactor: decimal('uomFactor', { precision: 12, scale: 4 }).default('1.0000'),
  pluginData: jsonb('pluginData').default({}),
  // Mig 032 — descuentos, retenciones, proyecto por línea
  description: text('description'),
  discountRate: decimal('discountRate', { precision: 5, scale: 2 }).default('0'),
  discountAmount: decimal('discountAmount', { precision: 15, scale: 4 }).default('0'),
  taxRate: decimal('taxRate', { precision: 5, scale: 2 }),
  taxAmount: decimal('taxAmount', { precision: 15, scale: 4 }),
  withholdingRate: decimal('withholdingRate', { precision: 5, scale: 2 }),
  withholdingAmount: decimal('withholdingAmount', { precision: 15, scale: 4 }),
  /** @deprecated Usar internalOrderId. Se conserva por compatibilidad. */
  projectId: text('projectId'),
  costCenterId: text('costCenterId'),
  profitCenterId: text('profitCenterId'),
  internalOrderId: text('internalOrderId'),
});

export const salesInvoiceLineBatches = pgTable('SalesInvoiceLineBatch', {
  id: text('id').primaryKey(),
  invoiceLineId: text('invoiceLineId')
    .notNull()
    .references(() => salesInvoiceLines.id),
  batchNum: text('batchNum').notNull(),
  quantity: doublePrecision('quantity').default(1).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

// ======= COMPRAS =======

export const purchaseOrders = pgTable('PurchaseOrder', {
  id: text('id').primaryKey(),
  seriesId: text('seriesId')
    .references(() => documentSeries.id)
    .notNull(),
  docNum: integer('docNum').notNull(),
  periodId: text('periodId')
    .references(() => accountingPeriods.id)
    .notNull(),
  partnerId: text('partnerId')
    .references(() => businessPartners.id)
    .notNull(),
  date: timestamp('date').notNull(),
  deliveryDate: timestamp('deliveryDate'),
  documentDate: timestamp('documentDate'),
  status: text('status').default('O').notNull(),
  billToAddress: text('billToAddress'),
  shipToAddress: text('shipToAddress'),
  warehouseId: text('warehouseId').references(() => warehouses.id),
  internalOrderId: text('internalOrderId').references(() => internalOrders.id, {
    onDelete: 'set null',
  }),
  subtotal: decimal('subtotal', { precision: 15, scale: 4 }).default('0').notNull(),
  taxTotal: decimal('taxTotal', { precision: 15, scale: 4 }).default('0').notNull(),
  total: decimal('total', { precision: 15, scale: 4 }).default('0').notNull(),
  taxBreakdown: text('taxBreakdown'),
  createdBy: text('createdBy'),
  createdAt: timestamp('createdAt').defaultNow(),
});

export const purchaseOrderLines = pgTable('PurchaseOrderLine', {
  id: text('id').primaryKey(),
  orderId: text('orderId')
    .references(() => purchaseOrders.id)
    .notNull(),
  lineNum: integer('lineNum').notNull(),
  itemId: text('itemId')
    .references(() => items.id)
    .notNull(),
  warehouseId: text('warehouseId').references(() => warehouses.id),
  zoneId: text('zoneId').references(() => warehouseZones.id),
  batchNum: text('batchNum'),
  // OJO: la columna física en BD es "quantity" (común a todas las líneas de documento).
  // A nivel de app se expone como orderedQty para emparejar con receivedQty.
  orderedQty: decimal('quantity', { precision: 12, scale: 4 }).notNull(),
  receivedQty: decimal('receivedQty', { precision: 12, scale: 4 }).default('0').notNull(),
  price: decimal('price', { precision: 15, scale: 4 }).notNull(),
  taxGroupId: text('taxGroupId').references(() => taxGroups.id),
  lineTotal: decimal('lineTotal', { precision: 15, scale: 4 }).notNull(),
  uomId: text('uomId').references(() => unitsOfMeasure.id),
  uomFactor: decimal('uomFactor', { precision: 12, scale: 4 }).default('1.0000'),
  pluginData: jsonb('pluginData').default({}),
  // Mig 032 — descuentos, retenciones, proyecto por línea
  description: text('description'),
  discountRate: decimal('discountRate', { precision: 5, scale: 2 }).default('0'),
  discountAmount: decimal('discountAmount', { precision: 15, scale: 4 }).default('0'),
  taxRate: decimal('taxRate', { precision: 5, scale: 2 }),
  taxAmount: decimal('taxAmount', { precision: 15, scale: 4 }),
  withholdingRate: decimal('withholdingRate', { precision: 5, scale: 2 }),
  withholdingAmount: decimal('withholdingAmount', { precision: 15, scale: 4 }),
  /** @deprecated Usar internalOrderId. Se conserva por compatibilidad. */
  projectId: text('projectId'),
  costCenterId: text('costCenterId'),
  profitCenterId: text('profitCenterId'),
  internalOrderId: text('internalOrderId'),
});

export const purchaseDeliveryNotes = pgTable('PurchaseDeliveryNote', {
  id: text('id').primaryKey(),
  seriesId: text('seriesId')
    .references(() => documentSeries.id)
    .notNull(),
  docNum: integer('docNum').notNull(),
  periodId: text('periodId')
    .references(() => accountingPeriods.id)
    .notNull(),
  partnerId: text('partnerId')
    .references(() => businessPartners.id)
    .notNull(),
  orderId: text('orderId').references(() => purchaseOrders.id),
  date: timestamp('date').notNull(),
  status: text('status').default('O').notNull(),
  billToAddress: text('billToAddress'),
  shipToAddress: text('shipToAddress'),
  warehouseId: text('warehouseId').references(() => warehouses.id),
  internalOrderId: text('internalOrderId').references(() => internalOrders.id, {
    onDelete: 'set null',
  }),
  subtotal: decimal('subtotal', { precision: 15, scale: 4 }).default('0').notNull(),
  taxTotal: decimal('taxTotal', { precision: 15, scale: 4 }).default('0').notNull(),
  total: decimal('total', { precision: 15, scale: 4 }).default('0').notNull(),
  taxBreakdown: text('taxBreakdown'),
  createdBy: text('createdBy'),
  createdAt: timestamp('createdAt').defaultNow(),
});

export const purchaseDeliveryNoteLines = pgTable('PurchaseDeliveryNoteLine', {
  id: text('id').primaryKey(),
  deliveryId: text('deliveryId')
    .references(() => purchaseDeliveryNotes.id)
    .notNull(),
  lineNum: integer('lineNum').notNull(),
  itemId: text('itemId')
    .references(() => items.id)
    .notNull(),
  warehouseId: text('warehouseId').references(() => warehouses.id),
  zoneId: text('zoneId').references(() => warehouseZones.id),
  batchNum: text('batchNum'),
  quantity: decimal('quantity', { precision: 12, scale: 4 }).notNull(),
  price: decimal('price', { precision: 15, scale: 4 }).notNull(),
  taxGroupId: text('taxGroupId').references(() => taxGroups.id),
  lineTotal: decimal('lineTotal', { precision: 15, scale: 4 }).notNull(),
  baseLine: integer('baseLine'),
  uomId: text('uomId').references(() => unitsOfMeasure.id),
  uomFactor: decimal('uomFactor', { precision: 12, scale: 4 }).default('1.0000'),
  pluginData: jsonb('pluginData').default({}),
  // Mig 032 — descuentos, retenciones, proyecto por línea
  description: text('description'),
  discountRate: decimal('discountRate', { precision: 5, scale: 2 }).default('0'),
  discountAmount: decimal('discountAmount', { precision: 15, scale: 4 }).default('0'),
  taxRate: decimal('taxRate', { precision: 5, scale: 2 }),
  taxAmount: decimal('taxAmount', { precision: 15, scale: 4 }),
  withholdingRate: decimal('withholdingRate', { precision: 5, scale: 2 }),
  withholdingAmount: decimal('withholdingAmount', { precision: 15, scale: 4 }),
  /** @deprecated Usar internalOrderId. Se conserva por compatibilidad. */
  projectId: text('projectId'),
  costCenterId: text('costCenterId'),
  profitCenterId: text('profitCenterId'),
  internalOrderId: text('internalOrderId'),
});

export const purchaseInvoices = pgTable('PurchaseInvoice', {
  id: text('id').primaryKey(),
  seriesId: text('seriesId')
    .references(() => documentSeries.id)
    .notNull(),
  docNum: integer('docNum').notNull(),
  periodId: text('periodId')
    .references(() => accountingPeriods.id)
    .notNull(),
  partnerId: text('partnerId')
    .references(() => businessPartners.id)
    .notNull(),
  date: timestamp('date').notNull(),
  status: text('status').default('O').notNull(),
  billToAddress: text('billToAddress'),
  shipToAddress: text('shipToAddress'),
  subtotal: decimal('subtotal', { precision: 15, scale: 4 }).default('0').notNull(),
  taxTotal: decimal('taxTotal', { precision: 15, scale: 4 }).default('0').notNull(),
  total: decimal('total', { precision: 15, scale: 4 }).default('0').notNull(),
  taxBreakdown: text('taxBreakdown'),
  createdBy: text('createdBy'),
  createdAt: timestamp('createdAt').defaultNow(),
  // ── Mig 032: mismos campos que SalesInvoice ───────────────────
  isLocked: boolean('isLocked').default(false).notNull(),
  lockedAt: timestamp('lockedAt'),
  documentTypeId: text('documentTypeId'),
  dueDate: date('dueDate'),
  supplyDate: date('supplyDate'),
  paymentMethodId: text('paymentMethodId'),
  paymentTermId: text('paymentTermId'),
  paymentDueLines: jsonb('paymentDueLines').default([]),
  paymentStatus: text('paymentStatus').default('pending').notNull(),
  amountPaid: decimal('amountPaid', { precision: 15, scale: 4 }).default('0').notNull(),
  withholdingRate: decimal('withholdingRate', { precision: 5, scale: 2 }),
  withholdingAmount: decimal('withholdingAmount', { precision: 15, scale: 4 }),
  rectifyRef: text('rectifyRef'),
  rectifyReason: text('rectifyReason'),
  rectifyType: text('rectifyType'),
  currencyId: text('currencyId'),
  exchangeRate: decimal('exchangeRate', { precision: 12, scale: 6 }).default('1'),
  totalCurrency: decimal('totalCurrency', { precision: 15, scale: 4 }),
  billingAddressId: text('billingAddressId'),
  shippingAddressId: text('shippingAddressId'),
  notes: text('notes'),
  internalNotes: text('internalNotes'),
  fiscalHash: text('fiscalHash'),
  fiscalHashPrev: text('fiscalHashPrev'),
  fiscalStatus: text('fiscalStatus'),
  fiscalSentAt: timestamp('fiscalSentAt'),
  fiscalRef: text('fiscalRef'),
  /** @deprecated Usar internalOrderId. Se conserva por compatibilidad. */
  projectId: text('projectId'),
  costCenterId: text('costCenterId'),
  profitCenterId: text('profitCenterId'),
  internalOrderId: text('internalOrderId'),
});

export const purchaseInvoiceLines = pgTable('PurchaseInvoiceLine', {
  id: text('id').primaryKey(),
  invoiceId: text('invoiceId')
    .references(() => purchaseInvoices.id)
    .notNull(),
  lineNum: integer('lineNum').notNull(),
  itemId: text('itemId')
    .references(() => items.id)
    .notNull(),
  warehouseId: text('warehouseId').references(() => warehouses.id),
  zoneId: text('zoneId').references(() => warehouseZones.id),
  quantity: decimal('quantity', { precision: 12, scale: 4 }).notNull(),
  price: decimal('price', { precision: 15, scale: 4 }).notNull(),
  taxGroupId: text('taxGroupId').references(() => taxGroups.id),
  lineTotal: decimal('lineTotal', { precision: 15, scale: 4 }).notNull(),
  baseType: text('baseType'),
  baseId: text('baseId'),
  uomId: text('uomId').references(() => unitsOfMeasure.id),
  uomFactor: decimal('uomFactor', { precision: 12, scale: 4 }).default('1.0000'),
  baseLine: integer('baseLine'),
  // Mig 032 — descuentos, retenciones, proyecto por línea
  description: text('description'),
  discountRate: decimal('discountRate', { precision: 5, scale: 2 }).default('0'),
  discountAmount: decimal('discountAmount', { precision: 15, scale: 4 }).default('0'),
  taxRate: decimal('taxRate', { precision: 5, scale: 2 }),
  taxAmount: decimal('taxAmount', { precision: 15, scale: 4 }),
  withholdingRate: decimal('withholdingRate', { precision: 5, scale: 2 }),
  withholdingAmount: decimal('withholdingAmount', { precision: 15, scale: 4 }),
  /** @deprecated Usar internalOrderId. Se conserva por compatibilidad. */
  projectId: text('projectId'),
  costCenterId: text('costCenterId'),
  profitCenterId: text('profitCenterId'),
  internalOrderId: text('internalOrderId'),
});

export const purchaseDeliveryNoteLineBatches = pgTable('PurchaseDeliveryNoteLineBatch', {
  id: text('id').primaryKey(),
  deliveryLineId: text('deliveryLineId')
    .notNull()
    .references(() => purchaseDeliveryNoteLines.id),
  batchNum: text('batchNum').notNull(),
  quantity: doublePrecision('quantity').default(1).notNull(),
  expiryDate: timestamp('expiryDate'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export const purchaseInvoiceLineBatches = pgTable('PurchaseInvoiceLineBatch', {
  id: text('id').primaryKey(),
  invoiceLineId: text('invoiceLineId')
    .notNull()
    .references(() => purchaseInvoiceLines.id),
  batchNum: text('batchNum').notNull(),
  quantity: doublePrecision('quantity').default(1).notNull(),
  expiryDate: timestamp('expiryDate'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export const documentTemplates = pgTable('DocumentTemplate', {
  id: text('id').primaryKey(),
  docType: text('docType').notNull(),
  name: text('name').notNull(),
  html: text('html').notNull(),
  isDefault: boolean('isDefault').default(false).notNull(),
  canvasLayout: jsonb('canvasLayout'),
  layoutVersion: integer('layoutVersion').default(1).notNull(),
  legacyHtml: boolean('legacyHtml').default(true).notNull(),
  // Marca la fila SEMBRADA por el sistema (MigrationManager.seedDefaultTemplates/
  // resyncDefaultTemplates), distinta de `isDefault` (qué plantilla se usa
  // cuando no se pide un templateId concreto). Antes resyncDefaultTemplates
  // regeneraba el html de la fila `isDefault=true` en cada reinicio del
  // servidor — si el usuario promovía SU plantilla custom a predeterminada,
  // esa fila se sobreescribía con el genérico de @openfactu/pdf y el diseño
  // se perdía. Ahora solo se regeneran las filas `isFactoryDefault=true`,
  // nunca una plantilla custom aunque esté marcada como predeterminada.
  isFactoryDefault: boolean('isFactoryDefault').default(false).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

export const auditLogs = pgTable('AuditLog', {
  id: text('id').primaryKey(),
  tenantId: text('tenantId')
    .notNull()
    .references(() => tenants.id),
  entityType: text('entityType').notNull(),
  entityId: text('entityId').notNull(),
  action: text('action').notNull(),
  userId: text('userId').references(() => globalUsers.id),
  oldValue: jsonb('oldValue'),
  newValue: jsonb('newValue'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

/**
 * Adjuntos genéricos por tenant. La tabla se crea en la migración tenant
 * 030_attachments.sql con índices por (entityType, entityId) y por uploadedAt.
 * El backend físico (local/gdrive/onedrive) lo decide el StorageResolver
 * según la config del tenant — pero `provider` aquí recuerda con cuál se subió.
 */
export const attachments = pgTable('Attachment', {
  id: text('id').primaryKey(),
  entityType: text('entityType').notNull(),
  entityId: text('entityId').notNull(),
  fileName: text('fileName').notNull(),
  mime: text('mime').notNull(),
  size: bigint('size', { mode: 'number' }).notNull(),
  provider: text('provider').notNull(),
  externalId: text('externalId').notNull(),
  uploadedBy: text('uploadedBy'),
  uploadedAt: timestamp('uploadedAt').defaultNow().notNull(),
  deletedAt: timestamp('deletedAt'),
  /** Organización de la biblioteca de medios del módulo Website (migración 065).
   *  Sin uso en el resto de consumidores de Attachment. */
  folder: text('folder'),
  tags: text('tags').array(),
});

/**
 * Notificaciones in-app por tenant (migración 031_notifications.sql).
 * Una fila = una notificación para UN usuario. El mismo evento puede generar
 * N filas (una por destinatario) para que `readAt` sea per-user.
 */
export const notifications = pgTable('Notification', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  level: text('level').notNull().default('info'), // info | warn | error | success
  link: text('link'),
  readAt: timestamp('readAt'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

// Mig 062 — Historial de backups (manuales y programados) del tenant
export const backupRuns = pgTable('BackupRun', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull().default('scheduled'), // scheduled | manual
  status: text('status').notNull().default('running'), // running | ok | error
  destination: text('destination').notNull(), // local | gdrive | onedrive
  fileName: text('fileName'),
  externalId: text('externalId'), // ruta relativa (local) o fileId/itemId (cloud)
  sizeBytes: bigint('sizeBytes', { mode: 'number' }),
  includeUploads: boolean('includeUploads').notNull().default(true),
  error: text('error'),
  createdByUserId: text('createdByUserId'),
  startedAt: timestamp('startedAt').defaultNow().notNull(),
  finishedAt: timestamp('finishedAt'),
});

// ════════════════════════════════════════════════════════════════════
// Mig 032 — Fiscalización, pagos, contactos
// ════════════════════════════════════════════════════════════════════

export const currencies = pgTable('Currency', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  symbol: text('symbol').notNull(),
  decimals: integer('decimals').default(2).notNull(),
  exchangeRate: decimal('exchangeRate', { precision: 12, scale: 6 }).default('1').notNull(),
  isBase: boolean('isBase').default(false).notNull(),
  isActive: boolean('isActive').default(true).notNull(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});

export const documentTypes = pgTable('DocumentType', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  pluginId: text('pluginId'),
  docCategory: text('docCategory').notNull(),
  isRectify: boolean('isRectify').default(false).notNull(),
  isActive: boolean('isActive').default(true).notNull(),
  sortOrder: integer('sortOrder').default(0),
  createdAt: timestamp('createdAt').defaultNow(),
});

export const paymentMethods = pgTable('PaymentMethod', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  pluginId: text('pluginId'),
  isActive: boolean('isActive').default(true).notNull(),
});

export const paymentTerms = pgTable('PaymentTerm', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  lines: jsonb('lines').default([]).notNull(),
  isActive: boolean('isActive').default(true).notNull(),
});

export const contacts = pgTable('Contact', {
  id: text('id').primaryKey(),
  partnerId: text('partnerId')
    .references(() => businessPartners.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  role: text('role'),
  email: text('email'),
  phone: text('phone'),
  mobile: text('mobile'),
  isMain: boolean('isMain').default(false).notNull(),
  notes: text('notes'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});

export const payments = pgTable('Payment', {
  id: text('id').primaryKey(),
  salesInvoiceId: text('salesInvoiceId').references(() => salesInvoices.id, {
    onDelete: 'cascade',
  }),
  purchaseInvoiceId: text('purchaseInvoiceId').references(() => purchaseInvoices.id, {
    onDelete: 'cascade',
  }),
  date: date('date').notNull(),
  amount: decimal('amount', { precision: 15, scale: 4 }).notNull(),
  currencyId: text('currencyId').references(() => currencies.id),
  exchangeRate: decimal('exchangeRate', { precision: 12, scale: 6 }).default('1'),
  amountBase: decimal('amountBase', { precision: 15, scale: 4 }),
  paymentMethodId: text('paymentMethodId').references(() => paymentMethods.id),
  reference: text('reference'),
  notes: text('notes'),
  source: text('source').default('manual'),
  sourceRef: text('sourceRef'),
  createdBy: text('createdBy'),
  createdAt: timestamp('createdAt').defaultNow(),
});

// ────────────────────────────────────────────────────────────────
// User modules — módulos top-level del menú creados desde la UI
// ────────────────────────────────────────────────────────────────
export const userModules = pgTable('UserModule', {
  id: text('id').primaryKey(),
  tenantId: text('tenantId').notNull(),
  label: text('label').notNull(),
  iconName: text('iconName').default('Folder').notNull(),
  moduleOrder: integer('moduleOrder').default(100).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

// ────────────────────────────────────────────────────────────────
// Automations — reglas que se ejecutan en respuesta a un trigger
// ────────────────────────────────────────────────────────────────
export const automations = pgTable('Automation', {
  id: text('id').primaryKey(),
  tenantId: text('tenantId').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  enabled: boolean('enabled').default(true).notNull(),
  /** `schedule` | `event` | `manual`. */
  triggerType: text('triggerType').notNull(),
  triggerConfig: jsonb('triggerConfig'),
  /** `email` | `webhook` | `notification`. */
  actionType: text('actionType').notNull(),
  actionConfig: jsonb('actionConfig'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

export const automationRuns = pgTable('AutomationRun', {
  id: text('id').primaryKey(),
  automationId: text('automationId').notNull(),
  tenantId: text('tenantId').notNull(),
  status: text('status').notNull(),
  startedAt: timestamp('startedAt').defaultNow().notNull(),
  finishedAt: timestamp('finishedAt'),
  durationMs: integer('durationMs'),
  outputText: text('outputText'),
  errorText: text('errorText'),
  triggerSource: text('triggerSource'),
  contextJson: jsonb('contextJson'),
});

// ────────────────────────────────────────────────────────────────
// Shipments — seguimiento logístico propio
// ────────────────────────────────────────────────────────────────
export const shipments = pgTable('Shipment', {
  id: text('id').primaryKey(),
  /** Albarán de venta origen (opcional). */
  deliveryNoteId: text('deliveryNoteId'),
  /** Transportista libre: 'seur', 'correos', 'propio'... */
  carrier: text('carrier').default('propio').notNull(),
  /** Opcional — referencia a una CarrierAccount concreta. */
  carrierAccountId: text('carrierAccountId'),
  trackingNumber: text('trackingNumber'),
  /** `pending|in_transit|out_for_delivery|delivered|exception|returned|cancelled` */
  status: text('status').default('pending').notNull(),
  /**
   * Estado canónico del ciclo de vida logístico (preparación → despacho).
   * Valores: `draft|picking|packed|ready|dispatched|in_transit|delivered|
   * receiving|received|exception|returned|cancelled`.
   * Coexiste con `status` (legacy) durante la migración.
   */
  preparationStatus: text('preparationStatus').default('draft').notNull(),
  /** Documento origen: 'SDN' (Sales DN) o 'PDN' (Purchase DN). */
  sourceDocType: text('sourceDocType'),
  sourceDocId: text('sourceDocId'),
  /** Pedido comercial raíz: 'SO' o 'PO'. */
  sourceOrderType: text('sourceOrderType'),
  sourceOrderId: text('sourceOrderId'),
  preparedAt: timestamp('preparedAt'),
  preparedByUserId: text('preparedByUserId'),
  dispatchedAt: timestamp('dispatchedAt'),
  receivedAt: timestamp('receivedAt'),
  driverName: text('driverName'),
  driverPhone: text('driverPhone'),
  vehiclePlate: text('vehiclePlate'),
  /** Token público para reportar posición desde el dispositivo del conductor
   *  (aplicación móvil, tracker GPS, script externo, etc.). */
  reportToken: text('reportToken').unique().notNull(),
  /** Destino — dirección libre + coordenadas opcionales. */
  destinationAddress: text('destinationAddress'),
  destinationLat: doublePrecision('destinationLat'),
  destinationLng: doublePrecision('destinationLng'),
  /** Datos del destinatario — rellenables directamente cuando el envío no
   *  viene de un albarán (modo logística standalone). Si están vacíos,
   *  `resolveRecipientEmail` cae al partner de la delivery note. */
  recipientName: text('recipientName'),
  recipientEmail: text('recipientEmail'),
  recipientPhone: text('recipientPhone'),
  /** `delivery` (por defecto) o `pickup_return` — recogida de devolución
   *  sin envío previo. En ese caso el origen es la dirección del cliente
   *  y el destino es `returnWarehouseId`. */
  kind: text('kind').default('delivery').notNull(),
  returnWarehouseId: text('returnWarehouseId'),
  /** Última posición conocida, denormalizada para listados rápidos. */
  lastLat: doublePrecision('lastLat'),
  lastLng: doublePrecision('lastLng'),
  lastLocationAt: timestamp('lastLocationAt'),
  estimatedDelivery: timestamp('estimatedDelivery'),
  deliveredAt: timestamp('deliveredAt'),
  notes: text('notes'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

/**
 * Tarea atómica de preparación/recepción de una línea de un albarán (SDN o PDN).
 * Se crea al pulsar "Preparar" sobre un albarán y se va actualizando conforme
 * el operario recoge cantidades o verifica recepción.
 */
export const pickingTasks = pgTable('PickingTask', {
  id: text('id').primaryKey(),
  /** 'SDN' (outbound) | 'PDN' (inbound). */
  docType: text('docType').notNull(),
  docId: text('docId').notNull(),
  docLineId: text('docLineId'),
  itemId: text('itemId'),
  warehouseId: text('warehouseId'),
  zoneId: text('zoneId'),
  batchNumber: text('batchNumber'),
  requestedQty: doublePrecision('requestedQty').notNull(),
  pickedQty: doublePrecision('pickedQty').default(0).notNull(),
  /** `pending|partial|done|missing` */
  status: text('status').default('pending').notNull(),
  shipmentId: text('shipmentId'),
  assignedUserId: text('assignedUserId'),
  pickedByUserId: text('pickedByUserId'),
  pickedAt: timestamp('pickedAt'),
  notes: text('notes'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

/** Eventos en el ciclo de vida del envío (cambios de estado, incidencias). */
export const shipmentEvents = pgTable('ShipmentEvent', {
  id: text('id').primaryKey(),
  shipmentId: text('shipmentId')
    .notNull()
    .references(() => shipments.id, { onDelete: 'cascade' }),
  /** `status_change|incident|note|photo` */
  kind: text('kind').default('note').notNull(),
  status: text('status'),
  description: text('description'),
  location: text('location'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

/** Trail de posiciones reportadas por el dispositivo del conductor. */
export const shipmentPositions = pgTable('ShipmentPosition', {
  id: text('id').primaryKey(),
  shipmentId: text('shipmentId')
    .notNull()
    .references(() => shipments.id, { onDelete: 'cascade' }),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  /** Velocidad en km/h si el dispositivo la reporta. */
  speedKmh: doublePrecision('speedKmh'),
  heading: doublePrecision('heading'),
  accuracyMeters: doublePrecision('accuracyMeters'),
  reportedAt: timestamp('reportedAt').defaultNow().notNull(),
});

// ── Acopios (staging areas) ──────────────────────────────────────
/**
 * Plataformas ajenas — ubicaciones logísticas que no son ni tu almacén ni
 * instalación de un cliente concreto: cross-docks, naves alquiladas,
 * plataformas compartidas, hubs de transportistas. Se usan como catálogo
 * para acopios neutros (`StagingArea.platformId`).
 */
export const externalPlatforms = pgTable('ExternalPlatform', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  address: text('address'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  /** Horario libre (texto) — "L-V 8-18, S 8-14" o similar. */
  openingHours: text('openingHours'),
  contactName: text('contactName'),
  contactPhone: text('contactPhone'),
  contactEmail: text('contactEmail'),
  notes: text('notes'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  archivedAt: timestamp('archivedAt'),
});

export const stagingAreas = pgTable('StagingArea', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  /** Si el acopio vive dentro de un almacén concreto. */
  warehouseId: text('warehouseId'),
  /** Cliente dueño del acopio (consignación / stock en casa del cliente). */
  partnerId: text('partnerId'),
  /** Plataforma ajena (cross-dock, nave alquilada, hub compartido). */
  platformId: text('platformId'),
  address: text('address'),
  /** Coordenadas geográficas — se geocodifican al crear/editar si hay address. */
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  notes: text('notes'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

/** Artículos asociados a un acopio. `expectedQty` es opcional (nivel objetivo). */
export const stagingAreaItems = pgTable('StagingAreaItem', {
  id: text('id').primaryKey(),
  stagingAreaId: text('stagingAreaId')
    .notNull()
    .references(() => stagingAreas.id, { onDelete: 'cascade' }),
  itemId: text('itemId')
    .notNull()
    .references(() => items.id, { onDelete: 'cascade' }),
  expectedQty: doublePrecision('expectedQty'),
  notes: text('notes'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

// ── Paquetes (cajas empaquetadas con contenido) ─────────────────
export const packages = pgTable('Package', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  /** Albarán origen (opcional). */
  deliveryNoteId: text('deliveryNoteId'),
  /** Envío al que pertenece (opcional — puede estar en un acopio sin envío). */
  shipmentId: text('shipmentId'),
  /** Caja usada — referencia a `Item.kind='box'`. */
  boxItemId: text('boxItemId').references(() => items.id, { onDelete: 'set null' }),
  stagingAreaId: text('stagingAreaId').references(() => stagingAreas.id, { onDelete: 'set null' }),
  /** `open|sealed|shipped|delivered|returned` */
  status: text('status').default('open').notNull(),
  weightKg: doublePrecision('weightKg'),
  notes: text('notes'),
  /** Trazabilidad de preparación — quién/cuándo terminó el picking de esta caja. */
  pickedAt: timestamp('pickedAt'),
  pickedByUserId: text('pickedByUserId'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  sealedAt: timestamp('sealedAt'),
});

export const packageLines = pgTable('PackageLine', {
  id: text('id').primaryKey(),
  packageId: text('packageId')
    .notNull()
    .references(() => packages.id, { onDelete: 'cascade' }),
  itemId: text('itemId')
    .notNull()
    .references(() => items.id),
  quantity: doublePrecision('quantity').notNull(),
  /** Si se quiere guardar qué línea de albarán originó esta asignación. */
  sourceLineId: text('sourceLineId'),
});

// ── Vehículos (flota propia) ─────────────────────────────────────
/**
 * Vehículos asignables a rutas. Nunca se borran físicamente: para dar
 * de baja uno se marca `status='retired'` y `archivedAt=now()`, de modo
 * que las rutas pasadas conservan intacto su histórico (`Route.vehicleId`
 * + `Route.vehiclePlate` como snapshot textual).
 */
export const vehicles = pgTable('Vehicle', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  plate: text('plate').notNull().unique(),
  brand: text('brand'),
  model: text('model'),
  capacityKg: doublePrecision('capacityKg'),
  capacityM3: doublePrecision('capacityM3'),
  /** `active|maintenance|retired` */
  status: text('status').default('active').notNull(),
  /** Conductor habitual — se usa para autorellenar la ruta. */
  defaultDriverEmployeeId: text('defaultDriverEmployeeId'),
  notes: text('notes'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  /** Marcado al "eliminar" desde UI; el registro permanece por histórico. */
  archivedAt: timestamp('archivedAt'),
});

// ── Rutas de reparto ─────────────────────────────────────────────
export const routes = pgTable('Route', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  /** Fecha prevista de la ruta. */
  plannedDate: date('plannedDate').notNull(),
  status: text('status').default('planned').notNull(),
  driverName: text('driverName'),
  driverPhone: text('driverPhone'),
  /** Snapshot textual de la matrícula en el momento de asignar.
   *  Se mantiene aunque el Vehicle se archive — histórico inmutable. */
  vehiclePlate: text('vehiclePlate'),
  /** Referencia al vehículo asignado (opcional, onDelete set null). */
  vehicleId: text('vehicleId'),
  /** Empleado asignado como conductor (tiene `Employee.userId` para login). */
  driverEmployeeId: text('driverEmployeeId'),
  startedAt: timestamp('startedAt'),
  completedAt: timestamp('completedAt'),
  notes: text('notes'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export const routeStops = pgTable('RouteStop', {
  id: text('id').primaryKey(),
  routeId: text('routeId')
    .notNull()
    .references(() => routes.id, { onDelete: 'cascade' }),
  /** Orden dentro de la ruta. */
  sequence: integer('sequence').notNull(),
  shipmentId: text('shipmentId').references(() => shipments.id, { onDelete: 'set null' }),
  address: text('address'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  plannedAt: timestamp('plannedAt'),
  arrivedAt: timestamp('arrivedAt'),
  departedAt: timestamp('departedAt'),
  status: text('status').default('pending').notNull(),
  notes: text('notes'),
  recipientName: text('recipientName'),
  recipientDocument: text('recipientDocument'),
  signatureImage: text('signatureImage'),
  photoImage: text('photoImage'),
  podNotes: text('podNotes'),
});

// ─────────────────────────────────────────────────────────────────────────
// MOVIMIENTOS INTERNOS DE STOCK
// Traspasos entre almacenes + entradas (recepciones internas) + salidas
// (bajas, scrap, ajustes). Documentos mínimos: cabecera + líneas.
// ─────────────────────────────────────────────────────────────────────────

export const transferNotes = pgTable('TransferNote', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  fromWarehouseId: text('fromWarehouseId').notNull(),
  toWarehouseId: text('toWarehouseId').notNull(),
  date: timestamp('date').defaultNow().notNull(),
  /** draft | sent | received | cancelled */
  status: text('status').default('draft').notNull(),
  notes: text('notes'),
  sentAt: timestamp('sentAt'),
  receivedAt: timestamp('receivedAt'),
  createdByUserId: text('createdByUserId'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

export const transferNoteLines = pgTable('TransferNoteLine', {
  id: text('id').primaryKey(),
  transferId: text('transferId')
    .notNull()
    .references(() => transferNotes.id, { onDelete: 'cascade' }),
  lineNum: integer('lineNum').notNull(),
  itemId: text('itemId').notNull(),
  quantity: doublePrecision('quantity').notNull(),
  fromZoneId: text('fromZoneId'),
  toZoneId: text('toZoneId'),
  batchNum: text('batchNum'),
  uomId: text('uomId'),
  notes: text('notes'),
});

export const goodsReceipts = pgTable('GoodsReceipt', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  warehouseId: text('warehouseId').notNull(),
  date: timestamp('date').defaultNow().notNull(),
  /** internal | return | adjustment */
  type: text('type').default('internal').notNull(),
  /** draft | posted | cancelled */
  status: text('status').default('draft').notNull(),
  notes: text('notes'),
  postedAt: timestamp('postedAt'),
  createdByUserId: text('createdByUserId'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

export const goodsReceiptLines = pgTable('GoodsReceiptLine', {
  id: text('id').primaryKey(),
  receiptId: text('receiptId')
    .notNull()
    .references(() => goodsReceipts.id, { onDelete: 'cascade' }),
  lineNum: integer('lineNum').notNull(),
  itemId: text('itemId').notNull(),
  quantity: doublePrecision('quantity').notNull(),
  zoneId: text('zoneId'),
  batchNum: text('batchNum'),
  uomId: text('uomId'),
  notes: text('notes'),
});

export const goodsIssues = pgTable('GoodsIssue', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  warehouseId: text('warehouseId').notNull(),
  date: timestamp('date').defaultNow().notNull(),
  /** internal | scrap | adjustment */
  type: text('type').default('internal').notNull(),
  /** draft | posted | cancelled */
  status: text('status').default('draft').notNull(),
  notes: text('notes'),
  postedAt: timestamp('postedAt'),
  createdByUserId: text('createdByUserId'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────
// TRANSPORTISTAS (dinámicos)
// El usuario puede dar de alta cualquier carrier; cada uno tiene
// opcionalmente un `adapterId` que lo enlaza con una implementación de
// `ICarrierAdapter` en backend (Seur, DHL, etc.). Si no hay adapterId, el
// carrier es "manual" — tracking libre, sin llamadas externas.
// ─────────────────────────────────────────────────────────────────────────

export const carriers = pgTable('Carrier', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code'),
  logoUrl: text('logoUrl'),
  isActive: boolean('isActive').default(true).notNull(),
  /** Opcional — adapterId registrado en CarrierRegistry. null = manual. */
  adapterId: text('adapterId'),
  notes: text('notes'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

export const carrierAccounts = pgTable('CarrierAccount', {
  id: text('id').primaryKey(),
  carrierId: text('carrierId')
    .notNull()
    .references(() => carriers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sandbox: boolean('sandbox').default(false).notNull(),
  isDefault: boolean('isDefault').default(false).notNull(),
  /** JSON libre con las credenciales / config — su shape depende del adapter. */
  credentials: jsonb('credentials').default({}).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────
// WEBHOOKS SALIENTES
// Un tenant puede suscribirse a eventos (shipment.delivered, etc.) para que
// el backend haga POST al `url` con la firma HMAC opcional.
// ─────────────────────────────────────────────────────────────────────────

export const webhookSubscriptions = pgTable('WebhookSubscription', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  /** Array de nombres de evento (`shipment.delivered`, `shipment.cancelled`, ...). */
  events: text('events')
    .array()
    .notNull()
    .default([] as any),
  /** Secreto opcional para firmar el payload con HMAC-SHA256. */
  secret: text('secret'),
  isActive: boolean('isActive').default(true).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

export const goodsIssueLines = pgTable('GoodsIssueLine', {
  id: text('id').primaryKey(),
  issueId: text('issueId')
    .notNull()
    .references(() => goodsIssues.id, { onDelete: 'cascade' }),
  lineNum: integer('lineNum').notNull(),
  itemId: text('itemId').notNull(),
  quantity: doublePrecision('quantity').notNull(),
  zoneId: text('zoneId'),
  batchNum: text('batchNum'),
  uomId: text('uomId'),
  notes: text('notes'),
});

// ─────────────────────────────────────────────────────────────────────────
// MÓDULO WEBSITE (migración 064_website.sql)
// Landing builder por tenant: un site (MVP: uno por tenant) con páginas de
// bloques JSON (@openfactu/site-builder). `blocksDraft` es lo que se edita;
// "Publicar" lo copia a `blocksPublished`, que es lo único que se sirve.
// ─────────────────────────────────────────────────────────────────────────

export const websiteSites = pgTable('WebsiteSite', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Slug público (keirost.com/site/<slug>); reservado globalmente en public."WebsiteHost". */
  slug: text('slug').notNull(),
  /** draft | published */
  status: text('status').default('draft').notNull(),
  /** Parcial de SiteTheme; null = usa el branding del tenant tal cual. */
  themeOverrides: jsonb('themeOverrides'),
  /** CSS libre inyectado en <head> tras baseCss (migración 066). */
  customCss: text('customCss'),
  seoTitle: text('seoTitle'),
  seoDescription: text('seoDescription'),
  ogImageUrl: text('ogImageUrl'),
  publishedAt: timestamp('publishedAt'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
});

export const websitePages = pgTable(
  'WebsitePage',
  {
    id: text('id').primaryKey(),
    siteId: text('siteId')
      .notNull()
      .references(() => websiteSites.id, { onDelete: 'cascade' }),
    /** Ruta dentro del site: '/', '/servicios', ... */
    path: text('path').notNull(),
    title: text('title').notNull(),
    seoTitle: text('seoTitle'),
    seoDescription: text('seoDescription'),
    ogImageUrl: text('ogImageUrl'),
    isHome: boolean('isHome').default(false).notNull(),
    /** draft | published */
    status: text('status').default('draft').notNull(),
    blocksDraft: jsonb('blocksDraft').default({ version: 1, blocks: [] }).notNull(),
    blocksPublished: jsonb('blocksPublished'),
    createdAt: timestamp('createdAt').defaultNow().notNull(),
    updatedAt: timestamp('updatedAt').defaultNow().notNull(),
  },
  (t) => ({
    pathUnique: unique().on(t.siteId, t.path),
  }),
);

export const websiteFormSubmissions = pgTable('WebsiteFormSubmission', {
  id: text('id').primaryKey(),
  siteId: text('siteId').notNull(),
  pageId: text('pageId'),
  blockId: text('blockId'),
  name: text('name'),
  email: text('email'),
  message: text('message'),
  /** ip, userAgent, referer */
  meta: jsonb('meta'),
  read: boolean('read').default(false).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});
