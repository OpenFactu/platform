import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedActions, reduceWorkState } from '../timeclockState';
import { normalizeRfidUid, parseQr } from '../timeclockCredentials';

test('el estado conserva pausas y descarta transiciones históricas inválidas', () => {
  assert.equal(reduceWorkState(['out', 'in', 'in', 'break_start']), 'on_break');
  assert.deepEqual(allowedActions('on_break'), ['break_end']);
  assert.equal(reduceWorkState(['in', 'break_start', 'break_end', 'out']), 'closed');
});
test('UID válido normalizado sin convertir texto arbitrario en credencial', () => {
  assert.equal(normalizeRfidUid('04:a1:b2:c3'), '04A1B2C3');
  assert.equal(normalizeRfidUid('04 a1 b2 c3 01 02 03'), '04A1B2C3010203');
  for (const value of ['xx04A1B2C3', '04A1', '', '04:a1 b2:c3']) {
    assert.throws(() => normalizeRfidUid(value));
  }
});
test('QR solo acepta una credencial propia completa, nunca URL ni id de empleado', () => {
  const token = Buffer.alloc(32, 7).toString('base64url');
  assert.equal(parseQr(`ofc:timeclock:v1:${token}`), token);
  for (const value of ['https://example.com', 'employee-1', 'ofc:timeclock:v1:short']) {
    assert.throws(() => parseQr(value));
  }
});
