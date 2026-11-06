import test from 'node:test';
import assert from 'node:assert/strict';
import { parseThemePatch } from '../themePreference';

test('solo devuelve los campos que vienen en el cuerpo', () => {
  assert.deepEqual(parseThemePatch({ signatureName: 'Ana' }), {});
  assert.deepEqual(parseThemePatch({ themeMode: 'dark' }), { themeMode: 'dark' });
  assert.deepEqual(parseThemePatch({ themePreset: 'keirost-carbon' }), {
    themePreset: 'keirost-carbon',
  });
});

test('null o vacío borran la elección: vuelve el tema de la empresa', () => {
  assert.deepEqual(parseThemePatch({ themePreset: null, themeMode: null }), {
    themePreset: null,
    themeMode: null,
  });
  assert.deepEqual(parseThemePatch({ themePreset: '', themeMode: '' }), {
    themePreset: null,
    themeMode: null,
  });
});

test('rechaza lo que no es un id de preset o un modo', () => {
  assert.throws(() => parseThemePatch({ themePreset: 42 }));
  assert.throws(() => parseThemePatch({ themePreset: '<script>' }));
  assert.throws(() => parseThemePatch({ themePreset: 'a'.repeat(65) }));
  assert.throws(() => parseThemePatch({ themeMode: 'system' }));
});
