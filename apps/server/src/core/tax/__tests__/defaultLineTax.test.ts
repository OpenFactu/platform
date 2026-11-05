/**
 * Qué impuesto lleva una línea nueva: primero el del interlocutor, luego el del
 * artículo. Sirve para clientes exentos o de otro régimen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultLineTaxGroupId } from '../TaxEngine';
import { partnerObject } from '../../dataimport/objects/partners';
import { callRouter } from '../../dataimport/RouterDispatcher';
import itemsRouter from '../../../api/items';
import * as schema from '../../../db/schema';

test('el impuesto del interlocutor manda sobre el del artículo', () => {
  assert.equal(
    defaultLineTaxGroupId({ defaultTaxGroupId: 'exento' }, { taxGroupId: 'general' }),
    'exento',
  );
});

test('sin impuesto en el interlocutor, se usa el del artículo', () => {
  assert.equal(
    defaultLineTaxGroupId({ defaultTaxGroupId: null }, { taxGroupId: 'general' }),
    'general',
  );
  assert.equal(defaultLineTaxGroupId(null, { taxGroupId: 'general' }), 'general');
});

test('sin ninguno de los dos, la línea queda sin impuesto', () => {
  assert.equal(defaultLineTaxGroupId({}, {}), null);
  assert.equal(defaultLineTaxGroupId(null, null), null);
});

// La web copia el impuesto del artículo a la línea desde este listado. Sin él,
// toda línea entraba al 0 % aunque el artículo tuviera impuesto.
test('el listado de artículos devuelve el impuesto de cada uno', async () => {
  let fields: any;
  const query: any = { from: () => query, leftJoin: () => query, orderBy: async () => [] };
  const tenantClient: any = {
    select: (f: any) => {
      fields = f;
      return query;
    },
  };
  const result = await callRouter(itemsRouter, {
    method: 'GET',
    url: '/',
    ctx: {
      tenantClient,
      tenantId: 't',
      tenantSchema: 'tenant_t',
      user: { id: 'u', role: 'ADMIN' },
    },
  });
  assert.equal(result.ok, true);
  assert.ok(fields.taxGroupId, 'el listado no trae taxGroupId');
});

test('el interlocutor guarda su impuesto por defecto', () => {
  assert.ok(schema.businessPartners.defaultTaxGroupId);
});

test('el importador de interlocutores admite el impuesto por defecto', () => {
  const field = partnerObject.fields.find((f) => f.bodyKey === 'defaultTaxGroupId');
  assert.ok(field, 'falta el campo en el importador');
  assert.equal(field?.type, 'ref');
  assert.equal(field?.ref?.table, 'TaxGroup');
  assert.ok(partnerObject.dependsOn?.includes('taxGroup'));
});
