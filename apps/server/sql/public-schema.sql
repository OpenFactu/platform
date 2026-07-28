-- Esquema público de Keirost. GENERADO: no editar a mano.
-- Sale de schema.ts vía scripts/generate-public-schema.mjs.

CREATE TABLE IF NOT EXISTS "AiConversation" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"userId" text NOT NULL,
	"title" text,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "AiConversation" ADD COLUMN IF NOT EXISTS "tenantId" text;

ALTER TABLE "AiConversation" ADD COLUMN IF NOT EXISTS "userId" text;

ALTER TABLE "AiConversation" ADD COLUMN IF NOT EXISTS "title" text;

ALTER TABLE "AiConversation" ADD COLUMN IF NOT EXISTS "messages" jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE "AiConversation" ADD COLUMN IF NOT EXISTS "model" text;

ALTER TABLE "AiConversation" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT now() NOT NULL;

ALTER TABLE "AiConversation" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "ApiToken" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"name" text NOT NULL,
	"tokenHash" text NOT NULL,
	"prefix" text NOT NULL,
	"scopes" text NOT NULL,
	"createdByUserId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"lastUsedAt" timestamp,
	"revokedAt" timestamp,
	CONSTRAINT "ApiToken_tokenHash_unique" UNIQUE("tokenHash")
);

ALTER TABLE "ApiToken" ADD COLUMN IF NOT EXISTS "tenantId" text;

ALTER TABLE "ApiToken" ADD COLUMN IF NOT EXISTS "name" text;

ALTER TABLE "ApiToken" ADD COLUMN IF NOT EXISTS "tokenHash" text;

ALTER TABLE "ApiToken" ADD COLUMN IF NOT EXISTS "prefix" text;

ALTER TABLE "ApiToken" ADD COLUMN IF NOT EXISTS "scopes" text;

ALTER TABLE "ApiToken" ADD COLUMN IF NOT EXISTS "createdByUserId" text;

ALTER TABLE "ApiToken" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT now() NOT NULL;

ALTER TABLE "ApiToken" ADD COLUMN IF NOT EXISTS "lastUsedAt" timestamp;

ALTER TABLE "ApiToken" ADD COLUMN IF NOT EXISTS "revokedAt" timestamp;

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

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "tenantId" text;

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "entityType" text;

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "entityId" text;

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "action" text;

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "userId" text;

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "oldValue" jsonb;

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "newValue" jsonb;

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "AutomationRun" (
	"id" text PRIMARY KEY NOT NULL,
	"automationId" text NOT NULL,
	"tenantId" text NOT NULL,
	"status" text NOT NULL,
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"finishedAt" timestamp,
	"durationMs" integer,
	"outputText" text,
	"errorText" text,
	"triggerSource" text,
	"contextJson" jsonb
);

ALTER TABLE "AutomationRun" ADD COLUMN IF NOT EXISTS "automationId" text;

ALTER TABLE "AutomationRun" ADD COLUMN IF NOT EXISTS "tenantId" text;

ALTER TABLE "AutomationRun" ADD COLUMN IF NOT EXISTS "status" text;

ALTER TABLE "AutomationRun" ADD COLUMN IF NOT EXISTS "startedAt" timestamp DEFAULT now() NOT NULL;

ALTER TABLE "AutomationRun" ADD COLUMN IF NOT EXISTS "finishedAt" timestamp;

ALTER TABLE "AutomationRun" ADD COLUMN IF NOT EXISTS "durationMs" integer;

ALTER TABLE "AutomationRun" ADD COLUMN IF NOT EXISTS "outputText" text;

ALTER TABLE "AutomationRun" ADD COLUMN IF NOT EXISTS "errorText" text;

ALTER TABLE "AutomationRun" ADD COLUMN IF NOT EXISTS "triggerSource" text;

ALTER TABLE "AutomationRun" ADD COLUMN IF NOT EXISTS "contextJson" jsonb;

CREATE TABLE IF NOT EXISTS "Automation" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"triggerType" text NOT NULL,
	"triggerConfig" jsonb,
	"actionType" text NOT NULL,
	"actionConfig" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "Automation" ADD COLUMN IF NOT EXISTS "tenantId" text;

ALTER TABLE "Automation" ADD COLUMN IF NOT EXISTS "name" text;

ALTER TABLE "Automation" ADD COLUMN IF NOT EXISTS "description" text;

ALTER TABLE "Automation" ADD COLUMN IF NOT EXISTS "enabled" boolean DEFAULT true NOT NULL;

ALTER TABLE "Automation" ADD COLUMN IF NOT EXISTS "triggerType" text;

ALTER TABLE "Automation" ADD COLUMN IF NOT EXISTS "triggerConfig" jsonb;

ALTER TABLE "Automation" ADD COLUMN IF NOT EXISTS "actionType" text;

ALTER TABLE "Automation" ADD COLUMN IF NOT EXISTS "actionConfig" jsonb;

ALTER TABLE "Automation" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT now() NOT NULL;

ALTER TABLE "Automation" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "DevApiKey" (
	"id" text PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"clientSecret" text NOT NULL,
	"name" text NOT NULL,
	"createdBy" text NOT NULL,
	"tenantId" text,
	"permissions" text DEFAULT 'plugin:push,plugin:reload',
	"isActive" boolean DEFAULT true NOT NULL,
	"lastUsedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "DevApiKey_clientId_unique" UNIQUE("clientId")
);

ALTER TABLE "DevApiKey" ADD COLUMN IF NOT EXISTS "clientId" text;

ALTER TABLE "DevApiKey" ADD COLUMN IF NOT EXISTS "clientSecret" text;

ALTER TABLE "DevApiKey" ADD COLUMN IF NOT EXISTS "name" text;

ALTER TABLE "DevApiKey" ADD COLUMN IF NOT EXISTS "createdBy" text;

ALTER TABLE "DevApiKey" ADD COLUMN IF NOT EXISTS "tenantId" text;

ALTER TABLE "DevApiKey" ADD COLUMN IF NOT EXISTS "permissions" text DEFAULT 'plugin:push,plugin:reload';

ALTER TABLE "DevApiKey" ADD COLUMN IF NOT EXISTS "isActive" boolean DEFAULT true NOT NULL;

ALTER TABLE "DevApiKey" ADD COLUMN IF NOT EXISTS "lastUsedAt" timestamp;

ALTER TABLE "DevApiKey" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT now() NOT NULL;

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

ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "email" text;

ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "username" text;

ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "password" text;

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

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "pluginId" text;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "tenantId" text;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "tableName" text;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "fieldName" text;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "fieldType" text;

ALTER TABLE "PluginField" ADD COLUMN IF NOT EXISTS "label" text;

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

CREATE TABLE IF NOT EXISTS "PluginTable" (
	"id" text PRIMARY KEY NOT NULL,
	"pluginId" text NOT NULL,
	"tenantId" text,
	"tableName" text NOT NULL,
	"definition" text NOT NULL,
	"label" text,
	"kind" text DEFAULT 'master' NOT NULL,
	"iconName" text,
	"menuModule" text,
	"userModuleId" text,
	"displayField" text,
	"description" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "PluginTable" ADD COLUMN IF NOT EXISTS "pluginId" text;

ALTER TABLE "PluginTable" ADD COLUMN IF NOT EXISTS "tenantId" text;

ALTER TABLE "PluginTable" ADD COLUMN IF NOT EXISTS "tableName" text;

ALTER TABLE "PluginTable" ADD COLUMN IF NOT EXISTS "definition" text;

ALTER TABLE "PluginTable" ADD COLUMN IF NOT EXISTS "label" text;

ALTER TABLE "PluginTable" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'master' NOT NULL;

ALTER TABLE "PluginTable" ADD COLUMN IF NOT EXISTS "iconName" text;

ALTER TABLE "PluginTable" ADD COLUMN IF NOT EXISTS "menuModule" text;

ALTER TABLE "PluginTable" ADD COLUMN IF NOT EXISTS "userModuleId" text;

ALTER TABLE "PluginTable" ADD COLUMN IF NOT EXISTS "displayField" text;

ALTER TABLE "PluginTable" ADD COLUMN IF NOT EXISTS "description" text;

ALTER TABLE "PluginTable" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "TenantPlugin" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"pluginId" text NOT NULL,
	"isActive" boolean DEFAULT false NOT NULL,
	"config" text,
	"activatedAt" timestamp DEFAULT now(),
	"deactivatedAt" timestamp,
	CONSTRAINT "TenantPlugin_tenantId_pluginId_unique" UNIQUE("tenantId","pluginId")
);

ALTER TABLE "TenantPlugin" ADD COLUMN IF NOT EXISTS "tenantId" text;

ALTER TABLE "TenantPlugin" ADD COLUMN IF NOT EXISTS "pluginId" text;

ALTER TABLE "TenantPlugin" ADD COLUMN IF NOT EXISTS "isActive" boolean DEFAULT false NOT NULL;

ALTER TABLE "TenantPlugin" ADD COLUMN IF NOT EXISTS "config" text;

ALTER TABLE "TenantPlugin" ADD COLUMN IF NOT EXISTS "activatedAt" timestamp DEFAULT now();

ALTER TABLE "TenantPlugin" ADD COLUMN IF NOT EXISTS "deactivatedAt" timestamp;

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

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "name" text;

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "schemaName" text;

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

ALTER TABLE "UserDashboardWidget" ADD COLUMN IF NOT EXISTS "tenantId" text;

ALTER TABLE "UserDashboardWidget" ADD COLUMN IF NOT EXISTS "title" text;

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

CREATE TABLE IF NOT EXISTS "UserModule" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"label" text NOT NULL,
	"iconName" text DEFAULT 'Folder' NOT NULL,
	"moduleOrder" integer DEFAULT 100 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "UserModule" ADD COLUMN IF NOT EXISTS "tenantId" text;

ALTER TABLE "UserModule" ADD COLUMN IF NOT EXISTS "label" text;

ALTER TABLE "UserModule" ADD COLUMN IF NOT EXISTS "iconName" text DEFAULT 'Folder' NOT NULL;

ALTER TABLE "UserModule" ADD COLUMN IF NOT EXISTS "moduleOrder" integer DEFAULT 100 NOT NULL;

ALTER TABLE "UserModule" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT now() NOT NULL;

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

ALTER TABLE "UserTenantMembership" ADD COLUMN IF NOT EXISTS "userId" text;

ALTER TABLE "UserTenantMembership" ADD COLUMN IF NOT EXISTS "tenantId" text;

ALTER TABLE "UserTenantMembership" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'USER' NOT NULL;

ALTER TABLE "UserTenantMembership" ADD COLUMN IF NOT EXISTS "permissions" text;

ALTER TABLE "UserTenantMembership" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT now() NOT NULL;

ALTER TABLE "UserTenantMembership" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "WebsiteHost" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"tenantId" text NOT NULL,
	"siteId" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "WebsiteHost_value_unique" UNIQUE("value")
);

ALTER TABLE "WebsiteHost" ADD COLUMN IF NOT EXISTS "kind" text;

ALTER TABLE "WebsiteHost" ADD COLUMN IF NOT EXISTS "value" text;

ALTER TABLE "WebsiteHost" ADD COLUMN IF NOT EXISTS "tenantId" text;

ALTER TABLE "WebsiteHost" ADD COLUMN IF NOT EXISTS "siteId" text;

ALTER TABLE "WebsiteHost" ADD COLUMN IF NOT EXISTS "verified" boolean DEFAULT false NOT NULL;

ALTER TABLE "WebsiteHost" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT now() NOT NULL;

ALTER TABLE "WebsiteHost" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT now() NOT NULL;

DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_Tenant_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_GlobalUser_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."GlobalUser"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DevApiKey" ADD CONSTRAINT "DevApiKey_createdBy_GlobalUser_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."GlobalUser"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DevApiKey" ADD CONSTRAINT "DevApiKey_tenantId_Tenant_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GlobalUser" ADD CONSTRAINT "GlobalUser_tenantId_Tenant_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TenantPlugin" ADD CONSTRAINT "TenantPlugin_tenantId_Tenant_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "UserTenantMembership" ADD CONSTRAINT "UserTenantMembership_userId_GlobalUser_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."GlobalUser"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "UserTenantMembership" ADD CONSTRAINT "UserTenantMembership_tenantId_Tenant_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
