import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TenantLookup } from '../TenantLookup';

/**
 * Cliente de mentira: registra cada consulta y devuelve lo que se le diga.
 * No hace falta Postgres para comprobar lo que importa aquí — cuántas veces
 * se pregunta, con qué valores, y que los identificadores estén validados.
 */
function stubClient(responder: (index: number) => any[]) {
  const calls: any[] = [];
  return {
    calls,
    execute(query: any) {
      calls.push(query);
      return Promise.resolve({ rows: responder(calls.length - 1) });
    },
  };
}

describe('TenantLookup', () => {
  test('devuelve el id encontrado', async () => {
    const client = stubClient(() => [{ id: 'grupo-1' }]);
    const lookup = new TenantLookup(client, 'tenant_acme');

    assert.equal(await lookup.findId('PartnerGroup', ['code'], 'CLIENTES'), 'grupo-1');
  });

  test('prueba las columnas en orden y para en la primera que casa', async () => {
    // La primera columna no encuentra nada, la segunda sí.
    const client = stubClient((i) => (i === 0 ? [] : [{ id: 'item-9' }]));
    const lookup = new TenantLookup(client, 'tenant_acme');

    assert.equal(await lookup.findId('Item', ['code', 'name'], 'Tornillo'), 'item-9');
    assert.equal(client.calls.length, 2);
  });

  test('si no está en ninguna columna devuelve null', async () => {
    const client = stubClient(() => []);
    const lookup = new TenantLookup(client, 'tenant_acme');

    assert.equal(await lookup.findId('Item', ['code', 'name'], 'Fantasma'), null);
  });

  test('cachea: cinco mil filas del mismo grupo son UNA consulta', async () => {
    const client = stubClient(() => [{ id: 'grupo-1' }]);
    const lookup = new TenantLookup(client, 'tenant_acme');

    for (let i = 0; i < 5; i++) {
      await lookup.findId('PartnerGroup', ['code'], 'CLIENTES');
    }

    assert.equal(client.calls.length, 1);
  });

  test('cachea también los fallos, que en una migración son la mayoría', async () => {
    const client = stubClient(() => []);
    const lookup = new TenantLookup(client, 'tenant_acme');

    await lookup.findId('PartnerGroup', ['code'], 'NO-EXISTE');
    await lookup.findId('PartnerGroup', ['code'], 'NO-EXISTE');

    assert.equal(client.calls.length, 1);
  });

  test('la caché no distingue mayúsculas, igual que la consulta', async () => {
    const client = stubClient(() => [{ id: 'grupo-1' }]);
    const lookup = new TenantLookup(client, 'tenant_acme');

    await lookup.findId('PartnerGroup', ['code'], 'clientes');
    await lookup.findId('PartnerGroup', ['code'], 'CLIENTES');

    assert.equal(client.calls.length, 1);
  });

  test('invalidate deja ver lo que una fila anterior acaba de crear', async () => {
    let existe = false;
    const client = stubClient(() => (existe ? [{ id: 'grupo-nuevo' }] : []));
    const lookup = new TenantLookup(client, 'tenant_acme');

    assert.equal(await lookup.findId('PartnerGroup', ['code'], 'NUEVO'), null);
    existe = true;
    // Sin invalidar seguiría devolviendo el null cacheado.
    assert.equal(await lookup.findId('PartnerGroup', ['code'], 'NUEVO'), null);

    lookup.invalidate('PartnerGroup');
    assert.equal(await lookup.findId('PartnerGroup', ['code'], 'NUEVO'), 'grupo-nuevo');
  });

  test('invalidate solo afecta a su tabla', async () => {
    const client = stubClient(() => [{ id: 'x' }]);
    const lookup = new TenantLookup(client, 'tenant_acme');

    await lookup.findId('PartnerGroup', ['code'], 'A');
    await lookup.findId('Item', ['code'], 'B');
    lookup.invalidate('PartnerGroup');
    await lookup.findId('Item', ['code'], 'B');

    // La de Item sigue cacheada: 2 consultas en total, no 3.
    assert.equal(client.calls.length, 2);
  });

  test('un schema con caracteres raros se rechaza al construir', () => {
    assert.throws(
      () =>
        new TenantLookup(
          stubClient(() => []),
          'tenant"; DROP TABLE x; --',
        ),
      /inválido/,
    );
  });

  test('una tabla o columna con caracteres raros se rechaza al consultar', async () => {
    const lookup = new TenantLookup(
      stubClient(() => []),
      'tenant_acme',
    );

    await assert.rejects(() => lookup.findId('Item"; DROP TABLE x; --', ['code'], 'A'), /inválido/);
    await assert.rejects(() => lookup.findId('Item', ['code"; --'], 'A'), /inválido/);
  });

  test('el valor buscado NO se interpola: viaja como parámetro', async () => {
    const client = stubClient(() => []);
    const lookup = new TenantLookup(client, 'tenant_acme');
    const peligroso = "'; DROP TABLE Item; --";

    await lookup.findId('Item', ['code'], peligroso);

    // Drizzle guarda el SQL como una lista de trozos: los literales son
    // StringChunk (tienen `value` como array de strings) y los parámetros van
    // aparte. El texto del usuario no debe aparecer en ningún literal.
    const chunks: any[] = (client.calls[0] as any).queryChunks || [];
    const literales = chunks
      .filter((c) => Array.isArray(c?.value))
      .flatMap((c) => c.value)
      .join(' ');

    assert.ok(literales.includes('SELECT "id"'), 'debería haber SQL literal que inspeccionar');
    assert.ok(!literales.includes('DROP TABLE'), 'el valor no debe acabar dentro del SQL');
  });
});
