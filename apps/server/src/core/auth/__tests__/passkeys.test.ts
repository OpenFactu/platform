import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rpFor } from '../passkeys';

const KEYS = ['WEB_ORIGIN', 'WEBAUTHN_ALLOW_DESKTOP', 'NODE_ENV'] as const;

describe('rpFor', () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k];
    process.env.WEB_ORIGIN = 'https://erp.x.com';
    delete process.env.WEBAUTHN_ALLOW_DESKTOP;
    process.env.NODE_ENV = 'test';
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('WEB_ORIGIN da su host como RP ID', () => {
    assert.deepEqual(rpFor('https://erp.x.com'), {
      rpId: 'erp.x.com',
      origin: 'https://erp.x.com',
    });
  });

  it('localhost con puerto vale para el escritorio', () => {
    assert.deepEqual(rpFor('http://localhost:43123'), {
      rpId: 'localhost',
      origin: 'http://localhost:43123',
    });
  });

  it('con WEBAUTHN_ALLOW_DESKTOP=false, localhost no vale', () => {
    process.env.WEBAUTHN_ALLOW_DESKTOP = 'false';
    assert.equal(rpFor('http://localhost:43123'), null);
  });

  it('en desarrollo, Vite vale aunque el escritorio esté apagado', () => {
    process.env.WEBAUTHN_ALLOW_DESKTOP = 'false';
    process.env.NODE_ENV = 'development';
    assert.equal(rpFor('http://localhost:5173')?.rpId, 'localhost');
    assert.equal(rpFor('http://localhost:5180')?.rpId, 'localhost');
    assert.equal(rpFor('http://localhost:43123'), null);
  });

  it('cualquier otro origen da null', () => {
    assert.equal(rpFor('https://evil.com'), null);
    assert.equal(rpFor('http://127.0.0.1:43123'), null);
    assert.equal(rpFor('https://erp.x.com.evil.com'), null);
    assert.equal(rpFor('http://erp.x.com'), null);
    assert.equal(rpFor('https://erp.x.com/ruta'), null);
    assert.equal(rpFor('https://localhost:43123'), null);
    assert.equal(rpFor('http://localhost'), null);
    assert.equal(rpFor(undefined), null);
    assert.equal(rpFor('null'), null);
  });

  it('sin WEB_ORIGIN solo queda localhost', () => {
    delete process.env.WEB_ORIGIN;
    assert.equal(rpFor('https://erp.x.com'), null);
    assert.equal(rpFor('http://localhost:43123')?.rpId, 'localhost');
  });
});
