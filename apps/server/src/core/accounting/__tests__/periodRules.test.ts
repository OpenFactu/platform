import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { coversDate, periodDays } from '../periodRules';

const year2026 = { first: '2026-01-01', last: '2026-12-31' };

describe('qué días cubre un periodo', () => {
  test('sembrado en España: guardado con la hora local pasada a UTC', () => {
    assert.deepEqual(
      periodDays({
        startDate: new Date('2025-12-31T23:00:00Z'),
        endDate: new Date('2026-12-31T22:59:59Z'),
      }),
      year2026,
    );
  });

  test('sembrado en un servidor en UTC', () => {
    assert.deepEqual(
      periodDays({
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: new Date('2026-12-31T23:59:59Z'),
      }),
      year2026,
    );
  });

  test('sembrado en Nueva York', () => {
    assert.deepEqual(
      periodDays({
        startDate: new Date('2026-01-01T05:00:00Z'),
        endDate: new Date('2027-01-01T04:59:59Z'),
      }),
      year2026,
    );
  });

  test('creado desde la pantalla, con solo el día', () => {
    assert.deepEqual(periodDays({ startDate: '2026-01-01', endDate: '2026-12-31' }), year2026);
  });
});

describe('si una fecha cae en un periodo', () => {
  const period = {
    startDate: new Date('2025-12-31T23:00:00Z'),
    endDate: new Date('2026-12-31T22:59:59Z'),
  };

  test('el primer y el último día cuentan', () => {
    assert.equal(coversDate(period, '2026-01-01'), true);
    assert.equal(coversDate(period, '2026-12-31'), true);
  });

  test('el día anterior y el siguiente, no', () => {
    assert.equal(coversDate(period, '2025-12-31'), false);
    assert.equal(coversDate(period, '2027-01-01'), false);
  });

  test('también con una fecha guardada, que trae hora', () => {
    assert.equal(coversDate(period, new Date('2026-06-15T00:00:00Z')), true);
    assert.equal(coversDate(period, '2026-06-15T10:30:00.000Z'), true);
  });

  test('una fecha sin sentido no cae en ninguno', () => {
    assert.equal(coversDate(period, 'hola'), false);
  });
});
