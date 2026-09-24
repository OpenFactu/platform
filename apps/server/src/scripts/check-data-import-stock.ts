/**
 * Comprueba la importación de existencias de extremo a extremo: un Excel con
 * dos hojas (cabecera + líneas) que acaba siendo una entrada de mercancía con
 * sus líneas, en borrador.
 *
 * Es el caso más completo del importador —cabecera y líneas emparejadas por la
 * columna "Referencia", varias referencias resueltas por nombre y código— así
 * que sirve también de prueba del camino que siguen los documentos.
 *
 *   npx ts-node --transpile-only src/scripts/check-data-import-stock.ts [tenantId]
 */

import '../core/documents/registerDocumentTypes';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx';
import { desc, eq, like } from 'drizzle-orm';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { registerImportObjects } from '../core/dataimport/registerImportObjects';
import { ImportJobRunner } from '../core/dataimport/ImportJobRunner';
import * as schema from '../db/schema';

const REF = 'ZZ-APERTURA';

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) console.log(`   ✅ ${label}`);
  else {
    failures++;
    console.log(`   ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Libro de dos hojas, como el que sale de la plantilla. */
function writeWorkbook(header: any[][], lines: any[][]): string {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(header), 'Datos');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(lines), 'Existencias');
  const file = path.join(os.tmpdir(), `keirost-stock-${crypto.randomUUID()}.xlsx`);
  fs.writeFileSync(file, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  return file;
}

async function waitFor(db: any, jobId: string, timeoutMs = 60_000): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [job] = await db
      .select()
      .from(schema.dataImportJobs)
      .where(eq(schema.dataImportJobs.id, jobId));
    if (job && job.status !== 'pending' && job.status !== 'running') return job;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('El trabajo no terminó a tiempo');
}

async function main() {
  registerImportObjects();

  const publicDb = ClientFactory.getClient('public');
  const tenantId = process.argv[2] || (await publicDb.select().from(schema.tenants).limit(1))[0]?.id;
  const [tenant] = await publicDb
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId));
  const db = await ClientFactory.getTenantClient(tenantId);
  const [user] = await publicDb.select().from(schema.globalUsers).limit(1);

  console.log(`\n[stock] Tenant "${tenant.name}"\n`);

  // Se necesitan un almacén y dos artículos SIN gestión por lotes: los que
  // van por lote exigen número de lote, y eso se prueba aparte más abajo.
  const [warehouse] = await db.select().from(schema.warehouses).limit(1);
  const items = await db
    .select()
    .from(schema.items)
    .where(eq(schema.items.manageBy, 'N'))
    .limit(2);
  const [batchItem] = await db
    .select()
    .from(schema.items)
    .where(eq(schema.items.manageBy, 'B'))
    .limit(1);

  if (!warehouse || items.length < 2) {
    console.log('   ⚠ Este tenant no tiene almacén o no llega a dos artículos sin lotes.');
    await ClientFactory.disconnectAll();
    return;
  }
  console.log(`[stock] Almacén "${warehouse.name}", artículos ${items.map((i: any) => i.code).join(', ')}\n`);

  const dispatch = {
    tenantClient: db,
    tenantId,
    tenantSchema: tenant.schemaName,
    user: { id: user?.id || 'script', role: 'ADMIN', email: user?.email, tenantId },
  };

  const filePath = writeWorkbook(
    [
      ['Referencia', 'Código', 'Almacén', 'Fecha', 'Motivo', 'Notas'],
      [REF, REF, warehouse.name, '01/01/2026', 'adjustment', 'Inventario de apertura'],
    ],
    [
      ['Referencia', 'Artículo', 'Cantidad', 'Notas de la línea'],
      [REF, items[0].code, '250', 'primera'],
      [REF, items[1].code, '1.250,5', 'segunda con decimales'],
      // Una línea de otra referencia que NO debe colarse en esta cabecera.
      ['OTRA-REF', items[0].code, '99', 'no debería entrar'],
    ],
  );

  const jobId = crypto.randomUUID();
  await db.insert(schema.dataImportJobs).values({
    id: jobId,
    objectId: 'goodsReceipt',
    mode: 'insert',
    fileName: 'zz-stock.xlsx',
    mapping: {
      Código: 'code',
      Almacén: 'warehouse',
      Fecha: 'date',
      Motivo: 'type',
      Notas: 'notes',
      Artículo: 'lineItem',
      Cantidad: 'lineQuantity',
      'Notas de la línea': 'lineNotes',
    },
    status: 'pending',
  });

  try {
    console.log('1) Importación de una entrada con dos líneas');
    ImportJobRunner.start({
      jobId,
      objectId: 'goodsReceipt',
      mode: 'insert',
      dryRun: false,
      mapping: {
        Código: 'code',
        Almacén: 'warehouse',
        Fecha: 'date',
        Motivo: 'type',
        Notas: 'notes',
        Artículo: 'lineItem',
        Cantidad: 'lineQuantity',
        'Notas de la línea': 'lineNotes',
      },
      fileName: 'zz-stock.xlsx',
      filePath,
      sheetName: 'Datos',
      linesSheetName: 'Existencias',
      dispatch,
      tenantSchema: tenant.schemaName,
    });

    const job = await waitFor(db, jobId);
    check(`estado "${job.status}"`, job.status === 'done');

    if (job.okRows !== 1) {
      const rows = await db
        .select()
        .from(schema.dataImportJobRows)
        .where(eq(schema.dataImportJobRows.jobId, jobId));
      for (const r of rows) console.log(`      fila ${r.rowNum} [${r.status}]: ${r.message}`);
    }
    check(`1 cabecera creada (${job.okRows} ok, ${job.errorRows} error)`, job.okRows === 1);

    const [receipt] = await db
      .select()
      .from(schema.goodsReceipts)
      .where(like(schema.goodsReceipts.code, `${REF}%`))
      .orderBy(desc(schema.goodsReceipts.createdAt));
    check('la entrada existe en GoodsReceipt', !!receipt);
    if (!receipt) return;

    check(`el almacén se resolvió por nombre`, receipt.warehouseId === warehouse.id);
    check(`el motivo llegó como "${receipt.type}"`, receipt.type === 'adjustment');
    check(`nace en borrador ("${receipt.status}")`, receipt.status === 'draft');
    const fecha = new Date(receipt.date);
    const fechaTexto = Number.isNaN(fecha.getTime())
      ? `sin fecha válida (${JSON.stringify(receipt.date)})`
      : fecha.toISOString().slice(0, 10);
    check(
      `la fecha del fichero llegó como ${fechaTexto}`,
      !Number.isNaN(fecha.getTime()) && fecha.toISOString().startsWith('2026-01-01'),
    );

    console.log('\n2) Las líneas, agrupadas por su referencia');
    const lines = await db
      .select()
      .from(schema.goodsReceiptLines)
      .where(eq(schema.goodsReceiptLines.receiptId, receipt.id));

    check(`2 líneas, no 3 (la de otra referencia se queda fuera): ${lines.length}`, lines.length === 2);
    check(
      'los artículos se resolvieron por código',
      lines.every((l: any) => items.some((i: any) => i.id === l.itemId)),
    );
    const cantidades = lines.map((l: any) => Number(l.quantity)).sort((a: number, b: number) => a - b);
    check(
      `las cantidades se convirtieron del formato español: ${cantidades.join(' y ')}`,
      cantidades[0] === 250 && cantidades[1] === 1250.5,
    );

    console.log('\n3) El stock NO se ha movido todavía');
    const [itemAhora] = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.id, items[0].id));
    check(
      `el artículo sigue con ${itemAhora.stock} (se aplica al confirmar la entrada)`,
      Number(itemAhora.stock) === Number(items[0].stock),
    );

    console.log('\n4) Las reglas del almacén se aplican igual que a mano');
    if (!batchItem) {
      console.log('   · Este tenant no tiene ningún artículo gestionado por lotes; caso omitido.');
    } else {
      const batchJobId = crypto.randomUUID();
      const batchMapping = { Almacén: 'warehouse', Artículo: 'lineItem', Cantidad: 'lineQuantity' };
      await db.insert(schema.dataImportJobs).values({
        id: batchJobId,
        objectId: 'goodsReceipt',
        mode: 'insert',
        fileName: 'zz-stock.xlsx',
        mapping: batchMapping,
        status: 'pending',
      });
      ImportJobRunner.start({
        jobId: batchJobId,
        objectId: 'goodsReceipt',
        mode: 'insert',
        dryRun: false,
        mapping: batchMapping,
        fileName: 'zz-stock.xlsx',
        filePath: writeWorkbook(
          [
            ['Referencia', 'Almacén'],
            ['ZZ-LOTE', warehouse.name],
          ],
          [
            ['Referencia', 'Artículo', 'Cantidad'],
            ['ZZ-LOTE', batchItem.code, '5'],
          ],
        ),
        sheetName: 'Datos',
        linesSheetName: 'Existencias',
        dispatch,
        tenantSchema: tenant.schemaName,
      });

      const batchJob = await waitFor(db, batchJobId);
      const [failed] = await db
        .select()
        .from(schema.dataImportJobRows)
        .where(eq(schema.dataImportJobRows.jobId, batchJobId));

      check(`un artículo por lotes sin lote se rechaza (${batchJob.errorRows} error)`, batchJob.errorRows === 1);
      check(
        `el motivo lo explica: "${(failed?.message || '').slice(0, 70)}…"`,
        /lote/i.test(failed?.message || ''),
      );
      await db.delete(schema.dataImportJobs).where(eq(schema.dataImportJobs.id, batchJobId));
    }
  } finally {
    console.log('\n[stock] Limpiando…');
    try {
      const created = await db
        .select()
        .from(schema.goodsReceipts)
        .where(like(schema.goodsReceipts.code, `${REF}%`));
      for (const r of created) {
        await db
          .delete(schema.goodsReceiptLines)
          .where(eq(schema.goodsReceiptLines.receiptId, r.id));
        await db.delete(schema.goodsReceipts).where(eq(schema.goodsReceipts.id, r.id));
      }
      await db.delete(schema.dataImportJobs).where(eq(schema.dataImportJobs.id, jobId));
      console.log(`[stock] Borradas ${created.length} entradas de prueba.`);
    } catch (e: any) {
      console.error('[stock] No se pudo limpiar del todo:', e?.message);
    }
    await ClientFactory.disconnectAll();
  }

  console.log(
    failures === 0
      ? '\n✅ Las existencias entran como entrada de mercancía en borrador.\n'
      : `\n❌ ${failures} comprobación(es) fallidas.\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error('\n[stock] Error fatal:', e?.stack || e?.message || e);
  process.exitCode = 1;
});
