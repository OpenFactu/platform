/**
 * Comprueba las rutas de `/api/data-import` sin levantar el servidor: las
 * despacha en proceso con el mismo `callRouter` que usa el importador.
 *
 * Queda fuera `POST /uploads`, que pasa por `multer` y necesita un stream de
 * verdad — esa se prueba subiendo un fichero desde la pantalla.
 *
 *   npx ts-node --transpile-only src/scripts/check-data-import-api.ts [tenantId]
 */

// Igual que en server.ts: los tipos de documento se registran antes que
// nada, porque el catálogo del importador los genera a partir de ellos.
import '../core/documents/registerDocumentTypes';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { registerImportObjects } from '../core/dataimport/registerImportObjects';
import { pluginImportFields } from '../core/dataimport/pluginFields';
import { DocumentRegistry } from '../core/documents/DocumentRegistry';
import { callRouter, type DispatchContext } from '../core/dataimport/RouterDispatcher';
import dataImportRouter from '../api/dataImport';
import * as schema from '../db/schema';

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) console.log(`   ✅ ${label}`);
  else {
    failures++;
    console.log(`   ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  registerImportObjects();

  const publicDb = ClientFactory.getClient('public');
  const tenantId =
    process.argv[2] || (await publicDb.select().from(schema.tenants).limit(1))[0]?.id;
  const [tenant] = await publicDb
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId));
  const db = await ClientFactory.getTenantClient(tenantId);
  const [user] = await publicDb.select().from(schema.globalUsers).limit(1);

  const ctx: DispatchContext = {
    tenantClient: db,
    tenantId,
    tenantSchema: tenant.schemaName,
    user: { id: user?.id || 'script', role: 'ADMIN', email: user?.email, tenantId },
  };

  const call = (method: any, url: string, body?: any) =>
    callRouter(dataImportRouter, { method, url, body, ctx });

  console.log(`\n[api] Tenant "${tenant.name}"\n`);

  console.log('1) Catálogo');
  const objects = await call('GET', '/objects');
  check(`status ${objects.status}`, objects.ok);
  check('devuelve al menos un objeto', Array.isArray(objects.data) && objects.data.length > 0);
  const partner = (objects.data || []).find((o: any) => o.id === 'partner');
  check('incluye interlocutores', !!partner);
  check(
    'viene con sus campos y claves',
    partner?.fields?.length > 0 && partner?.naturalKeys?.length > 0,
  );
  check('no filtra el router ni las funciones al cliente', partner && !('router' in partner));

  console.log('\n1b) Documentos generados desde DocumentRegistry');
  const invoices = (objects.data || []).find((o: any) => o.id === 'document:SINV');
  check('hay objeto de facturas de venta', !!invoices);
  check('declara sus líneas y la columna de enlace', invoices?.lines?.groupBy === 'Referencia');
  check('las líneas traen sus campos', (invoices?.lines?.fields || []).length > 0);
  check('no ofrece actualización: un documento no se edita', invoices?.supportsUpdate === false);
  check(
    'hay un objeto por cada tipo registrado',
    (objects.data || []).filter((o: any) => o.group === 'documentos').length ===
      DocumentRegistry.getAll().length,
  );

  console.log('\n1c) Campos personalizados del tenant');
  const partnerFields: string[] = (partner?.fields || []).map((f: any) => f.key);
  const pluginCols = partnerFields.filter((k) => k.startsWith('p_'));
  console.log(
    `   · ${pluginCols.length} campo(s) p_* ofrecidos${pluginCols.length ? `: ${pluginCols.join(', ')}` : ' (esta empresa no tiene ninguno definido)'}`,
  );
  const expected = await pluginImportFields('BusinessPartner', tenantId);
  check(
    `el catálogo ofrece los ${expected.length} campos personalizados activos`,
    pluginCols.length === expected.length,
  );

  console.log('\n2) Plantilla');
  const template = await call('GET', '/objects/partner/template.xlsx');
  check(`status ${template.status}`, template.ok);
  check(
    `es un xlsx de ${Buffer.isBuffer(template.data) ? template.data.length : 0} bytes`,
    Buffer.isBuffer(template.data) && template.data.length > 1000,
  );
  const missing = await call('GET', '/objects/no-existe/template.xlsx');
  check(`un objeto inventado da 404 (${missing.status})`, missing.status === 404);

  console.log('\n3) Validaciones al crear el trabajo');
  const sinMapeo = await call('POST', '/jobs', {
    uploadId: 'x',
    objectId: 'partner',
    mapping: {},
    mode: 'insert',
  });
  check(`sin mapeo → 400 (${sinMapeo.status})`, sinMapeo.status === 400);

  const sinClave = await call('POST', '/jobs', {
    uploadId: 'x',
    objectId: 'partner',
    mapping: { A: 'name' },
    mode: 'upsert',
  });
  check(`upsert sin clave → 400 (${sinClave.status})`, sinClave.status === 400);
  check(
    'el mensaje explica qué falta',
    /por qué campo|registro existente/i.test(sinClave.data?.error || ''),
    sinClave.data?.error,
  );

  const uploadPerdido = await call('POST', '/jobs', {
    uploadId: 'no-existe',
    objectId: 'partner',
    mapping: { A: 'name' },
    mode: 'insert',
  });
  check(`fichero caducado → 410 (${uploadPerdido.status})`, uploadPerdido.status === 410);

  console.log('\n4) Mapeos guardados');
  const created = await call('POST', '/mappings', {
    objectId: 'partner',
    name: 'ZZ prueba',
    mapping: { Nombre: 'name' },
    mode: 'insert',
  });
  check(`creado (${created.status})`, created.ok && !!created.data?.id);

  const resaved = await call('POST', '/mappings', {
    objectId: 'partner',
    name: 'ZZ prueba',
    mapping: { Razón: 'name' },
  });
  check('repetir el nombre sobrescribe, no duplica', resaved.data?.id === created.data?.id);

  const list = await call('GET', '/mappings?objectId=partner');
  const mine = (list.data || []).filter((m: any) => m.name === 'ZZ prueba');
  check(`el listado devuelve 1, no 2 (${mine.length})`, mine.length === 1);

  const removed = await call('DELETE', `/mappings/${created.data.id}`);
  check(`borrado (${removed.status})`, removed.ok);

  console.log('\n5) Trabajos y CSV de errores');
  const jobId = crypto.randomUUID();
  await db.insert(schema.dataImportJobs).values({
    id: jobId,
    objectId: 'partner',
    mode: 'insert',
    fileName: 'zz-api.xlsx',
    mapping: {},
    status: 'done',
    totalRows: 2,
    processedRows: 2,
    okRows: 1,
    errorRows: 1,
  });
  await db.insert(schema.dataImportJobRows).values({
    id: crypto.randomUUID(),
    jobId,
    rowNum: 3,
    status: 'error',
    message: 'El NIF/CIF no cumple el formato; con "comillas" y ; puntoycoma',
    raw: { Nombre: 'Prueba S.L.', 'NIF/CIF': 'MAL' },
  });

  try {
    const detail = await call('GET', `/jobs/${jobId}`);
    check(`detalle (${detail.status})`, detail.ok && detail.data?.id === jobId);

    const rows = await call('GET', `/jobs/${jobId}/rows?status=error`);
    check(`filas con error (${(rows.data || []).length})`, (rows.data || []).length === 1);

    const csv = await call('GET', `/jobs/${jobId}/errors.csv`);
    const text = Buffer.isBuffer(csv.data) ? csv.data.toString('utf8') : String(csv.data);
    check(`csv generado (${csv.status})`, csv.ok);
    check('lleva las cabeceras originales más Motivo', text.includes('Nombre;NIF/CIF;Motivo'));
    check('escapa las comillas y el separador del motivo', text.includes('""comillas""'));
    check('lleva BOM para que Excel lo abra bien', text.charCodeAt(0) === 0xfeff);

    const cancel = await call('POST', `/jobs/${jobId}/cancel`);
    check(`cancelar algo que ya terminó → 409 (${cancel.status})`, cancel.status === 409);

    const undoDry = await call('POST', `/jobs/${jobId}/undo`);
    check(`deshacer un trabajo sin altas responde ok (${undoDry.status})`, undoDry.ok);

    // El deshacer corre en segundo plano: hay que esperar a que termine antes
    // de cerrar las conexiones, o escribe sobre un pool ya cerrado.
    const deadline = Date.now() + 15_000;
    let finalStatus = '';
    while (Date.now() < deadline) {
      const [row] = await db
        .select()
        .from(schema.dataImportJobs)
        .where(eq(schema.dataImportJobs.id, jobId));
      finalStatus = row?.status || '';
      if (finalStatus === 'undone' || finalStatus === 'error') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    check(`el trabajo queda como deshecho ("${finalStatus}")`, finalStatus === 'undone');
  } finally {
    await db.delete(schema.dataImportJobs).where(eq(schema.dataImportJobs.id, jobId));
    await ClientFactory.disconnectAll();
  }

  console.log(
    failures === 0 ? '\n✅ Las rutas responden como toca.\n' : `\n❌ ${failures} fallidas.\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error('\n[api] Error fatal:', e?.stack || e?.message || e);
  process.exitCode = 1;
});
