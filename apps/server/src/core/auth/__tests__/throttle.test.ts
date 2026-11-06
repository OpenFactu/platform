import test from 'node:test';
import assert from 'node:assert/strict';
import { step, RULES, normalizeAccount } from '../throttle';

const T0 = new Date('2026-01-01T10:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

function fail(state: any, n: number, now: Date, rule = RULES.account) {
  for (let i = 0; i < n; i++) state = step(state, false, now, rule);
  return state;
}

test('5 fallos bloquean 1 min', () => {
  const s4 = fail(null, 4, T0);
  assert.equal(s4.lockedUntil, null);
  const s5 = step(s4, false, T0, RULES.account)!;
  assert.equal(s5.lockedUntil!.getTime() - T0.getTime(), 60_000);
  assert.equal(s5.lockCount, 1);
  assert.equal(s5.failures, 0);
});

test('el siguiente bloqueo dura 2 min, luego 4, con tope 60', () => {
  let state: any = null;
  const mins: number[] = [];
  for (let i = 0; i < 8; i++) {
    state = fail(state, 5, T0);
    mins.push((state.lockedUntil.getTime() - T0.getTime()) / 60_000);
  }
  assert.deepEqual(mins, [1, 2, 4, 8, 16, 32, 60, 60]);
});

test('fuera de la ventana de 15 min se reinicia', () => {
  const s = fail(null, 4, T0);
  const later = at(15 * 60_000 + 1);
  const s2 = step(s, false, later, RULES.account)!;
  assert.equal(s2.failures, 1);
  assert.equal(s2.lockedUntil, null);
  assert.equal(s2.windowStart.getTime(), later.getTime());
});

test('un acierto reinicia la cuenta', () => {
  const s = fail(null, 4, T0);
  assert.equal(step(s, true, T0, RULES.account), null);
});

test('la IP bloquea 15 min tras 50 fallos y no dobla', () => {
  let s: any = fail(null, 50, T0, RULES.ip);
  assert.equal(s.lockedUntil.getTime() - T0.getTime(), 15 * 60_000);
  s = fail(s, 50, T0, RULES.ip);
  assert.equal(s.lockedUntil.getTime() - T0.getTime(), 15 * 60_000);
});

test('normalizeAccount', () => {
  assert.equal(normalizeAccount(' Admin@X.com '), 'admin@x.com');
});
