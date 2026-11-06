import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { authTestDatabaseUrl, useAuthTestDb } from './authTestDb';
import { checkThrottle, recordAttempt } from '../throttle';

const skip = !authTestDatabaseUrl;
let env: Awaited<ReturnType<typeof useAuthTestDb>>;
const rnd = () => crypto.randomBytes(5).toString('hex');

before(async () => {
  if (!skip) env = await useAuthTestDb();
});
after(async () => {
  if (!skip) await env.drop();
});

test('5 fallos bloquean la cuenta y devuelven retryAfter', { skip }, async () => {
  const account = `u-${rnd()}@x.com`;
  const ip = `ip-${rnd()}`;
  for (let i = 0; i < 4; i++) await recordAttempt('login', { account, ip }, false);
  assert.deepEqual(await checkThrottle('login', { account, ip }), { blocked: false });
  await recordAttempt('login', { account, ip }, false);
  const r: any = await checkThrottle('login', { account, ip });
  assert.equal(r.blocked, true);
  assert.ok(r.retryAfter > 0 && r.retryAfter <= 60);
});

test('mayúsculas y espacios cuentan en el mismo contador', { skip }, async () => {
  const base = `u-${rnd()}@x.com`;
  const ip = `ip-${rnd()}`;
  const variants = [base, ` ${base.toUpperCase()} `, base, `${base} `, base.toUpperCase()];
  for (const v of variants) await recordAttempt('login', { account: v, ip }, false);
  const r: any = await checkThrottle('login', { account: base, ip: `ip-${rnd()}` });
  assert.equal(r.blocked, true);
});

test('un acierto reinicia la cuenta pero no la IP', { skip }, async () => {
  const account = `u-${rnd()}@x.com`;
  const ip = `ip-${rnd()}`;
  for (let i = 0; i < 4; i++) await recordAttempt('login', { account, ip }, false);
  await recordAttempt('login', { account, ip }, true);
  await recordAttempt('login', { account, ip }, false);
  assert.equal((await checkThrottle('login', { account, ip })).blocked, false);
});

test('el bloqueo es por acción', { skip }, async () => {
  const account = `u-${rnd()}@x.com`;
  const ip = `ip-${rnd()}`;
  for (let i = 0; i < 5; i++) await recordAttempt('mfa', { account, ip }, false);
  assert.equal((await checkThrottle('mfa', { account, ip })).blocked, true);
  assert.equal((await checkThrottle('login', { account, ip })).blocked, false);
});

test('50 fallos de cuentas distintas bloquean la IP', { skip }, async () => {
  const ip = `ip-${rnd()}`;
  for (let i = 0; i < 50; i++) {
    await recordAttempt('login', { account: `c${i}-${rnd()}`, ip }, false);
  }
  const r: any = await checkThrottle('login', { account: `nueva-${rnd()}`, ip });
  assert.equal(r.blocked, true);
  assert.ok(r.retryAfter > 60);
});
