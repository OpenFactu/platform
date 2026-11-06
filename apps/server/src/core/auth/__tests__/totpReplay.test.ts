import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { authenticator } from 'otplib';
import { verifyEnrollCode, verifyTwoFactor } from '../../../api/twofa';
import { encryptSecret, hashCode } from '../totpCrypto';

const secret = authenticator.generateSecret();
const enc = encryptSecret(secret);
const T0 = 1_800_000_000_000; // ms, múltiplo de 30 s
const at = (offsetSteps: number) => T0 + offsetSteps * 30_000;

function tokenAt(epoch: number): string {
  authenticator.options = { epoch };
  return authenticator.generate(secret);
}
/** El reloj del servidor en `epoch`. */
function verify(code: string, epoch: number, lastStep: number | null) {
  authenticator.options = { epoch };
  return verifyTwoFactor(code, enc, null, lastStep);
}

describe('TOTP de un solo uso', () => {
  afterEach(() => {
    authenticator.options = {};
  });

  it('el mismo código dos veces: la segunda falla', () => {
    const code = tokenAt(T0);
    const first = verify(code, T0, null);
    assert.equal(first.ok, true);
    assert.equal(typeof first.step, 'number');
    assert.equal(verify(code, T0, first.step!).ok, false);
  });

  it('un paso atrás y luego el actual: los dos valen', () => {
    const back = verify(tokenAt(at(-1)), T0, null);
    assert.equal(back.ok, true);
    const now = verify(tokenAt(T0), T0, back.step!);
    assert.equal(now.ok, true);
    assert.ok(now.step! > back.step!);
  });

  it('uno anterior al último aceptado: falla', () => {
    const now = verify(tokenAt(T0), T0, null);
    assert.equal(now.ok, true);
    assert.equal(verify(tokenAt(at(-1)), T0, now.step!).ok, false);
  });

  for (const [name, typed] of [
    ['sin guion', 'D0D28DC9'],
    ['con guion', 'D0D2-8DC9'],
    ['en minúsculas', 'd0d2-8dc9'],
    ['con espacios', 'd0d2 8dc9'],
  ]) {
    it(`código de respaldo ${name}: vale una vez`, () => {
      const stored = JSON.stringify([hashCode('D0D2-8DC9'), hashCode('AAAA-BBBB')]);
      const first = verifyTwoFactor(typed, enc, stored, null);
      assert.equal(first.ok, true);
      assert.equal(first.usedBackup, true);
      assert.equal(first.remainingBackups!.length, 1);
      const again = verifyTwoFactor(typed, enc, JSON.stringify(first.remainingBackups), null);
      assert.equal(again.ok, false);
    });
  }
});

describe('alta del 2FA', () => {
  afterEach(() => {
    authenticator.options = {};
  });

  it('acepta el código del paso anterior (frontera de 30 s) y rechaza uno de dos pasos atrás', () => {
    const prev = tokenAt(at(-1));
    const old = tokenAt(at(-2));
    authenticator.options = { epoch: T0 };
    assert.equal(verifyEnrollCode(prev, secret), true);
    assert.equal(verifyEnrollCode(old, secret), false);
    // Antes (ventana 0) el del paso anterior fallaba.
    assert.equal(verifyEnrollCode(prev, secret, 0), false);
  });
});
