import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_POLICY,
  normalizePolicy,
  parsePolicy,
  passwordProblem,
  policyGate,
  sessionLimits,
} from '../policy';

const rules = { enabled: true, minLength: 10, blockCommon: true };

describe('política de acceso', () => {
  it('mfa all sin 2FA da restricted mfa_setup', () => {
    const g = policyGate(
      { ...DEFAULT_POLICY, mfa: 'all' },
      { role: 'USER', hasMfa: false },
      'password',
    );
    assert.deepEqual(g, { allowed: true, restricted: 'mfa_setup' });
  });

  it('mfa all con 2FA no restringe', () => {
    const g = policyGate(
      { ...DEFAULT_POLICY, mfa: 'all' },
      { role: 'USER', hasMfa: true },
      'password',
    );
    assert.equal(g.restricted, null);
  });

  it('mfa admins no afecta a USER pero sí a ADMIN', () => {
    const p = { ...DEFAULT_POLICY, mfa: 'admins' as const };
    assert.equal(policyGate(p, { role: 'USER', hasMfa: false }, 'password').restricted, null);
    assert.equal(
      policyGate(p, { role: 'ADMIN', hasMfa: false }, 'password').restricted,
      'mfa_setup',
    );
  });

  it('SUPERUSER nunca restringido', () => {
    const p = {
      ...DEFAULT_POLICY,
      mfa: 'all' as const,
      ssoRequired: true,
      allowedMethods: ['sso' as const],
    };
    assert.deepEqual(policyGate(p, { role: 'SUPERUSER', hasMfa: false }, 'password'), {
      allowed: true,
      restricted: null,
    });
  });

  it('ssoRequired rechaza password con SSO_REQUIRED', () => {
    const g = policyGate(
      { ...DEFAULT_POLICY, ssoRequired: true },
      { role: 'USER', hasMfa: false },
      'password',
    );
    assert.equal(g.allowed, false);
    assert.equal(g.code, 'SSO_REQUIRED');
    assert.equal(
      policyGate({ ...DEFAULT_POLICY, ssoRequired: true }, { role: 'USER', hasMfa: false }, 'sso')
        .allowed,
      true,
    );
  });

  it('el método de la sesión se traduce al de la política', () => {
    const sso = { ...DEFAULT_POLICY, ssoRequired: true };
    const u = { role: 'USER', hasMfa: false };
    // sso:google es SSO y passkey también vale con SSO obligatorio.
    assert.equal(policyGate(sso, u, 'sso:google').allowed, true);
    assert.equal(policyGate(sso, u, 'passkey').allowed, true);
    // handoff:<m> vale lo que <m>.
    assert.equal(policyGate(sso, u, 'handoff:email_code').code, 'SSO_REQUIRED');
    assert.equal(policyGate(sso, u, 'handoff:sso:google').allowed, true);
    // Lo desconocido cuenta como contraseña.
    assert.equal(policyGate(sso, u, 'factuapi').code, 'SSO_REQUIRED');
    const noPwd = { ...DEFAULT_POLICY, allowedMethods: ['sso' as const] };
    assert.equal(policyGate(noPwd, u, 'factuapi').code, 'METHOD_NOT_ALLOWED');
    assert.equal(policyGate(noPwd, u, 'handoff:email_code').code, 'METHOD_NOT_ALLOWED');
    assert.equal(policyGate(noPwd, u, 'sso:okta').allowed, true);
  });

  it('un método fuera de allowedMethods da METHOD_NOT_ALLOWED', () => {
    const g = policyGate(
      { ...DEFAULT_POLICY, allowedMethods: ['sso'] },
      { role: 'USER', hasMfa: false },
      'password',
    );
    assert.equal(g.code, 'METHOD_NOT_ALLOWED');
  });

  it('passwordProblem de una contraseña corta', () => {
    assert.equal(passwordProblem('corto', rules), 'PASSWORD_TOO_SHORT');
  });

  it('passwordProblem de una contraseña común, sin distinguir mayúsculas', () => {
    assert.equal(passwordProblem('1234567890', rules), 'PASSWORD_TOO_COMMON');
    assert.equal(passwordProblem('QWERTYUIOP', rules), 'PASSWORD_TOO_COMMON');
    assert.equal(passwordProblem('1234567890', { ...rules, blockCommon: false }), null);
    assert.equal(passwordProblem('xk3-Vuelo-Azul-77', rules), null);
  });

  it('con enabled false todo vale', () => {
    assert.equal(passwordProblem('a', { ...rules, enabled: false }), null);
  });

  it('normalizePolicy({}) es igual a DEFAULT_POLICY', () => {
    assert.deepEqual(normalizePolicy({}), DEFAULT_POLICY);
    assert.deepEqual(normalizePolicy(null), DEFAULT_POLICY);
    assert.deepEqual(normalizePolicy({ mfa: 'nunca' }), DEFAULT_POLICY);
  });

  it('parsePolicy rechaza valores fuera de rango', () => {
    assert.throws(() => parsePolicy({ idleHours: 0 }));
    assert.throws(() => parsePolicy({ allowedMethods: [] }));
    assert.equal(parsePolicy({ mfa: 'all' }).mfa, 'all');
  });

  it('sessionLimits toma el más corto entre entorno y política', () => {
    const l = sessionLimits({ ...DEFAULT_POLICY, idleHours: 1, sessionMaxDays: 400 });
    assert.equal(l.slidingHours, 1);
    assert.ok(l.maxDays <= 30);
  });
});
