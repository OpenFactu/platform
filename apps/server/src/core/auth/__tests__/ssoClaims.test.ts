import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { claimRules, safeReturnTo } from '../sso';

const TID = '72f988bf-86f1-41af-91ab-2d7cd011db47';

describe('reglas de las claims del SSO', () => {
  it('google y oidc: verificado solo con email_verified === true', () => {
    const p = { kind: 'google', allowedDomains: null };
    assert.equal(claimRules(p, { email: 'A@x.test', email_verified: true }).emailVerified, true);
    assert.equal(claimRules(p, { email: 'a@x.test', email_verified: 'true' }).emailVerified, false);
    assert.equal(claimRules(p, { email: 'A@X.test ' }).email, 'a@x.test');
    const o = { kind: 'oidc', allowedDomains: null };
    assert.equal(claimRules(o, { email: 'a@x.test' }).emailVerified, false);
  });

  it('microsoft: el email solo cuenta con un tid permitido', () => {
    const none = { kind: 'microsoft', allowedDomains: null };
    // Aunque diga email_verified: Microsoft no lo garantiza.
    const r = claimRules(none, { email: 'a@x.test', email_verified: true, tid: TID });
    assert.equal(r.emailVerified, false);
    assert.equal(r.domainAllowed, true);

    const byTid = { kind: 'microsoft', allowedDomains: JSON.stringify([TID.toUpperCase()]) };
    assert.equal(claimRules(byTid, { email: 'a@x.test', tid: TID }).emailVerified, true);
    assert.equal(claimRules(byTid, { email: 'a@x.test', tid: 'otro' }).domainAllowed, false);

    // Por el dominio del email pasa el filtro, pero el email no queda verificado.
    const byDomain = { kind: 'microsoft', allowedDomains: JSON.stringify(['empresa.test']) };
    const d = claimRules(byDomain, { email: 'a@empresa.test', tid: 'cualquiera' });
    assert.equal(d.domainAllowed, true);
    assert.equal(d.emailVerified, false);
  });

  it('allowedDomains filtra por dominio del email o por hd de Google', () => {
    const p = { kind: 'google', allowedDomains: JSON.stringify(['empresa.test']) };
    assert.equal(claimRules(p, { email: 'a@gmail.com' }).domainAllowed, false);
    assert.equal(claimRules(p, { email: 'a@empresa.test' }).domainAllowed, true);
    assert.equal(claimRules(p, { email: 'a@sub.test', hd: 'Empresa.test' }).domainAllowed, true);
    const o = { kind: 'oidc', allowedDomains: JSON.stringify(['empresa.test']) };
    assert.equal(claimRules(o, { email: 'a@sub.test', hd: 'empresa.test' }).domainAllowed, false);
  });

  it('return solo admite rutas de la propia web', () => {
    assert.equal(safeReturnTo('/sales/invoices?x=1'), '/sales/invoices?x=1');
    assert.equal(safeReturnTo('//evil.test/x'), undefined);
    assert.equal(safeReturnTo('https://evil.test'), undefined);
    assert.equal(safeReturnTo('/\\evil.test'), undefined);
    assert.equal(safeReturnTo(undefined), undefined);
  });
});
