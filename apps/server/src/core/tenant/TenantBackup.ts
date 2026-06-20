/**
 * Export / Import de empresas (tenants) completas como `.zip`.
 *
 * Formato del zip:
 *   meta.json        → { name, schemaName, exportedAt, openfactuVersion }
 *   schema.sql       → pg_dump --schema-only del schema del tenant, con el
 *                      nombre del schema sustituido por __OFTENANT__ para que
 *                      sea reimportable bajo otro nombre.
 *   data.sql         → pg_dump --data-only.
 *   uploads/         → contenido de storage/uploads/<schemaName>/ (si existe).
 *
 * Lo de las attachments en cloud (gdrive/onedrive) NO se mete en el zip — los
 * archivos viven en cuentas externas; solo se exporta la tabla `Attachment`
 * con sus filas y `externalId`. Si quieres llevártelos también, primero hay
 * que desactivar el cloud y todas las descargas re-suben a local.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, spawnSync } from 'child_process';
import AdmZip from 'adm-zip';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { ClientFactory } from './ClientFactory';
import { SchemaManager } from './SchemaManager';

const SCHEMA_PLACEHOLDER = '__OFTENANT__';

function defaultUploadsBase(): string {
  return (
    process.env.OPENFACTU_UPLOADS_DIR ||
    path.resolve(__dirname, '..', '..', '..', '..', '..', 'storage', 'uploads')
  );
}

function parseDatabaseUrl(url: string) {
  // postgresql://user:password@host:port/db
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || '5432'),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    db: u.pathname.replace(/^\//, ''),
  };
}

function missingBinaryError(bin: string): Error {
  return new Error(
    `No se encontró el binario "${bin}" ni en el PATH del servidor ni dentro de un ` +
      `container Docker de Postgres. Instala "postgresql-client" en el host o ` +
      `define OPENFACTU_PG_CONTAINER con el nombre del container que tenga "${bin}".`,
  );
}

/**
 * Resuelve cómo invocar pg_dump/psql: primero intenta el binario local. Si no
 * está en PATH, busca un container Docker de Postgres (por defecto
 * "openfactu-db-1" o el nombre en OPENFACTU_PG_CONTAINER) y envuelve el
 * comando con `docker exec -i <container> <bin>`.
 *
 * Cuando usamos `docker exec`, la conexión va al Postgres del propio
 * container por localhost:5432, no al DATABASE_URL del host (que apunta al
 * puerto expuesto). Por eso forzamos PGHOST/PGPORT.
 */
interface PgInvocation {
  cmd: string;
  argsPrefix: string[];
  env: Record<string, string>;
  mode: 'local' | 'docker';
  container?: string;
}

let cachedLocalBinaries: { pg_dump: boolean; psql: boolean } | null = null;
function localBinaryExists(bin: string): boolean {
  if (!cachedLocalBinaries) {
    cachedLocalBinaries = { pg_dump: false, psql: false };
    const which = process.platform === 'win32' ? 'where' : 'which';
    for (const b of ['pg_dump', 'psql'] as const) {
      try {
        const r = spawnSync(which, [b], { encoding: 'utf8' });
        cachedLocalBinaries[b] = r.status === 0 && !!r.stdout.trim();
      } catch {
        /* noop */
      }
    }
  }
  return cachedLocalBinaries[bin as 'pg_dump' | 'psql'];
}

function dockerAvailable(): boolean {
  try {
    const r = spawnSync('docker', ['--version'], { encoding: 'utf8' });
    return r.status === 0;
  } catch {
    return false;
  }
}

function findPostgresContainer(): string | null {
  if (process.env.OPENFACTU_PG_CONTAINER) return process.env.OPENFACTU_PG_CONTAINER;
  try {
    // Buscar un container running cuya imagen empiece por "postgres".
    const r = spawnSync(
      'docker',
      ['ps', '--filter', 'ancestor=postgres', '--format', '{{.Names}}'],
      { encoding: 'utf8' },
    );
    const first = r.stdout?.split('\n').map((s) => s.trim()).filter(Boolean)[0];
    if (first) return first;
    // Fallback a nombres comunes.
    const r2 = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' });
    const names = r2.stdout?.split('\n').map((s) => s.trim()).filter(Boolean) || [];
    return names.find((n) => /(^|-)db(-\d+)?$/.test(n) || n.includes('postgres')) || null;
  } catch {
    return null;
  }
}

function resolvePg(bin: 'pg_dump' | 'psql', conn: ReturnType<typeof parseDatabaseUrl>): PgInvocation {
  const baseEnv = {
    PGHOST: conn.host,
    PGPORT: String(conn.port),
    PGUSER: conn.user,
    PGPASSWORD: conn.password,
    PGDATABASE: conn.db,
  };
  // Si OPENFACTU_FORCE_DOCKER está seteado, ignoramos el binario local y usamos docker exec.
  // Esto es útil cuando el host tiene un psql antiguo (ej: PG 15) pero el container
  // tiene uno moderno (PG 16+) y queremos asegurar compatibilidad.
  if (process.env.OPENFACTU_FORCE_DOCKER === '1' && dockerAvailable()) {
    const container = findPostgresContainer();
    if (container) {
      const dockerEnv = {
        PGHOST: process.env.OPENFACTU_PG_INTERNAL_HOST || 'localhost',
        PGPORT: process.env.OPENFACTU_PG_INTERNAL_PORT || '5432',
        PGUSER: conn.user,
        PGPASSWORD: conn.password,
        PGDATABASE: conn.db,
      };
      const envFlags = Object.entries(dockerEnv).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
      return {
        cmd: 'docker',
        argsPrefix: ['exec', '-i', ...envFlags, container, bin],
        env: {},
        mode: 'docker',
        container,
      };
    }
  }
  if (localBinaryExists(bin)) {
    return { cmd: bin, argsPrefix: [], env: baseEnv, mode: 'local' };
  }
  if (dockerAvailable()) {
    const container = findPostgresContainer();
    if (container) {
      // Dentro del container conectamos al propio Postgres. Por defecto
      // localhost:5432 (puerto interno de Postgres), pero se puede sobreescribir
      // con OPENFACTU_PG_INTERNAL_HOST/PORT si el container escucha en otro
      // sitio, o tomar directamente el host/puerto externo si el usuario ya
      // los dejó en DATABASE_URL apuntando a algo accesible desde el container.
      const dockerEnv = {
        PGHOST: process.env.OPENFACTU_PG_INTERNAL_HOST || 'localhost',
        PGPORT: process.env.OPENFACTU_PG_INTERNAL_PORT || '5432',
        PGUSER: conn.user,
        PGPASSWORD: conn.password,
        PGDATABASE: conn.db,
      };
      // -e para pasar PG* al container; -i para poder leer stdin (psql).
      const envFlags = Object.entries(dockerEnv).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
      return {
        cmd: 'docker',
        argsPrefix: ['exec', '-i', ...envFlags, container, bin],
        env: {}, // el docker client no necesita env para estas llamadas.
        mode: 'docker',
        container,
      };
    }
  }
  throw missingBinaryError(bin);
}

async function runPgDump(
  args: string[],
  conn: ReturnType<typeof parseDatabaseUrl>,
): Promise<string> {
  const inv = resolvePg('pg_dump', conn);
  return new Promise((resolve, reject) => {
    const proc = spawn(inv.cmd, [...inv.argsPrefix, ...args], {
      env: { ...process.env, ...inv.env },
    });
    let stdout = '';
    let stderr = '';
    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') reject(missingBinaryError('pg_dump'));
      else reject(err);
    });
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`pg_dump (${inv.mode}) exit ${code}: ${stderr}`));
    });
  });
}

async function runPsql(input: string, conn: ReturnType<typeof parseDatabaseUrl>): Promise<void> {
  const inv = resolvePg('psql', conn);
  return new Promise((resolve, reject) => {
    const proc = spawn(
      inv.cmd,
      [...inv.argsPrefix, '-d', conn.db, '-v', 'ON_ERROR_STOP=1'],
      { env: { ...process.env, ...inv.env } },
    );
    let stderr = '';
    let spawnFailed = false;
    proc.on('error', (err: NodeJS.ErrnoException) => {
      spawnFailed = true;
      if (err.code === 'ENOENT') reject(missingBinaryError('psql'));
      else reject(err);
    });
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => {
      if (spawnFailed) return;
      if (code === 0) resolve();
      else reject(new Error(`psql (${inv.mode}) exit ${code}: ${stderr}`));
    });
    if (proc.stdin) {
      proc.stdin.on('error', () => {
        /* swallow EPIPE cuando el proceso muere */
      });
      try {
        proc.stdin.write(input);
        proc.stdin.end();
      } catch {
        /* ignorado: el 'error' listener del proc hará reject */
      }
    }
  });
}

export class TenantBackup {
  /**
   * Exporta un tenant a un Buffer con el contenido del zip.
   *
   * @param opts.includeUploads — si false, omite la carpeta storage/uploads/<schema>.
   *   Útil cuando solo necesitas el esquema/datos para debug y los archivos
   *   pesan demasiado o ya viven en cloud (gdrive/onedrive).
   */
  static async exportToZip(
    tenantId: string,
    opts: { includeUploads?: boolean } = {},
  ): Promise<Buffer> {
    const includeUploads = opts.includeUploads !== false; // default true
    const publicDb = ClientFactory.getClient('public');
    const [tenant] = await publicDb
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId));
    if (!tenant) throw new Error('Tenant no encontrado');

    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl) throw new Error('DATABASE_URL no configurada');
    const conn = parseDatabaseUrl(dbUrl);

    const schemaSql = (await runPgDump(
      ['--schema-only', '--no-owner', '--no-privileges', '-n', tenant.schemaName],
      conn,
    ))
      .replace(/^SET\s+transaction_timeout\s*=.*$/gim, '')
      .replace(/^SET\s+statement_timeout\s*=.*$/gim, '')
      .replace(/^SET\s+lock_timeout\s*=.*$/gim, '')
      .replace(/^SET\s+idle_in_transaction_session_timeout\s*=.*$/gim, '');
    const dataSql = (await runPgDump(
      [
        '--data-only',
        '--no-owner',
        '--no-privileges',
        '--disable-triggers',
        '-n',
        tenant.schemaName,
      ],
      conn,
    ))
      .replace(/^SET\s+transaction_timeout\s*=.*$/gim, '')
      .replace(/^SET\s+statement_timeout\s*=.*$/gim, '')
      .replace(/^SET\s+lock_timeout\s*=.*$/gim, '')
      .replace(/^SET\s+idle_in_transaction_session_timeout\s*=.*$/gim, '');
    console.log(
      `[TenantBackup.export] tenant=${tenant.name} schema=${tenant.schemaName} ` +
        `schemaSql=${schemaSql.length}B dataSql=${dataSql.length}B`,
    );

    // ── Validación del dump antes de empaquetar ───────────────────────────
    // Queremos fallar ruidosamente si pg_dump no produjo lo que esperamos,
    // en lugar de entregar un zip que al importarse crea una empresa vacía.
    //
    // Comprobamos:
    //   (a) schema.sql contiene al menos un CREATE TABLE.
    //   (b) nº de CREATE TABLE en el dump == nº de tablas reales del schema.
    //   (c) si el schema tiene tablas con filas, data.sql debe contener
    //       al menos un COPY o un INSERT.
    const createTableCount = (schemaSql.match(/\bCREATE TABLE\b/gi) || []).length;
    if (createTableCount === 0) {
      throw new Error(
        `Export inválido: schema.sql no contiene ningún CREATE TABLE ` +
          `(tamaño=${schemaSql.length}B). Probablemente pg_dump falló sin error.`,
      );
    }
    const tablesRes: any = await publicDb.execute(
      sql.raw(
        `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = '${tenant.schemaName.replace(/'/g, '')}'`,
      ),
    );
    const realTableCount = Number(tablesRes?.rows?.[0]?.n || 0);
    if (realTableCount > 0 && createTableCount < realTableCount) {
      throw new Error(
        `Export incompleto: el schema "${tenant.schemaName}" tiene ${realTableCount} ` +
          `tablas pero el dump solo contiene ${createTableCount} CREATE TABLE.`,
      );
    }
    const rowCountRes: any = await publicDb.execute(
      sql.raw(
        `SELECT COALESCE(SUM(n_live_tup), 0)::bigint AS n FROM pg_stat_user_tables WHERE schemaname = '${tenant.schemaName.replace(/'/g, '')}'`,
      ),
    );
    const totalRows = Number(rowCountRes?.rows?.[0]?.n || 0);
    const hasCopyOrInsert = /\b(COPY|INSERT INTO)\b/.test(dataSql);
    if (totalRows > 0 && !hasCopyOrInsert) {
      throw new Error(
        `Export inválido: el schema tiene ~${totalRows} filas pero data.sql no ` +
          `contiene ningún COPY ni INSERT (tamaño=${dataSql.length}B).`,
      );
    }
    console.log(
      `[TenantBackup.export] validación OK — tablas=${createTableCount}/${realTableCount} ` +
        `filas≈${totalRows} data=${hasCopyOrInsert ? 'con COPY/INSERT' : 'sin datos'}`,
    );

    // Sustituimos el nombre real del schema por un placeholder para poder
    // importar bajo otro nombre. Cubrimos cuatro formas en las que pg_dump
    // emite el nombre del schema:
    //   1) "<schema>"           (quoted)
    //   2) <schema>.            (qualified reference, bareword)
    //   3) SET search_path = <schema>, pg_catalog;
    //   4) CREATE SCHEMA <schema>;  / ALTER TABLE ONLY <schema>.X
    // Con la versión anterior la (3) no se tocaba y las inserciones caían en
    // el schema original en lugar del nuevo → quedaba la empresa vacía tras
    // el import.
    const escSchema = tenant.schemaName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const placeholdize = (s: string) =>
      s
        .replace(new RegExp(`"${escSchema}"`, 'g'), `"${SCHEMA_PLACEHOLDER}"`)
        .replace(new RegExp(`\\b${escSchema}\\.`, 'g'), `${SCHEMA_PLACEHOLDER}.`)
        // Bareword aislado — word boundary a ambos lados. Evita capturar
        // cadenas dentro de datos (pg_dump cita siempre los strings).
        .replace(new RegExp(`\\b${escSchema}\\b`, 'g'), SCHEMA_PLACEHOLDER);

    const meta = {
      name: tenant.name,
      schemaName: tenant.schemaName,
      exportedAt: new Date().toISOString(),
      openfactuVersion: process.env.OPENFACTU_VERSION || 'dev',
      schemaPlaceholder: SCHEMA_PLACEHOLDER,
    };

    const zip = new AdmZip();
    zip.addFile('meta.json', Buffer.from(JSON.stringify(meta, null, 2)));
    zip.addFile('schema.sql', Buffer.from(placeholdize(schemaSql)));
    zip.addFile('data.sql', Buffer.from(placeholdize(dataSql)));

    // uploads/ — best effort. Si la carpeta no existe (sin adjuntos local) la saltamos.
    if (includeUploads) {
      const uploadsDir = path.join(defaultUploadsBase(), tenant.schemaName);
      if (fs.existsSync(uploadsDir)) {
        addDirToZip(zip, uploadsDir, 'uploads/');
      }
    }

    return zip.toBuffer();
  }

  /**
   * Importa un zip como tenant nuevo. Crea el schema, ejecuta el SQL y
   * restaura la carpeta uploads. Devuelve el tenantId nuevo.
   */
  static async importFromZip(
    zipBuffer: Buffer,
    opts: { newName: string },
  ): Promise<{ tenantId: string }> {
    const zip = new AdmZip(zipBuffer);
    const metaEntry = zip.getEntry('meta.json');
    const schemaEntry = zip.getEntry('schema.sql');
    const dataEntry = zip.getEntry('data.sql');
    if (!metaEntry || !schemaEntry || !dataEntry) {
      throw new Error('Zip inválido: faltan meta.json/schema.sql/data.sql');
    }
    const meta = JSON.parse(metaEntry.getData().toString());
    const placeholder = meta.schemaPlaceholder || SCHEMA_PLACEHOLDER;

    // Crear tenant + schema vacío. SchemaManager hace migraciones — no lo
    // queremos aquí, así que creamos el schema a mano vía publicDb.
    const slug = `tenant_${opts.newName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
    const publicDb = ClientFactory.getClient('public');

    const tenantId = await SchemaManager.createTenantSchema(opts.newName, slug, {
      importedFrom: meta,
    }).catch(async (e) => {
      // Si SchemaManager rechaza por nombre duplicado, propaga.
      throw e;
    });

    // SchemaManager.createTenantSchema ya aplicó migraciones — nuestras
    // tablas existirán. Ahora reemplazamos por el contenido del backup. Para
    // evitar conflictos, primero DROPeamos el schema y lo recreamos vacío.
    const dbUrl = process.env.DATABASE_URL || '';
    const conn = parseDatabaseUrl(dbUrl);

    // Solo DROP — schema.sql trae su propio CREATE SCHEMA. Si pre-creamos
    // aquí, el CREATE dentro del dump choca con `already exists`.
    await runPsql(`DROP SCHEMA IF EXISTS "${slug}" CASCADE;`, conn);

    // Dos pases de reemplazo para cubrir zips exportados antes del fix del
    // placeholder: primero sustituimos el placeholder oficial, y después
    // barremos cualquier resto literal del schema original (`meta.schemaName`)
    // por el nuevo slug. Así funcionan tanto zips "nuevos" como "viejos".
    const origSchema: string = meta.schemaName || '';
    const rewriteSchema = (s: string): string => {
      let out = s.split(placeholder).join(slug);
      if (origSchema && origSchema !== slug) {
        const esc = origSchema.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        out = out
          .replace(new RegExp(`"${esc}"`, 'g'), `"${slug}"`)
          .replace(new RegExp(`\\b${esc}\\.`, 'g'), `${slug}.`)
          .replace(new RegExp(`\\b${esc}\\b`, 'g'), slug);
      }
      return out;
    };

    // Los pg_dump modernos (16+) emiten `\restrict <token>`, `\unrestrict`,
    // y `SET transaction_timeout = ...`. Un `psql` 15 no entiende esos
    // backslash-commands ni el SET, y con ON_ERROR_STOP=1 aborta, dejando el
    // schema a medias. Los quitamos.
    const stripRestrict = (s: string) =>
      s
        .replace(/^\\(?:restrict|unrestrict)\s+\S+\s*$/gim, '')
        .replace(/^SET\s+transaction_timeout\s*=.*$/gim, '')
        .replace(/^SET\s+statement_timeout\s*=.*$/gim, '')
        .replace(/^SET\s+lock_timeout\s*=.*$/gim, '')
        .replace(/^SET\s+idle_in_transaction_session_timeout\s*=.*$/gim, '');

    let schemaSql = stripRestrict(rewriteSchema(schemaEntry.getData().toString()));
    const dataSql = stripRestrict(rewriteSchema(dataEntry.getData().toString()));

    // Estrategia defensiva para CREATE SCHEMA: en vez de intentar parchar
    // cada caso con regex, eliminamos TODOS los CREATE SCHEMA del dump y
    // ponemos uno solo al principio con IF NOT EXISTS contra el slug. Así
    // evitamos colisiones con schemas antiguos cuando el placeholder no se
    // aplicó en el export (zips pre-fix).
    schemaSql = schemaSql.replace(
      /CREATE SCHEMA\s+(?:IF NOT EXISTS\s+)?(?:"[^"]+"|[A-Za-z0-9_]+)\s*;\s*/gi,
      '',
    );
    const cleanedSchemaSql = `CREATE SCHEMA IF NOT EXISTS "${slug}";\n` + schemaSql;

    // Preview para diagnóstico — vemos qué se va a ejecutar realmente.
    console.log(
      `[TenantBackup.import] preview schema.sql:\n---\n${cleanedSchemaSql.slice(0, 400)}\n---`,
    );
    console.log(
      `[TenantBackup.import] slug=${slug} schemaSql=${schemaSql.length}B ` +
        `dataSql=${dataSql.length}B (placeholder=${placeholder})`,
    );

    // ── SAFETY CHECK crítico ─────────────────────────────────────────────
    // Antes de ejecutar nada, verificamos que NO queda ninguna referencia
    // identificativa al schema original en el SQL reescrito. Si la hay, las
    // inserciones irían al tenant original y lo corromperíamos. Mejor
    // abortar ruidosamente que reventar datos de producción.
    if (origSchema && origSchema !== slug) {
      const escOrig = origSchema.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const leakRegex = new RegExp(
        `(^|[^A-Za-z0-9_])${escOrig}(\\.|"|$|\\s|;)`,
        'm',
      );
      for (const [label, body] of [
        ['schema.sql', cleanedSchemaSql],
        ['data.sql', dataSql],
      ] as const) {
        const m = body.match(leakRegex);
        if (m) {
          const idx = body.indexOf(m[0]);
          const ctx = body.slice(Math.max(0, idx - 40), idx + 80).replace(/\n/g, '⏎');
          throw new Error(
            `Import abortado: ${label} todavía referencia al schema original "${origSchema}". ` +
              `Contexto: …${ctx}…`,
          );
        }
      }
    }

    await runPsql(cleanedSchemaSql, conn);
    console.log('[TenantBackup.import] schema.sql aplicado');
    await runPsql(dataSql, conn);
    console.log('[TenantBackup.import] data.sql aplicado');

    // ── Validación del import ─────────────────────────────────────────────
    // Contamos tablas y filas reales en el nuevo schema y las comparamos
    // con lo que esperábamos del dump. Si algo no cuadra, dejamos el tenant
    // creado (el row en public.Tenant sigue vivo para debug) pero lanzamos
    // para que admin.ts devuelva 500 en vez de "todo bien".
    const expectedTables = (schemaSql.match(/\bCREATE TABLE\b/gi) || []).length;
    // Estimación de filas esperadas: cada bloque `COPY ... FROM stdin;` tiene
    // líneas de datos hasta `\.`. Contamos líneas no-vacías entre ambos.
    const expectedRows = countCopyRows(dataSql);

    const tablesAfter: any = await publicDb.execute(
      sql.raw(
        `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = '${slug.replace(/'/g, '')}'`,
      ),
    );
    const actualTables = Number(tablesAfter?.rows?.[0]?.n || 0);
    // ANALYZE para refrescar pg_stat antes de leer n_live_tup.
    try {
      await publicDb.execute(sql.raw(`ANALYZE`));
    } catch {
      /* no crítico */
    }
    const rowsAfter: any = await publicDb.execute(
      sql.raw(
        `SELECT COALESCE(SUM(n_live_tup), 0)::bigint AS n FROM pg_stat_user_tables WHERE schemaname = '${slug.replace(/'/g, '')}'`,
      ),
    );
    const actualRows = Number(rowsAfter?.rows?.[0]?.n || 0);

    console.log(
      `[TenantBackup.import] validación → tablas=${actualTables}/${expectedTables} ` +
        `filas=${actualRows}/~${expectedRows}`,
    );

    if (expectedTables > 0 && actualTables < expectedTables) {
      throw new Error(
        `Import inválido: esperábamos ${expectedTables} tablas en "${slug}" pero ` +
          `solo hay ${actualTables}. Revisa los logs del server (schema.sql).`,
      );
    }
    // Tolerancia: si el dump tenía datos pero el schema quedó vacío, es fallo.
    // No exigimos igualdad exacta (ANALYZE estima). Exigimos > 0 cuando se
    // esperaban filas.
    if (expectedRows > 0 && actualRows === 0) {
      throw new Error(
        `Import inválido: data.sql tenía ~${expectedRows} filas pero la empresa ` +
          `quedó vacía. Probablemente el reemplazo del schema placeholder no ` +
          `capturó todas las referencias — revisa los logs del server.`,
      );
    }

    // Restaurar uploads/ — best effort, solo si existe en el zip
    const uploadsBase = defaultUploadsBase();
    const targetUploadsDir = path.join(uploadsBase, slug);
    if (zip.getEntry('uploads/')) {
      fs.mkdirSync(targetUploadsDir, { recursive: true });
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oftenant-import-'));
      try {
        zip.extractEntryTo('uploads/', tmpDir, true, true);
        const extractedUploads = path.join(tmpDir, 'uploads');
        if (fs.existsSync(extractedUploads)) {
          copyDir(extractedUploads, targetUploadsDir);
        }
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }

    return { tenantId };
  }
}

// ---------- helpers ----------

/**
 * Estima el nº de filas contenidas en bloques `COPY ... FROM stdin;` dentro
 * de un dump de pg_dump. Cuenta las líneas entre cada `COPY` y el `\.`
 * cerrador. Devuelve 0 si no hay bloques COPY.
 */
function countCopyRows(dump: string): number {
  let total = 0;
  let inCopy = false;
  for (const line of dump.split(/\r?\n/)) {
    if (!inCopy) {
      if (/^COPY\s.+\sFROM\s+stdin;\s*$/i.test(line)) {
        inCopy = true;
      }
    } else {
      if (line === '\\.') {
        inCopy = false;
      } else if (line.length > 0) {
        total++;
      }
    }
  }
  return total;
}

function addDirToZip(zip: AdmZip, dir: string, prefix: string) {
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      addDirToZip(zip, abs, prefix + name + '/');
    } else {
      zip.addFile(prefix + name, fs.readFileSync(abs));
    }
  }
}

function copyDir(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    const stat = fs.statSync(s);
    if (stat.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
