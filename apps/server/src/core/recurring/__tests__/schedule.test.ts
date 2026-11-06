import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { firstAfter, firstOnOrAfter, isIsoDate, occurrence } from '../schedule';

const series = (start: string, frequency: any, count: number) =>
  Array.from({ length: count }, (_, n) => occurrence(start, frequency, n));

describe('las fechas de una recurrente', () => {
  test('mensual, el mismo día', () => {
    assert.deepEqual(series('2026-01-15', 'monthly', 3), [
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
    ]);
  });

  test('un día 31 sigue siendo fin de mes después de febrero', () => {
    assert.deepEqual(series('2026-01-31', 'monthly', 4), [
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  test('en un año bisiesto, febrero llega al 29', () => {
    assert.equal(occurrence('2028-01-31', 'monthly', 1), '2028-02-29');
    assert.equal(occurrence('2028-02-29', 'yearly', 1), '2029-02-28');
    assert.equal(occurrence('2028-02-29', 'yearly', 4), '2032-02-29');
  });

  test('cruza de año sin perderse', () => {
    assert.deepEqual(series('2026-11-30', 'monthly', 4), [
      '2026-11-30',
      '2026-12-30',
      '2027-01-30',
      '2027-02-28',
    ]);
  });

  test('trimestral, semestral, anual y semanal', () => {
    assert.equal(occurrence('2026-01-31', 'quarterly', 1), '2026-04-30');
    assert.equal(occurrence('2026-08-31', 'semiannual', 1), '2027-02-28');
    assert.equal(occurrence('2026-03-01', 'yearly', 2), '2028-03-01');
    assert.deepEqual(series('2026-12-28', 'weekly', 2), ['2026-12-28', '2027-01-04']);
  });

  test('la primera en o después de un día', () => {
    assert.equal(firstOnOrAfter('2026-01-31', 'monthly', '2026-03-01'), '2026-03-31');
    assert.equal(firstOnOrAfter('2026-01-31', 'monthly', '2026-03-31'), '2026-03-31');
    assert.equal(firstOnOrAfter('2026-06-01', 'monthly', '2026-01-01'), '2026-06-01');
  });

  test('la primera después de un día no repite ese día', () => {
    assert.equal(firstAfter('2026-01-31', 'monthly', '2026-02-28'), '2026-03-31');
    assert.equal(firstAfter('2026-01-15', 'weekly', '2026-01-15'), '2026-01-22');
  });

  test('reconoce una fecha de verdad', () => {
    assert.equal(isIsoDate('2026-02-28'), true);
    assert.equal(isIsoDate('2026-02-30'), false);
    assert.equal(isIsoDate('28/02/2026'), false);
    assert.equal(isIsoDate(null), false);
  });
});
