import { execSync } from 'child_process';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { sql } from 'drizzle-orm';
import dotenv from 'dotenv';
import { cleanPublicSchema } from './clean-public';

dotenv.config();

async function run() {
  console.log('--- Iniciando Sincronización de Esquema Público (Drizzle Kit) ---');

  try {
    // 1. LIMPIEZA PREVIA: Eliminar tablas de negocio huérfanas en public
    // Esto evita que drizzle-kit intente sincronizarlas o que causen conflictos
    console.log('1. Ejecutando limpieza de tablas de negocio en public...');
    await cleanPublicSchema();

    // 2. Ejecutar drizzle-kit push
    console.log('2. Ejecutando drizzle-kit push --force...');
    try {
      execSync('npx drizzle-kit push --force', {
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'development' },
      });
      console.log('   ✅ Push de esquema core completado.');
    } catch (pushError) {
      console.warn(
        '   ⚠️ Drizzle Kit Push falló (posible conflicto de TTY). Intentando asegurar tablas core manualmente...',
      );
      await ensureCoreTables();
    }

    console.log('--- Sincronización de Esquema Público Finalizada con Éxito ---');
    process.exit(0);
  } catch (error: any) {
    console.error('--- ERROR CRÍTICO EN SINCRONIZACIÓN ---');
    console.error(error.message);
    process.exit(1);
  }
}

async function ensureCoreTables() {
  const db = ClientFactory.getClient('public');
  console.log('   [ManualFix] Creando tablas Core si no existen...');

  try {
    // Definiciones sincronizadas con schema.ts
    await db.execute(
      sql.raw(`
      CREATE TABLE IF NOT EXISTS "Tenant" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT UNIQUE NOT NULL,
        "schemaName" TEXT UNIQUE NOT NULL,
        "config" TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS "GlobalUser" (
        "id" TEXT PRIMARY KEY,
        "email" TEXT UNIQUE NOT NULL,
        "username" TEXT UNIQUE NOT NULL,
        "password" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'USER',
        "tenantId" TEXT REFERENCES "Tenant"("id"),
        "permissions" TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Asegurar columna si la tabla ya existía
      ALTER TABLE "GlobalUser" ADD COLUMN IF NOT EXISTS "permissions" TEXT;
      
      CREATE TABLE IF NOT EXISTS "PluginField" (
        "id" TEXT PRIMARY KEY,
        "pluginId" TEXT NOT NULL,
        "tableName" TEXT NOT NULL,
        "fieldName" TEXT NOT NULL,
        "fieldType" TEXT NOT NULL,
        "label" TEXT NOT NULL,
        "isManaged" BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS "UserTenantMembership" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "GlobalUser"("id") ON DELETE CASCADE,
        "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
        "role" TEXT NOT NULL DEFAULT 'USER',
        "permissions" TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE ("userId", "tenantId")
      );

      CREATE TABLE IF NOT EXISTS "AuditLog" (
        "id" TEXT PRIMARY KEY,
        "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id"),
        "entityType" TEXT NOT NULL,
        "entityId" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "userId" TEXT REFERENCES "GlobalUser"("id"),
        "oldValue" JSONB,
        "newValue" JSONB,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS "WebsiteHost" (
        "id" TEXT PRIMARY KEY,
        "kind" TEXT NOT NULL,
        "value" TEXT UNIQUE NOT NULL,
        "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
        "siteId" TEXT NOT NULL,
        "verified" BOOLEAN NOT NULL DEFAULT FALSE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `),
    );
    console.log('   ✅ Tablas Core aseguradas manualmente.');
  } catch (err: any) {
    console.error('   ❌ Error al crear tablas manualmente:', err.message);
    throw err;
  }
}

run();
