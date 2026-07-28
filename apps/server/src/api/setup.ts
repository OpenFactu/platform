import { Router } from 'express';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { SchemaManager } from '../core/tenant/SchemaManager';
import { AuthService } from '../core/auth/AuthService';
import { setCompanyConfig } from '../core/config/companyConfig';
import { setConfigSection } from '../core/config/systemConfigSection';
import { FLAGS_DEFAULTS } from '../core/config/appConfig';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const router = Router();

/**
 * Nombre de la base de datos que usa este servidor.
 *
 * No se puede dar por hecho «openfactudb»: la instalación nativa de Windows
 * deja que quien instala elija el nombre, y con el valor fijo el asistente
 * intentaba conectarse a una base inexistente y fallaba con un
 * «database does not exist» disfrazado de error al insertar el usuario.
 */
function nombreDeLaBase(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    const nombre = url.pathname.replace(/^\//, '');
    if (nombre) return nombre;
  } catch {
    // Sin DATABASE_URL legible queda el nombre histórico, que es el que usa
    // el despliegue con Docker.
  }
  return 'openfactudb';
}


/**
 * GET /api/setup/status
 */
/**
 * Indica si el modo debug del setup está activo. Habilitado cuando se está en
 * desarrollo (NODE_ENV !== production) o cuando explícitamente se ha definido
 * `OPENFACTU_DEBUG_SETUP=1` en el entorno. En este modo se exponen endpoints
 * peligrosos (reset total) — fuera de él, devuelven 403.
 */
function isSetupDebugEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.OPENFACTU_DEBUG_SETUP === '1';
}

router.get('/status', async (req, res) => {
  try {
    const configPath = path.join(__dirname, '../../../../storage/config/config.json');
    const isConfigured = fs.existsSync(configPath);
    // Permite forzar el wizard aunque ya esté configurado (`?force=1`) — útil
    // en debug del setup para volver a entrar sin tocar archivos.
    const force = req.query.force === '1';

    res.json({
      configured: isConfigured && !force,
      setupNeeded: !isConfigured || force,
      debugEnabled: isSetupDebugEnabled(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al comprobar el estado del sistema' });
  }
});

/**
 * POST /api/setup/check-db — Verifica credenciales de BD, si la base de
 * datos target existe, y si el schema public tiene las tablas de OpenFactu.
 * Se conecta a la BD 'postgres' (siempre presente) para hacer el check sin
 * asumir que openfactudb ya existe.
 */
router.post('/check-db', async (req, res) => {
  const { host, port, user, password } = req.body;

  if (!host || !port || !user || !password) {
    return res.status(400).json({ error: 'Faltan credenciales de base de datos' });
  }

  let pool: any;
  let targetPool: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Pool } = require('pg');

    // Conectar a 'postgres' que siempre existe para verificar credenciales
    const checkUrl = `postgresql://${user}:${password}@${host}:${port}/postgres`;
    pool = new Pool({ connectionString: checkUrl, connectionTimeoutMillis: 5000 });

    await pool.query('SELECT 1');

    // Verificar si openfactudb existe
    const baseDeDatos = nombreDeLaBase();
    const dbResult = await pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      baseDeDatos,
    ]);
    const databaseExists = dbResult.rowCount > 0;

    await pool.end();

    let hasPublicSchema = false;
    let hasExistingSetup = false;

    if (databaseExists) {
      // Conectar a openfactudb para verificar el schema public
      const targetUrl = `postgresql://${user}:${password}@${host}:${port}/${baseDeDatos}`;
      targetPool = new Pool({ connectionString: targetUrl, connectionTimeoutMillis: 5000 });

      // Verificar si existe el schema public
      const schemaResult = await targetPool.query(
        "SELECT 1 FROM information_schema.schemata WHERE schema_name = 'public'",
      );
      hasPublicSchema = schemaResult.rowCount > 0;

      if (hasPublicSchema) {
        // Verificar si existen las tablas clave de OpenFactu
        const tablesResult = await targetPool.query(
          `SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'public'
           AND table_name IN ('Tenant', 'GlobalUser')`,
        );
        // Las tablas se crean con CREATE TABLE IF NOT EXISTS en cada arranque,
        // así que su sola existencia no implica que haya un setup previo real.
        // Solo hay "setup existente" si además hay al menos un Tenant creado.
        if (tablesResult.rowCount >= 2) {
          const tenantCountResult = await targetPool.query('SELECT COUNT(*)::int AS count FROM "Tenant"');
          hasExistingSetup = tenantCountResult.rows[0].count > 0;
        }
        console.log(
          `[Setup.check-db] Tablas encontradas: ${tablesResult.rowCount}, hasExistingSetup: ${hasExistingSetup}`,
        );
      }

      await targetPool.end();
    }

    let message = '';
    if (hasExistingSetup) {
      message = 'Conexión exitosa. Base de datos con configuración existente detectada.';
    } else if (databaseExists && hasPublicSchema) {
      message = 'Conexión exitosa. Base de datos encontrada (schema vacío).';
    } else if (databaseExists) {
      message = 'Conexión exitosa. Base de datos encontrada pero sin schema public.';
    } else {
      message = 'Conexión exitosa. La base de datos se creará automáticamente.';
    }

    res.json({
      connected: true,
      databaseExists,
      hasPublicSchema,
      hasExistingSetup,
      message,
    });
  } catch (error: any) {
    if (pool) {
      try {
        await pool.end();
      } catch {
        // ignore cleanup errors
      }
    }
    if (targetPool) {
      try {
        await targetPool.end();
      } catch {
        // ignore cleanup errors
      }
    }

    let message = 'No se pudo conectar a la base de datos.';
    if (error.message?.includes('password')) {
      message = 'Contraseña incorrecta.';
    } else if (error.message?.includes('does not exist')) {
      message = 'El usuario no existe.';
    } else if (error.message?.includes('connect') || error.message?.includes('timeout')) {
      message = 'No se pudo conectar al servidor. Verifica host y puerto.';
    } else if (error.message?.includes('ECONNREFUSED')) {
      message = 'El servidor rechazó la conexión. Verifica que PostgreSQL está corriendo.';
    }

    res.json({
      connected: false,
      databaseExists: false,
      hasPublicSchema: false,
      hasExistingSetup: false,
      message,
      rawError: error.message,
    });
  }
});

/**
 * POST /api/setup/dev-reset — DESTRUCTIVO: vacía el config.json, tira todos
 * los tenant schemas y limpia las tablas globales (Tenant, GlobalUser,
 * UserTenantMembership, AuditLog) para que el wizard de setup vuelva a
 * arrancar desde cero. Solo disponible en modo debug.
 *
 * Body opcional:
 *   { keepGeo?: boolean }  — si true, no toca Country/Region/SubRegion/Locality
 *                            (por defecto sí los conserva, así no hay que
 *                            re-cargar 8000 municipios cada vez).
 */
router.post('/dev-reset', async (req, res) => {
  if (!isSetupDebugEnabled()) {
    return res.status(403).json({ error: 'Modo debug no habilitado' });
  }
  try {
    const publicDb = ClientFactory.getClient('public');

    // 1) Drop de cada schema de tenant.
    const tenants = await publicDb.select().from(schema.tenants);
    for (const t of tenants) {
      try {
        await publicDb.execute(
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          (await import('drizzle-orm')).sql.raw(`DROP SCHEMA IF EXISTS "${t.schemaName}" CASCADE`),
        );
      } catch (e: any) {
        console.warn(`[Setup.dev-reset] No se pudo dropear ${t.schemaName}: ${e.message}`);
      }
    }

    // 2) Limpiar tablas globales relacionadas con tenants/auth.
    await publicDb.delete(schema.auditLogs);
    await publicDb.delete(schema.userTenantMemberships);
    await publicDb.delete(schema.tenants);
    await publicDb.delete(schema.globalUsers);
    // pluginFields/pluginTables son globales pero pertenecen a plugins; los
    // dejamos a no ser que se pida lo contrario, no estorban al wizard.

    // 3) Borrar config.json.
    const configPath = path.join(__dirname, '../../../../storage/config/config.json');
    try {
      if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    } catch (e: any) {
      console.warn(`[Setup.dev-reset] No se pudo borrar ${configPath}: ${e.message}`);
    }

    res.json({
      ok: true,
      droppedTenants: tenants.length,
      message: 'Setup reseteado. Recarga el front para volver a ver el wizard.',
    });
  } catch (e: any) {
    console.error('[Setup.dev-reset] error:', e?.stack || e);
    res.status(500).json({ error: e?.message || 'Error al resetear setup' });
  }
});

/**
 * POST /api/setup/init
 */
router.post('/init', async (req, res) => {
  const { admin, company, dbConfig } = req.body;

  try {
    // Si dbConfig viene del frontend, intentar conectar con esa URL
    // Si no, usar la conexion existente (ya configurada por DATABASE_URL)
    if (dbConfig?.host && dbConfig.host !== 'db') {
      const { host, port, user: dbUser, password } = dbConfig;
      const baseDeDatos = nombreDeLaBase();
      const dynamicUrl = `postgresql://${dbUser}:${password}@${host}:${port}/${baseDeDatos}`;
      console.log(
        `[Setup] Conectando a: postgresql://${dbUser}:****@${host}:${port}/${baseDeDatos}`,
      );
      await ClientFactory.setBaseUrl(dynamicUrl);
    } else {
      console.log('[Setup] Usando conexion existente (DATABASE_URL)');
    }

    const publicDb = ClientFactory.getClient('public');
    const adminUsername = admin.username || admin.email.split('@')[0];
    const hashedPassword = await AuthService.hashPassword(admin.password);

    // 1. Crear o Actualizar Admin Global
    const adminId = crypto.randomUUID();
    await publicDb
      .insert(schema.globalUsers)
      .values({
        id: adminId,
        email: admin.email,
        username: adminUsername,
        password: hashedPassword,
        role: 'ADMIN',
      })
      .onConflictDoUpdate({
        target: schema.globalUsers.username,
        set: {
          email: admin.email,
          password: hashedPassword,
          role: 'ADMIN',
        },
      });

    // Resolver id real del admin (para el upsert puede no ser el generado arriba)
    const [adminRow] = await publicDb
      .select({ id: schema.globalUsers.id })
      .from(schema.globalUsers)
      .where(eq(schema.globalUsers.username, adminUsername));
    const effectiveAdminId = adminRow?.id || adminId;

    // 2. Provisión de Empresa (SchemaManager se encarga de todo: esquema + registro)
    const schemaName = `tenant_${company.name.toLowerCase().replace(/\s+/g, '_')}`;
    const tenantId = await SchemaManager.createTenantSchema(company.name, schemaName, {
      nif: company.nif,
    });

    // 2a. Vincular al admin con la nueva empresa como ADMIN (idempotente)
    try {
      await publicDb
        .insert(schema.userTenantMemberships)
        .values({
          id: crypto.randomUUID(),
          userId: effectiveAdminId,
          tenantId,
          role: 'ADMIN',
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
    } catch (err: any) {
      console.warn('[Setup] No se pudo crear membership del admin:', err.message);
    }

    // 2b. Sembrar datos de empresa en SystemConfig del nuevo tenant
    try {
      const tenantDb = ClientFactory.getClient(schemaName);
      await setCompanyConfig(tenantDb, {
        name: company.name,
        taxId: company.nif || '',
        address: company.address || '',
        city: company.city || '',
        zipCode: company.zipCode || '',
        country: company.country || 'ES',
        email: company.email || '',
        phone: company.phone || '',
        website: company.website || '',
        currency: company.currency || 'EUR',
        fiscalYearStart: company.fiscalYearStart || '01-01',
      });

      // URL pública para los enlaces de emails (tracking, etc.). Si el
      // instalador la pasó explícitamente, la respetamos; si no, usamos el
      // Origin del navegador del admin como mejor aproximación.
      const publicBaseUrl =
        (company.publicBaseUrl as string | undefined)?.trim() ||
        (req.headers.origin as string | undefined)?.trim() ||
        '';
      if (publicBaseUrl) {
        await setConfigSection(
          tenantDb,
          'app',
          { publicBaseUrl: '' },
          { publicBaseUrl: publicBaseUrl.replace(/\/$/, '') },
        );
      }

      // Módulos elegidos en el paso 5 del wizard — solo llegan las claves que
      // el admin desmarcó (el resto ya son `true` por defecto en FLAGS_DEFAULTS).
      const { modules } = req.body;
      if (modules && Object.keys(modules).length > 0) {
        await setConfigSection(tenantDb, 'flags', FLAGS_DEFAULTS, modules);
      }

      // Seed de tipos de documento fiscales según país (F1/F2/R1 en ES,
      // 33/34/61 en CL, I/E/T en MX...). Idempotente.
      const { seedDocumentTypesForCountry } = await import('../core/documents/seedDocumentTypes');
      const count = await seedDocumentTypesForCountry(tenantDb, company.country || 'ES');
      if (count > 0) {
        console.log(
          `[Setup] Sembrados ${count} tipos de documento para ${company.country || 'ES'}`,
        );
      }
    } catch (err: any) {
      console.warn('[Setup] No se pudieron sembrar datos de empresa en SystemConfig:', err.message);
    }

    // 3. Guardar configuración en archivo persistente
    const configPath = path.join(__dirname, '../../../../storage/config/config.json');
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

    fs.writeFileSync(configPath, JSON.stringify({ dbConfig, company, schemaName }, null, 2));

    res.json({
      success: true,
      message: 'Sistema inicializado correctamente',
      tenantId: tenantId,
    });
  } catch (error: any) {
    console.error('[Setup] Error en la inicialización:', error);
    res.status(500).json({ error: 'Fallo en la inicialización del sistema: ' + error.message });
  }
});

export default router;
