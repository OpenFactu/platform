/**
 * Aquí está la lógica que decide qué se escribe y qué se rechaza. Los tests
 * usan una configuración de objeto de mentira y un `lookup` de mentira: no
 * hacen falta ni Postgres ni Express para comprobar las reglas.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prepareRow, setPath, isBlank } from '../rowPreparation';
import type { ImportObjectConfig } from '../ImportRegistry';

/** Lookup de mentira: un diccionario tabla → { valor: id }. */
function stubLookup(data: Record<string, Record<string, string>> = {}) {
  return {
    resolveRef: async (ref: any, value: string) => data[ref.table]?.[value.toLowerCase()] ?? null,
    findExisting: async (table: string, _column: string, value: string) =>
      data[table]?.[value.toLowerCase()] ?? null,
  };
}

const partner = {
  id: 'partner',
  label: 'Interlocutores',
  group: 'maestros',
  modulePath: '/partners',
  table: 'BusinessPartner',
  router: () => ({}) as any,
  createPath: '/',
  updatePath: (id: string) => `/${id}`,
  naturalKeys: [
    { key: 'code', column: 'code', label: 'Código', unique: true },
    { key: 'nif', column: 'nif', label: 'NIF/CIF', unique: true },
    { key: 'name', column: 'name', label: 'Nombre' },
  ],
  fields: [
    { key: 'code', label: 'Código', type: 'string' },
    { key: 'name', label: 'Nombre', type: 'string', required: 'onInsert' },
    { key: 'nif', label: 'NIF/CIF', type: 'string' },
    { key: 'creditLimit', label: 'Límite de crédito', type: 'number' },
    {
      key: 'group',
      label: 'Grupo',
      type: 'ref',
      bodyKey: 'groupId',
      ref: { table: 'PartnerGroup', matchBy: ['code'], label: 'grupo' },
    },
    { key: 'street', label: 'Calle', type: 'string', bodyKey: 'address.street' },
  ],
} as unknown as ImportObjectConfig;

const mapping = {
  Código: 'code',
  Nombre: 'name',
  'NIF/CIF': 'nif',
  Límite: 'creditLimit',
  Grupo: 'group',
  Calle: 'street',
};

const base = { config: partner, mapping, lookup: stubLookup() };

describe('prepareRow · alta', () => {
  test('monta el body con los valores convertidos', async () => {
    const r = await prepareRow({
      ...base,
      mode: 'insert',
      row: { Código: 'CLI-1', Nombre: 'Ferretería', Límite: '1.500,00' },
    });

    assert.equal(r.ok, true);
    assert.deepEqual((r as any).body, { code: 'CLI-1', name: 'Ferretería', creditLimit: 1500 });
    assert.equal((r as any).creating, true);
  });

  test('una celda vacía NO se envía, para que el endpoint aplique su default', async () => {
    const r = await prepareRow({
      ...base,
      mode: 'insert',
      row: { Código: '', Nombre: 'Ferretería', 'NIF/CIF': '   ' },
    });

    assert.deepEqual(Object.keys((r as any).body), ['name']);
  });

  test('falta un obligatorio → error con el nombre del campo', async () => {
    const r = await prepareRow({ ...base, mode: 'insert', row: { Código: 'CLI-1' } });

    assert.equal(r.ok, false);
    assert.match((r as any).message, /Nombre/);
  });

  test('un error de conversión se explica y no llega a escribirse', async () => {
    const r = await prepareRow({
      ...base,
      mode: 'insert',
      row: { Nombre: 'X', Límite: 'un montón' },
    });

    assert.equal(r.ok, false);
    assert.match((r as any).message, /Límite de crédito.*no es un número/);
  });

  test('acumula todos los errores de conversión de la fila, no solo el primero', async () => {
    const conFecha = {
      ...partner,
      fields: [...partner.fields, { key: 'since', label: 'Alta', type: 'date' }],
    } as ImportObjectConfig;

    const r = await prepareRow({
      config: conFecha,
      mapping: { ...mapping, Alta: 'since' },
      lookup: stubLookup(),
      mode: 'insert',
      row: { Nombre: 'X', Límite: 'nada', Alta: 'el martes' },
    });

    assert.match((r as any).message, /Límite de crédito/);
    assert.match((r as any).message, /Alta/);
  });

  test('los campos con punto en bodyKey se anidan', async () => {
    const r = await prepareRow({
      ...base,
      mode: 'insert',
      row: { Nombre: 'X', Calle: 'C/ Mayor 12' },
    });

    assert.deepEqual((r as any).body.address, { street: 'C/ Mayor 12' });
  });
});

describe('prepareRow · claves duplicadas', () => {
  test('avisa de un código que ya existe, sin esperar al error de Postgres', async () => {
    const r = await prepareRow({
      ...base,
      lookup: stubLookup({ BusinessPartner: { 'cli-1': 'partner-1' } }),
      mode: 'insert',
      row: { Código: 'CLI-1', Nombre: 'Otro' },
    });

    assert.equal(r.ok, false);
    assert.match((r as any).message, /Ya existe un registro con Código = "CLI-1"/);
  });

  test('también con el NIF, que tiene índice único parcial', async () => {
    const r = await prepareRow({
      ...base,
      lookup: stubLookup({ BusinessPartner: { b12345678: 'partner-1' } }),
      mode: 'insert',
      row: { Nombre: 'Otro', 'NIF/CIF': 'B12345678' },
    });

    assert.match((r as any).message, /Ya existe un registro con NIF\/CIF/);
  });

  test('el nombre no es único: dos empresas pueden llamarse igual', async () => {
    const r = await prepareRow({
      ...base,
      lookup: stubLookup({ BusinessPartner: { 'ferretería pérez': 'partner-1' } }),
      mode: 'insert',
      row: { Nombre: 'Ferretería Pérez' },
    });

    assert.equal(r.ok, true);
  });

  test('detecta el duplicado dentro del propio fichero', async () => {
    const seenKeys = new Map<string, Set<string>>();
    const args = { ...base, mode: 'insert' as const, seenKeys };

    const primera = await prepareRow({ ...args, row: { Código: 'CLI-9', Nombre: 'Uno' } });
    const segunda = await prepareRow({ ...args, row: { Código: 'CLI-9', Nombre: 'Dos' } });

    assert.equal(primera.ok, true);
    assert.equal(segunda.ok, false);
    assert.match((segunda as any).message, /está repetido en el fichero/);
  });

  test('el duplicado interno no distingue mayúsculas', async () => {
    const seenKeys = new Map<string, Set<string>>();
    const args = { ...base, mode: 'insert' as const, seenKeys };

    await prepareRow({ ...args, row: { Código: 'cli-9', Nombre: 'Uno' } });
    const segunda = await prepareRow({ ...args, row: { Código: 'CLI-9', Nombre: 'Dos' } });

    assert.equal(segunda.ok, false);
  });

  test('en actualización no se comprueba: encontrar el registro es el objetivo', async () => {
    const r = await prepareRow({
      ...base,
      lookup: stubLookup({ BusinessPartner: { 'cli-1': 'partner-1' } }),
      mode: 'update',
      matchBy: 'code',
      row: { Código: 'CLI-1', Nombre: 'Renombrado' },
    });

    assert.equal(r.ok, true);
  });

  test('una clave vacía no cuenta como duplicada aunque se repita', async () => {
    const seenKeys = new Map<string, Set<string>>();
    const args = { ...base, mode: 'insert' as const, seenKeys };

    const primera = await prepareRow({ ...args, row: { Nombre: 'Uno' } });
    const segunda = await prepareRow({ ...args, row: { Nombre: 'Dos' } });

    assert.equal(primera.ok, true);
    assert.equal(segunda.ok, true);
  });
});

describe('prepareRow · referencias', () => {
  test('convierte el código en id', async () => {
    const r = await prepareRow({
      ...base,
      lookup: stubLookup({ PartnerGroup: { clientes: 'grupo-1' } }),
      mode: 'insert',
      row: { Nombre: 'X', Grupo: 'CLIENTES' },
    });

    assert.equal((r as any).body.groupId, 'grupo-1');
    // El nombre de la columna del fichero no debe colarse en el body.
    assert.equal((r as any).body.group, undefined);
  });

  test('una referencia que no existe es un error, no un nulo silencioso', async () => {
    const r = await prepareRow({
      ...base,
      mode: 'insert',
      row: { Nombre: 'X', Grupo: 'NO-EXISTE' },
    });

    assert.equal(r.ok, false);
    assert.match((r as any).message, /No se encontró el grupo "NO-EXISTE"/);
  });

  test('una referencia vacía simplemente no se envía', async () => {
    const r = await prepareRow({ ...base, mode: 'insert', row: { Nombre: 'X', Grupo: '' } });

    assert.equal(r.ok, true);
    assert.equal((r as any).body.groupId, undefined);
  });
});

describe('prepareRow · actualización y upsert', () => {
  const lookup = stubLookup({ BusinessPartner: { 'cli-1': 'partner-1' } });

  test('update encuentra el registro y marca que no se crea', async () => {
    const r = await prepareRow({
      ...base,
      lookup,
      mode: 'update',
      matchBy: 'code',
      row: { Código: 'CLI-1', Límite: '900' },
    });

    assert.equal(r.ok, true);
    assert.equal((r as any).creating, false);
    assert.equal((r as any).existingId, 'partner-1');
  });

  test('en actualización, un "obligatorio al crear" puede venir vacío', async () => {
    const r = await prepareRow({
      ...base,
      lookup,
      mode: 'update',
      matchBy: 'code',
      row: { Código: 'CLI-1', Límite: '900' }, // sin Nombre
    });

    assert.equal(r.ok, true);
  });

  test('update contra algo que no existe es un error', async () => {
    const r = await prepareRow({
      ...base,
      lookup,
      mode: 'update',
      matchBy: 'code',
      row: { Código: 'CLI-999', Nombre: 'X' },
    });

    assert.equal(r.ok, false);
    assert.match((r as any).message, /No existe ningún registro con Código = "CLI-999"/);
  });

  test('upsert crea cuando no lo encuentra', async () => {
    const r = await prepareRow({
      ...base,
      lookup,
      mode: 'upsert',
      matchBy: 'code',
      row: { Código: 'CLI-999', Nombre: 'Nuevo' },
    });

    assert.equal(r.ok, true);
    assert.equal((r as any).creating, true);
  });

  test('upsert actualiza cuando sí lo encuentra', async () => {
    const r = await prepareRow({
      ...base,
      lookup,
      mode: 'upsert',
      matchBy: 'code',
      row: { Código: 'CLI-1', Nombre: 'Renombrado' },
    });

    assert.equal((r as any).creating, false);
    assert.equal((r as any).existingId, 'partner-1');
  });

  test('sin la clave de búsqueda rellena no se puede casar la fila', async () => {
    const r = await prepareRow({
      ...base,
      lookup,
      mode: 'update',
      matchBy: 'code',
      row: { Nombre: 'X' },
    });

    assert.match((r as any).message, /Falta Código/);
  });

  test('una clave de búsqueda que no está en el catálogo se rechaza', async () => {
    const r = await prepareRow({
      ...base,
      lookup,
      mode: 'update',
      matchBy: 'inventada',
      row: { Código: 'CLI-1' },
    });

    assert.match((r as any).message, /Clave de búsqueda no válida/);
  });
});

describe('prepareRow · transform del objeto', () => {
  const conTransform = {
    ...partner,
    transform: (body: any) => {
      const { address, ...rest } = body;
      if (!address) return rest;
      return { ...rest, addresses: [{ ...address, isDefault: true }] };
    },
  } as ImportObjectConfig;

  test('se aplica al final, después de montar el body', async () => {
    const r = await prepareRow({
      config: conTransform,
      mapping,
      lookup: stubLookup(),
      mode: 'insert',
      row: { Nombre: 'X', Calle: 'C/ Mayor 12' },
    });

    assert.deepEqual((r as any).body.addresses, [{ street: 'C/ Mayor 12', isDefault: true }]);
    assert.equal((r as any).body.address, undefined);
  });

  test('sabe si está creando o actualizando', async () => {
    let visto: string | undefined;
    const espía = {
      ...partner,
      transform: (body: any, ctx: any) => {
        visto = ctx.mode;
        return body;
      },
    } as ImportObjectConfig;

    await prepareRow({
      config: espía,
      mapping,
      lookup: stubLookup({ BusinessPartner: { 'cli-1': 'partner-1' } }),
      mode: 'update',
      matchBy: 'code',
      row: { Código: 'CLI-1' },
    });

    assert.equal(visto, 'update');
  });
});

describe('prepareRow · documentos con líneas', () => {
  const invoice = {
    id: 'salesInvoice',
    label: 'Facturas de venta',
    group: 'documentos',
    modulePath: '/sales/invoices',
    table: 'SalesInvoice',
    router: () => ({}) as any,
    createPath: '/',
    naturalKeys: [],
    fields: [
      { key: 'ref', label: 'Referencia', type: 'string', required: true },
      {
        key: 'partner',
        label: 'Cliente',
        type: 'ref',
        bodyKey: 'partnerId',
        required: true,
        ref: { table: 'BusinessPartner', matchBy: ['code'], label: 'cliente' },
      },
    ],
    lines: {
      label: 'Líneas',
      bodyKey: 'lines',
      groupBy: 'Referencia',
      fields: [
        {
          key: 'item',
          label: 'Artículo',
          type: 'ref',
          bodyKey: 'itemId',
          required: true,
          ref: { table: 'Item', matchBy: ['code'], label: 'artículo' },
        },
        { key: 'quantity', label: 'Cantidad', type: 'number', required: true },
      ],
    },
  } as unknown as ImportObjectConfig;

  const docMapping = {
    Referencia: 'ref',
    Cliente: 'partner',
    Artículo: 'item',
    Cantidad: 'quantity',
  };
  const docLookup = stubLookup({
    BusinessPartner: { 'cli-1': 'partner-1' },
    Item: { 'itm-1': 'item-1', 'itm-2': 'item-2' },
  });

  test('agrupa las líneas de su cabecera y resuelve sus referencias', async () => {
    const lines = new Map([
      [
        'F-001',
        [
          { Referencia: 'F-001', Artículo: 'ITM-1', Cantidad: '2' },
          { Referencia: 'F-001', Artículo: 'ITM-2', Cantidad: '1,5' },
        ],
      ],
    ]);

    const r = await prepareRow({
      config: invoice,
      mapping: docMapping,
      lookup: docLookup,
      mode: 'insert',
      row: { Referencia: 'F-001', Cliente: 'CLI-1' },
      linesByKey: lines,
    });

    assert.equal(r.ok, true);
    assert.deepEqual((r as any).body.lines, [
      { itemId: 'item-1', quantity: 2 },
      { itemId: 'item-2', quantity: 1.5 },
    ]);
  });

  test('una cabecera sin líneas es un error: no se crea un documento vacío', async () => {
    const r = await prepareRow({
      config: invoice,
      mapping: docMapping,
      lookup: docLookup,
      mode: 'insert',
      row: { Referencia: 'F-002', Cliente: 'CLI-1' },
      linesByKey: new Map(),
    });

    assert.equal(r.ok, false);
    assert.match((r as any).message, /ninguna línea/);
  });

  test('el error de una línea dice cuál es', async () => {
    const lines = new Map([
      ['F-001', [{ Referencia: 'F-001', Artículo: 'ITM-1', Cantidad: 'dos' }]],
    ]);

    const r = await prepareRow({
      config: invoice,
      mapping: docMapping,
      lookup: docLookup,
      mode: 'insert',
      row: { Referencia: 'F-001', Cliente: 'CLI-1' },
      linesByKey: lines,
    });

    assert.match((r as any).message, /Línea 1 · Cantidad/);
  });

  test('una línea a la que le falta un obligatorio tumba el documento entero', async () => {
    const lines = new Map([['F-001', [{ Referencia: 'F-001', Artículo: 'ITM-1' }]]]);

    const r = await prepareRow({
      config: invoice,
      mapping: docMapping,
      lookup: docLookup,
      mode: 'insert',
      row: { Referencia: 'F-001', Cliente: 'CLI-1' },
      linesByKey: lines,
    });

    assert.match((r as any).message, /Línea 1: faltan Cantidad/);
  });
});

describe('utilidades', () => {
  test('setPath crea los niveles que falten', () => {
    const o: any = {};
    setPath(o, 'a.b.c', 1);
    assert.deepEqual(o, { a: { b: { c: 1 } } });
  });

  test('setPath no pisa lo que ya hay al lado', () => {
    const o: any = { a: { x: 1 } };
    setPath(o, 'a.y', 2);
    assert.deepEqual(o, { a: { x: 1, y: 2 } });
  });

  test('isBlank distingue vacío de cero y de false', () => {
    assert.equal(isBlank(''), true);
    assert.equal(isBlank('  '), true);
    assert.equal(isBlank(null), true);
    assert.equal(isBlank(undefined), true);
    assert.equal(isBlank(0), false);
    assert.equal(isBlank(false), false);
  });
});
