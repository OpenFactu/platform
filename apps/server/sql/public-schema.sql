-- Esquema público de Keirost. GENERADO: no editar a mano.
-- Sale de schema.ts vía scripts/generate-public-schema.mjs.

CREATE TABLE IF NOT EXISTS "AuditLog" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"entityType" text NOT NULL,
	"entityId" text NOT NULL,
	"action" text NOT NULL,
	"userId" text,
	"oldValue" jsonb,
	"newValue" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "tenantId" text NOT NULL;

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "entityType" text NOT NULL;

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "entityId" text NOT NULL;

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "action" text NOT NULL;

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "userId" text;

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "oldValue" jsonb;

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "newValue" jsonb;

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "GlobalUser" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"role" text DEFAULT 'USER' NOT NULL,
	"tenantId" text,
	"permissions" text,
	"avatarImageUrl" text,
	"signatureName" text,
	"signatureRole" text,
	"signatureImageUrl" text,
	"resetTokenHash" text,
	"resetTokenExpiresAt" timestamp,
	"totpSecret" text,
	"totpEnabled" boolean DEFAULT false NOT NULL,
	"totpBackupCodes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "GlobalUser_email_unique" UNIQUE("email"),
	CONSTRAINT "GlobalUser_username_unique" UNIQUE("username")
);

ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "email" text NOT NULL;

ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "username" text NOT NULL;

ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "password" text NOT NULL;

ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'USER' NOT NULL;

ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "tenantId" text;

ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "permissions" text;

ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "avatarImageUrl" text;

ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "signatureName" text;

ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "signatureRole" text;

ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "signatureImageUrl" text;

ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "resetTokenHash" text;

ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "resetTokenExpiresAt" timestamp;

ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "totpSecret" text;

ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "totpEnabled" boolean DEFAULT false NOT NULL;

ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "totpBackupCodes" text;

ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT now() NOT NULL;

ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "PluginField" (
	"id" text PRIMARY KEY NOT NULL,
	"pluginId" text NOT NULL,
	"tenantId" text,
	"tableName" text NOT NULL,
	"fieldName" text NOT NULL,
	"fieldType" text NOT NULL,
	"label" text NOT NULL,
	"options" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"helpText" text,
	"placeholder" text,
	"defaultValue" text,
	"readOnly" boolean DEFAULT false NOT NULL,
	"width" text DEFAULT 'half' NOT NULL,
	"displayOrder" integer DEFAULT 0 NOT NULL,
	"section" text,
	"visibleIn" jsonb,
	"showInList" boolean DEFAULT false NOT NULL,
	"readRoles" jsonb,
	"writeRoles" jsonb,
	"validation" jsonb,
	"refTable" text,
	"refDisplayField" text,
	"isManaged" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "pluginId" text NOT NULL;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "tenantId" text;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "tableName" text NOT NULL;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "fieldName" text NOT NULL;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "fieldType" text NOT NULL;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "label" text NOT NULL;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "options" jsonb;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "required" boolean DEFAULT false NOT NULL;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "helpText" text;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "placeholder" text;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "defaultValue" text;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "readOnly" boolean DEFAULT false NOT NULL;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "width" text DEFAULT 'half' NOT NULL;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "displayOrder" integer DEFAULT 0 NOT NULL;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "section" text;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "visibleIn" jsonb;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "showInList" boolean DEFAULT false NOT NULL;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "readRoles" jsonb;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "writeRoles" jsonb;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "validation" jsonb;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "refTable" text;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "refDisplayField" text;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "isManaged" boolean DEFAULT true NOT NULL;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "Tenant" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"schemaName" text NOT NULL,
	"config" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Tenant_name_unique" UNIQUE("name"),
	CONSTRAINT "Tenant_schemaName_unique" UNIQUE("schemaName")
);

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "name" text NOT NULL;

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "schemaName" text NOT NULL;

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "config" text;

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT now() NOT NULL;

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "UserDashboardWidget" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"kind" text DEFAULT 'metric' NOT NULL,
	"metricKey" text,
	"sourceCode" text,
	"queryConfig" jsonb,
	"size" text DEFAULT 'md' NOT NULL,
	"displayOrder" integer DEFAULT 100 NOT NULL,
	"createdBy" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "UserDashboardWidget" ADD COLUMN IF NOT EXISTS "tenantId" text NOT NULL;

ALTER TABLE "UserDashboardWidget" ADD COLUMN IF NOT EXISTS "title" text NOT NULL;

ALTER TABLE "UserDashboardWidget" ADD COLUMN IF NOT EXISTS "subtitle" text;

ALTER TABLE "UserDashboardWidget" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'metric' NOT NULL;

ALTER TABLE "UserDashboardWidget" ADD COLUMN IF NOT EXISTS "metricKey" text;

ALTER TABLE "UserDashboardWidget" ADD COLUMN IF NOT EXISTS "sourceCode" text;

ALTER TABLE "UserDashboardWidget" ADD COLUMN IF NOT EXISTS "queryConfig" jsonb;

ALTER TABLE "UserDashboardWidget" ADD COLUMN IF NOT EXISTS "size" text DEFAULT 'md' NOT NULL;

ALTER TABLE "UserDashboardWidget" ADD COLUMN IF NOT EXISTS "displayOrder" integer DEFAULT 100 NOT NULL;

ALTER TABLE "UserDashboardWidget" ADD COLUMN IF NOT EXISTS "createdBy" text;

ALTER TABLE "UserDashboardWidget" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT now() NOT NULL;

ALTER TABLE "UserDashboardWidget" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "UserTenantMembership" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"tenantId" text NOT NULL,
	"role" text DEFAULT 'USER' NOT NULL,
	"permissions" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "UserTenantMembership_userId_tenantId_unique" UNIQUE("userId","tenantId")
);

ALTER TABLE "UserTenantMembership" ADD COLUMN IF NOT EXISTS "userId" text NOT NULL;

ALTER TABLE "UserTenantMembership" ADD COLUMN IF NOT EXISTS "tenantId" text NOT NULL;

ALTER TABLE "UserTenantMembership" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'USER' NOT NULL;

ALTER TABLE "UserTenantMembership" ADD COLUMN IF NOT EXISTS "permissions" text;

ALTER TABLE "UserTenantMembership" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT now() NOT NULL;

ALTER TABLE "UserTenantMembership" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT now() NOT NULL;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_Tenant_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_GlobalUser_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."GlobalUser"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "GlobalUser" ADD CONSTRAINT "GlobalUser_tenantId_Tenant_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "UserTenantMembership" ADD CONSTRAINT "UserTenantMembership_userId_GlobalUser_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."GlobalUser"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "UserTenantMembership" ADD CONSTRAINT "UserTenantMembership_tenantId_Tenant_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE cascade ON UPDATE no action;
