import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { hideQueryErrors } from '../index';

describe('el SQL no llega a quien usa la aplicación', () => {
  test('un error de consulta se cambia por uno general', () => {
    const body = hideQueryErrors({
      error: 'Failed query: insert into "SalesInvoice" ("id") values ($1)\nparams: 1',
    });
    assert.doesNotMatch(body.error, /insert into|SalesInvoice/);
    assert.match(body.error, /No se ha podido/);
  });

  test('conserva lo demás de la respuesta', () => {
    const body = hideQueryErrors({ error: 'Failed query: select 1', code: 'X' });
    assert.equal(body.code, 'X');
  });

  test('un error normal no se toca', () => {
    const body = { error: 'Stock insuficiente para el artículo A.' };
    assert.equal(hideQueryErrors(body), body);
  });

  test('una respuesta sin error, tampoco', () => {
    const body = { id: '1' };
    assert.equal(hideQueryErrors(body), body);
    assert.equal(hideQueryErrors(null), null);
    assert.deepEqual(hideQueryErrors([1, 2]), [1, 2]);
  });
});
