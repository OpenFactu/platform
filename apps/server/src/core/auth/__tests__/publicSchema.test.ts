import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// El SQL público se genera de schema.ts: si falta una tabla o columna del
// acceso, el servidor arrancaría sin ella y fallaría mucho después.
const sql = readFileSync(path.resolve(__dirname, '../../../../sql/public-schema.sql'), 'utf8');

test('publicSchema: trae las tablas del acceso', () => {
  for (const tabla of [
    'UserSession',
    'AuthThrottle',
    'AuthChallenge',
    'AuthEvent',
    'UserPasskey',
    'AuthProvider',
    'UserIdentity',
  ]) {
    assert.ok(sql.includes(`"${tabla}"`), `falta la tabla ${tabla}`);
  }
});

test('publicSchema: GlobalUser trae totpLastStep', () => {
  assert.ok(sql.includes('"totpLastStep"'));
});
