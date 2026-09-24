/**
 * Prueba de extremo a extremo del importador contra la base de datos real:
 * genera un Excel, lo pasa por el mismo motor que usa la pantalla y comprueba
 * lo que quedó escrito.
 *
 * Cubre lo que los tests unitarios no pueden: que la migración 071 esté
 * aplicada, que el trabajo avance y termine, que las altas lleguen a la tabla
 * con la numeración del handler, que la simulación no escriba, que el upsert
 * actualice en vez de duplicar y que el deshacer borre.
 *
 * Todo lo que crea lo borra al terminar. Ejecuta con:
 *   npx ts-node --transpile-only src/scripts/check-data-import.ts [tenantId]
 */

// Igual que en server.ts: los tipos de documento se registran antes que
// nada, porque el catálogo del importador los genera a partir de ellos.
import '../core/documents/registerDocumentTypes';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx';
import { eq, like } from 'drizzle-orm';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { MigrationManager } from '../core/tenant/MigrationManager';
import { registerImportObjects } from '../core/dataimport/registerImportObjects';
import { ImportJobRunner } from '../core/dataimport/ImportJobRunner';
import { ImportRegistry } from '../core/dataimport/ImportRegistry';
import * as schema from '../db/schema';

const PREFIX = 'ZZIMP';

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) console.log(`   ✅ ${label}`);
  else {
    failures++;
    console.log(`   ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function writeWorkbook(rows: any[][]): string {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Datos');
  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
  const file = path.join(os.tmpdir(), `keirost-check-${crypto.randomUUID()}.xlsx`);
  fs.writeFileSync(file, buffer);
  return file;
}

/** Espera a que el trabajo alcance un estado que cumpla `done`. */
async function waitFor(
  db: any,
  jobId: string,
  done: (job: any) => boolean,
  timeoutMs = 60_000,
): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [job] = await db
      .select()
      .from(schema.dataImportJobs)
      .where(eq(schema.dataImportJobs.id, jobId));
    if (job && done(job)) return job;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`El trabajo ${jobId} no llegó al estado esperado en ${timeoutMs} ms`);
}

/** Espera a que termine una importación. */
const waitForJob = (db: any, jobId: string) =>
  waitFor(db, jobId, (j) => j.status !== 'pending' && j.status !== 'running');

async function runImport(opts: {
  db: any;
  dispatch: any;
  tenantSchema: string;
  filePath: string;
  mode: 'insert' | 'update' | 'upsert';
  matchBy?: string;
  dryRun?: boolean;
  mapping: Record<string, string>;
}): Promise<any> {
  const jobId = crypto.randomUUID();
  await opts.db.insert(schema.dataImportJobs).values({
    id: jobId,
    objectId: 'partner',
    mode: opts.mode,
    dryRun: !!opts.dryRun,
    fileName: 'prueba.xlsx',
    mapping: opts.mapping,
    matchBy: opts.matchBy || null,
    status: 'pending',
  });

  ImportJobRunner.start({
    jobId,
    objectId: 'partner',
    mode: opts.mode,
    dryRun: !!opts.dryRun,
    mapping: opts.mapping,
    matchBy: opts.matchBy,
    fileName: 'prueba.xlsx',
    filePath: opts.filePath,
    dispatch: opts.dispatch,
    tenantSchema: opts.tenantSchema,
  });

  return waitForJob(opts.db, jobId);
}

const MAPPING = {
  Código: 'code',
  Nombre: 'name',
  'NIF/CIF': 'nif',
  País: 'countryCode',
  Grupo: 'group',
  Calle: 'street',
  Ciudad: 'city',
};

async function main() {
  registerImportObjects();
  check('el catálogo tiene el objeto "partner"', !!ImportRegistry.get('partner'));

  const publicDb = ClientFactory.getClient('public');
  const tenantId =
    process.argv[2] || (await publicDb.select().from(schema.tenants).limit(1))[0]?.id;
  if (!tenantId) throw new Error('No hay ningún tenant en la base de datos.');

  const [tenant] = await publicDb
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId));
  const db = await ClientFactory.getTenantClient(tenantId);
  const [user] = await publicDb.select().from(schema.globalUsers).limit(1);

  console.log(`\n[import] Tenant "${tenant.name}" (${tenant.schemaName})\n`);

  console.log('0) Migración 071 aplicada');
  await MigrationManager.syncAllTenants();
  try {
    await db.select().from(schema.dataImportJobs).limit(1);
    check('las tablas del importador existen', true);
  } catch (e: any) {
    check('las tablas del importador existen', false, e.message);
    return;
  }

  const dispatch = {
    tenantClient: db,
    tenantId,
    tenantSchema: tenant.schemaName,
    user: { id: user?.id || 'script', role: 'ADMIN', email: user?.email, tenantId },
  };

  const groupId = crypto.randomUUID();
  await db.insert(schema.partnerGroups).values({
    id: groupId,
    code: PREFIX,
    name: 'Grupo de prueba del importador',
    codePrefix: PREFIX,
    isCustomer: true,
    isVendor: false,
  });

  try {
    // Cinco filas: tres buenas, una que solo falla en el handler (NIF con
    // formato inválido para España) y una que falla ya en el fichero (sin
    // nombre). El NIF de la primera va sin país a propósito: así no se valida
    // el formato y no depende de qué NIF haya ya en la base de esta empresa.
    const nif = `ZZ${Date.now().toString().slice(-8)}`;
    const rows: any[][] = [
      ['Código', 'Nombre', 'NIF/CIF', 'País', 'Grupo', 'Calle', 'Ciudad'],
      ['', 'Importada Uno S.L.', nif, '', PREFIX, 'C/ Mayor 1', 'Valencia'],
      ['', 'Importada Dos S.L.', '', 'ES', PREFIX, '', ''],
      ['', 'Importada Tres S.L.', '', '', PREFIX, 'C/ Menor 3', 'Alicante'],
      ['', 'Importada Mala S.L.', 'NO-ES-UN-NIF', 'ES', PREFIX, '', ''],
      ['', '', '', 'ES', PREFIX, '', ''],
    ];

    console.log('\n1) Simulación: valida pero no escribe');
    const before = (
      await db
        .select()
        .from(schema.businessPartners)
        .where(like(schema.businessPartners.code, `${PREFIX}-%`))
    ).length;
    const dry = await runImport({
      db,
      dispatch,
      tenantSchema: tenant.schemaName,
      filePath: writeWorkbook(rows),
      mode: 'insert',
      dryRun: true,
      mapping: MAPPING,
    });
    const afterDry = (
      await db
        .select()
        .from(schema.businessPartners)
        .where(like(schema.businessPartners.code, `${PREFIX}-%`))
    ).length;

    check(`estado "${dry.status}"`, dry.status === 'done');
    // 4 y no 3: la simulación comprueba el fichero (tipos, obligatorios,
    // referencias y claves repetidas), no las reglas del módulo. El NIF con
    // formato inválido lo rechaza `partners.ts` al escribir, y eso el
    // simulacro no lo puede saber sin escribir. Está documentado en la
    // pantalla para que nadie lea "0 errores" como "va a entrar todo".
    check(
      `4 filas válidas, 1 con error (${dry.okRows}/${dry.errorRows})`,
      dry.okRows === 4 && dry.errorRows === 1,
    );
    check('no se creó nada', afterDry === before);

    console.log('\n2) Importación real');
    const job = await runImport({
      db,
      dispatch,
      tenantSchema: tenant.schemaName,
      filePath: writeWorkbook(rows),
      mode: 'insert',
      mapping: MAPPING,
    });

    check(`estado "${job.status}"`, job.status === 'done');
    check(
      `3 altas y 2 errores (${job.okRows}/${job.errorRows})`,
      job.okRows === 3 && job.errorRows === 2,
    );

    const created = await db
      .select()
      .from(schema.businessPartners)
      .where(like(schema.businessPartners.code, `${PREFIX}-%`));
    check(`${created.length} interlocutores en la tabla`, created.length === 3);

    const codes = created.map((p: any) => p.code).sort();
    check(
      `numeración del handler: ${codes.join(', ')}`,
      codes.join(',') === `${PREFIX}-00001,${PREFIX}-00002,${PREFIX}-00003`,
    );

    const uno = created.find((p: any) => p.name === 'Importada Uno S.L.');
    check('el NIF se guardó', uno?.nif === nif);
    check('el grupo se resolvió a su id', uno?.groupId === groupId);

    const addresses = await db
      .select()
      .from(schema.partnerAddresses)
      .where(eq(schema.partnerAddresses.partnerId, uno.id));
    check(
      'la dirección se creó a partir de las columnas planas',
      addresses[0]?.city === 'Valencia',
    );

    console.log('\n3) Los errores quedan explicados fila a fila');
    const errorRows = await db
      .select()
      .from(schema.dataImportJobRows)
      .where(eq(schema.dataImportJobRows.jobId, job.id));
    const failed = errorRows.filter((r: any) => r.status === 'error');
    check(`${failed.length} filas con motivo`, failed.length === 2);
    check(
      'el NIF inválido se explica',
      failed.some((r: any) => /NIF/i.test(r.message || '')),
      failed.map((r: any) => r.message).join(' | '),
    );
    check(
      'la fila sin nombre se explica',
      failed.some((r: any) => /obligatorio/i.test(r.message || '')),
      failed.map((r: any) => r.message).join(' | '),
    );
    check(
      'la fila fallida conserva sus datos originales para el CSV de errores',
      failed.every((r: any) => r.raw && Object.keys(r.raw).length > 0),
    );

    console.log('\n4) Un NIF que ya existe se rechaza antes de escribir');
    const dupe = await runImport({
      db,
      dispatch,
      tenantSchema: tenant.schemaName,
      filePath: writeWorkbook([
        ['Nombre', 'NIF/CIF'],
        ['Otra Empresa S.L.', nif],
      ]),
      mode: 'insert',
      mapping: { Nombre: 'name', 'NIF/CIF': 'nif' },
    });
    const dupeRow = (
      await db
        .select()
        .from(schema.dataImportJobRows)
        .where(eq(schema.dataImportJobRows.jobId, dupe.id))
    )[0];
    check(`1 error (${dupe.errorRows})`, dupe.errorRows === 1);
    check(
      `el mensaje dice qué campo choca: "${dupeRow?.message}"`,
      /Ya existe un registro con NIF/.test(dupeRow?.message || ''),
    );

    console.log('\n5) Upsert: actualiza en vez de duplicar');
    const upsertRows: any[][] = [
      ['Código', 'Nombre', 'Ciudad'],
      [`${PREFIX}-00001`, 'Importada Uno RENOMBRADA', 'Sevilla'],
    ];
    const upsert = await runImport({
      db,
      dispatch,
      tenantSchema: tenant.schemaName,
      filePath: writeWorkbook(upsertRows),
      mode: 'upsert',
      matchBy: 'code',
      mapping: { Código: 'code', Nombre: 'name', Ciudad: 'city' },
    });

    const afterUpsert = await db
      .select()
      .from(schema.businessPartners)
      .where(like(schema.businessPartners.code, `${PREFIX}-%`));
    check(`1 fila actualizada (${upsert.okRows} ok)`, upsert.okRows === 1);
    check('sigue habiendo 3, no 4', afterUpsert.length === 3);
    check(
      'el nombre cambió',
      afterUpsert.find((p: any) => p.code === `${PREFIX}-00001`)?.name ===
        'Importada Uno RENOMBRADA',
    );

    console.log('\n6) Modo actualización contra algo que no existe');
    const missing = await runImport({
      db,
      dispatch,
      tenantSchema: tenant.schemaName,
      filePath: writeWorkbook([
        ['Código', 'Nombre'],
        ['NO-EXISTE-999', 'Fantasma'],
      ]),
      mode: 'update',
      matchBy: 'code',
      mapping: { Código: 'code', Nombre: 'name' },
    });
    check(`0 altas y 1 error (${missing.okRows}/${missing.errorRows})`, missing.errorRows === 1);

    console.log('\n7) Deshacer la importación');
    ImportJobRunner.startUndo({ jobId: job.id, objectId: 'partner', dispatch });
    // Ojo: el trabajo ya estaba en "done", así que hay que esperar al estado
    // final del deshacer, no a que deje de estar en curso.
    const undone = await waitFor(db, job.id, (j) => j.status === 'undone' || j.status === 'error');
    const afterUndo = await db
      .select()
      .from(schema.businessPartners)
      .where(like(schema.businessPartners.code, `${PREFIX}-%`));

    check(`estado "${undone.status}"`, undone.status === 'undone');
    check(`quedan ${afterUndo.length} interlocutores`, afterUndo.length === 0);
  } finally {
    console.log('\n[import] Limpiando…');
    try {
      const left = await db
        .select()
        .from(schema.businessPartners)
        .where(like(schema.businessPartners.code, `${PREFIX}-%`));
      for (const p of left) {
        await db.delete(schema.partnerAddresses).where(eq(schema.partnerAddresses.partnerId, p.id));
        await db.delete(schema.businessPartners).where(eq(schema.businessPartners.id, p.id));
      }
      await db.delete(schema.partnerGroups).where(eq(schema.partnerGroups.id, groupId));
      // Los trabajos de prueba y sus filas (las filas caen en cascada).
      const jobs = await db.select().from(schema.dataImportJobs);
      for (const j of jobs.filter((j: any) => j.fileName === 'prueba.xlsx')) {
        await db.delete(schema.dataImportJobs).where(eq(schema.dataImportJobs.id, j.id));
      }
      console.log(`[import] Borrados ${left.length} interlocutores, el grupo y los trabajos.`);
    } catch (e: any) {
      console.error('[import] No se pudo limpiar del todo:', e?.message);
    }
    await ClientFactory.disconnectAll();
  }

  console.log(
    failures === 0
      ? '\n✅ El importador funciona de extremo a extremo.\n'
      : `\n❌ ${failures} comprobación(es) fallidas.\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error('\n[import] Error fatal:', e?.stack || e?.message || e);
  process.exitCode = 1;
});
