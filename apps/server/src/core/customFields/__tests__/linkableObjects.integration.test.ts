/** Campos de usuario enlazados a un objeto del sistema: buscar, guardar y enseñar. */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import {
  startDocumentsHarness,
  testDatabaseUrl,
  type DocumentsHarness,
  type HarnessUser,
} from '../../documents/__tests__/documentsHarness';
import { PluginFieldManager } from '../../plugins/PluginFieldManager';
import { PdfPayloadBuilder } from '../../documents/PdfPayloadBuilder';
import { effectiveRefObject } from '../linkableObjects';
import { pluginImportFields } from '../../dataimport/pluginFields';

describe('campos enlazados', { skip: !testDatabaseUrl }, () => {
  let h: DocumentsHarness;
  let reader: HarnessUser;
  let nobody: HarnessUser;
  let partnerId: string;
  let itemId: string;

  const READ = { read: true, write: false, delete: false };

  before(async () => {
    h = await startDocumentsHarness();
    reader = await h.seedUser('lector', { '/partners': READ });
    nobody = await h.seedUser('nadie', {});
    partnerId = await h.seedPartner();
    itemId = await h.seedItem({ stock: 10 });
    await h.query(`UPDATE "BusinessPartner" SET name = 'Zapatería Oriol' WHERE id = '${partnerId}'`);
  });
  after(async () => {
    await h?.close();
  });

  const search = (object: string, q: string, user?: HarnessUser) =>
    h.api('GET', `/linked-objects/${object}/search?q=${encodeURIComponent(q)}`, undefined, user);
  const resolve = (object: string, ids: string[], user?: HarnessUser) =>
    h.api('POST', `/linked-objects/${object}/resolve`, { ids }, user);
  const addField = (body: Record<string, unknown>) => h.api('POST', '/custom-fields', body);

  describe('catálogo', () => {
    test('trae los objetos del sistema, los documentos y las tablas propias', async () => {
      await h.db.execute(sql.raw(`CREATE TABLE "pt_maquinas" (id text primary key, "p_nombre" text)`));
      await h.db.execute(sql.raw(`INSERT INTO "pt_maquinas" VALUES ('m1', 'Torno grande')`));
      await h.publicDb.execute(
        sql`INSERT INTO public."PluginTable" (id, "pluginId", "tenantId", "tableName", definition, label, "displayField", kind)
            VALUES (${`pt-${h.tenantId}`}, '__user__', ${h.tenantId}, 'pt_maquinas', '{}', 'Máquinas', 'p_nombre', 'master')`,
      );
      const { status, data } = await h.api('GET', '/linked-objects');
      assert.equal(status, 200);
      const ids = data.map((o: any) => o.id);
      for (const id of ['partner', 'item', 'warehouse', 'employee', 'doc:SINV', 'doc:PO', 'table:pt_maquinas']) {
        assert.ok(ids.includes(id), id);
      }
      const partner = data.find((o: any) => o.id === 'partner');
      assert.equal(partner.label, 'Interlocutor');
      assert.equal('table' in partner, false, 'la tabla física no sale de aquí');
    });

    test('solo enseña lo que ese usuario puede leer', async () => {
      const { data } = await h.api('GET', '/linked-objects', undefined, reader);
      assert.deepEqual(data.map((o: any) => o.id), ['partner']);
    });
  });

  describe('buscar', () => {
    test('un usuario normal con permiso busca, y sin él recibe 403', async () => {
      const found = await search('partner', 'zapater', reader);
      assert.equal(found.status, 200);
      assert.equal(found.data.length, 1);
      assert.equal(found.data[0].id, partnerId);
      assert.match(found.data[0].label, /Zapatería Oriol/);
      assert.equal((await search('partner', 'zapater', nobody)).status, 403);
      assert.equal((await search('item', 'a', reader)).status, 403);
    });

    test('un objeto que no existe da 404', async () => {
      assert.equal((await search('nada', 'x')).status, 404);
      assert.equal((await search('table:pt_no_existe', 'x')).status, 404);
      assert.equal((await search('doc:NADA', 'x')).status, 404);
    });

    test('el texto no se interpreta', async () => {
      for (const q of [`'; DROP TABLE "Item"; --`, `%`, `_`, `" OR 1=1 --`]) {
        const res = await search('partner', q);
        assert.equal(res.status, 200, q);
        assert.deepEqual(res.data, [], q);
      }
      assert.ok((await h.query(`SELECT count(*) FROM "Item"`)).length);
    });

    test('un documento se encuentra por su número y enseña su código y a quién', async () => {
      const id = await h.invoice('sales', [{ itemId, quantity: 1 }], { partnerId });
      const [row] = await h.query(`SELECT "docNum" FROM "SalesInvoice" WHERE id = '${id}'`);
      const res = await search('doc:SINV', String(row.docNum));
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const hit = res.data.find((d: any) => d.id === id);
      assert.ok(hit, JSON.stringify(res.data));
      assert.match(hit.label, new RegExp(String(row.docNum).padStart(6, '0')));
      assert.match(hit.label, /Zapatería Oriol/);
      assert.ok((await search('doc:SINV', 'zapater')).data.some((d: any) => d.id === id));
    });

    test('una tabla propia se busca por su campo a mostrar', async () => {
      const res = await search('table:pt_maquinas', 'torno');
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.deepEqual(res.data, [{ id: 'm1', label: 'Torno grande' }]);
    });
  });

  describe('resolver', () => {
    test('da el nombre y dónde abrirlo; sin permiso, ni lo uno ni lo otro', async () => {
      const ok = await resolve('partner', [partnerId], reader);
      assert.equal(ok.status, 200);
      assert.match(ok.data[0].label, /Zapatería Oriol/);
      assert.equal(ok.data[0].route, `/partners/${partnerId}`);

      const hidden = await resolve('item', [itemId], reader);
      assert.deepEqual(hidden.data, [{ id: itemId, hidden: true }]);
    });

    test('lo que ya no existe se dice', async () => {
      const { data } = await resolve('partner', ['borrado'], reader);
      assert.deepEqual(data, [{ id: 'borrado', missing: true }]);
    });
  });

  describe('crear y guardar', () => {
    test('un campo se crea eligiendo el objeto, no una tabla', async () => {
      const res = await addField({
        tableName: 'BusinessPartner',
        fieldName: 'articulo_favorito',
        fieldType: 'REFERENCE',
        label: 'Artículo favorito',
        refObject: 'item',
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const [field] = (
        await h.publicDb.execute(
          sql`SELECT * FROM public."PluginField" WHERE id = ${res.data.id}`,
        )
      ).rows as any[];
      assert.equal(field.refObject, 'item');
      assert.equal(field.refTable, 'Item');
    });

    test('un objeto que no existe da 400', async () => {
      const res = await addField({
        tableName: 'BusinessPartner',
        fieldName: 'malo',
        fieldType: 'REFERENCE',
        label: 'Malo',
        refObject: 'nada',
      });
      assert.equal(res.status, 400);
    });

    test('un campo antiguo con solo la tabla se trata como su objeto', () => {
      assert.equal(effectiveRefObject({ refObject: null, refTable: 'BusinessPartner' }), 'partner');
      assert.equal(effectiveRefObject({ refObject: null, refTable: 'SalesInvoice' }), 'doc:SINV');
      assert.equal(effectiveRefObject({ refObject: null, refTable: 'pt_maquinas' }), 'table:pt_maquinas');
      assert.equal(effectiveRefObject({ refObject: null, refTable: 'Rara' }), null);
      assert.equal(effectiveRefObject({ refObject: 'item', refTable: 'Item' }), 'item');
    });

    test('al guardar se comprueba que el valor exista', async () => {
      await addField({
        tableName: 'SalesInvoice',
        fieldName: 'contacto',
        fieldType: 'REFERENCE',
        label: 'Contacto',
        refObject: 'partner',
      });
      await assert.rejects(
        PluginFieldManager.validateAndExtract(
          'SalesInvoice',
          { p_contacto: 'no-existe' },
          h.tenantId,
          'ADMIN',
        ),
        /Contacto.*no existe/,
      );
      const ok = await PluginFieldManager.validateAndExtract(
        'SalesInvoice',
        { p_contacto: partnerId },
        h.tenantId,
        'ADMIN',
      );
      assert.equal(ok.p_contacto, partnerId);
    });

    test('los campos de usuario de un documento y de sus líneas se guardan y se leen', async () => {
      const text = await addField({
        tableName: 'SalesInvoice',
        fieldName: 'obra',
        fieldType: 'TEXT',
        label: 'Obra',
      });
      assert.equal(text.status, 200, JSON.stringify(text.data));
      const list = await addField({
        tableName: 'SalesInvoice',
        fieldName: 'etiquetas',
        fieldType: 'MULTISELECT',
        label: 'Etiquetas',
        options: ['a', 'b'],
      });
      assert.equal(list.status, 200, JSON.stringify(list.data));
      const line = await addField({
        tableName: 'SalesInvoiceLine',
        fieldName: 'lote_cliente',
        fieldType: 'TEXT',
        label: 'Lote del cliente',
      });
      assert.equal(line.status, 200, JSON.stringify(line.data));

      const id = await h.invoice('sales', [{ itemId, quantity: 1, p_lote_cliente: 'L-9' }], {
        partnerId,
        p_obra: "Obra de O'Brien",
        p_etiquetas: ['a', 'b'],
      });
      const [header] = await h.query(`SELECT * FROM "SalesInvoice" WHERE id = '${id}'`);
      assert.equal(header.p_obra, "Obra de O'Brien");
      assert.deepEqual(header.p_etiquetas, ['a', 'b']);
      const [row] = await h.query(`SELECT * FROM "SalesInvoiceLine" WHERE "invoiceId" = '${id}'`);
      assert.equal(row.p_lote_cliente, 'L-9');

      const read = await h.api('GET', `/sales/invoices/${id}`);
      assert.equal(read.status, 200);
      assert.equal(read.data.p_obra, "Obra de O'Brien");
      assert.equal(read.data.lines[0].p_lote_cliente, 'L-9');
    });

    test('el PDF lleva el nombre, no el id', async () => {
      const id = await h.invoice('sales', [{ itemId, quantity: 1 }], {
        partnerId,
        p_contacto: partnerId,
      });
      const [stored] = await h.query(`SELECT "p_contacto" FROM "SalesInvoice" WHERE id = '${id}'`);
      assert.equal(stored.p_contacto, partnerId, 'el valor tiene que haberse guardado');
      const payload: any = await PdfPayloadBuilder.build('SINV', id, h.db, 'es', h.tenantId);
      assert.match(String(payload.doc?.customFields?.Contacto), /Zapatería Oriol/);
    });

    test('el importador busca por las columnas del objeto', async () => {
      const fields = await pluginImportFields('SalesInvoice', h.tenantId);
      const field = fields.find((f: any) => f.key === 'p_contacto');
      assert.ok(field?.ref);
      assert.equal(field.ref.table, 'BusinessPartner');
      assert.ok(field.ref.matchBy.includes('code'));
    });
  });
});
