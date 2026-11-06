import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { nextLevelOf, overdueOf, reachedLevel } from '../overdue';

const LEVELS = [
  { days: 7, subject: '', body: '' },
  { days: 30, subject: '', body: '' },
  { days: 60, subject: '', body: '' },
];

describe('lo vencido de una factura', () => {
  test('vence entera en su fecha y cuenta los días', () => {
    const result = overdueOf(
      { total: 100, date: '2026-01-01', dueDate: '2026-03-01' },
      '2026-03-11',
    );
    assert.deepEqual(result, { amount: 100, dueDate: '2026-03-01', days: 10 });
  });

  test('sin fecha de vencimiento, vence el día de la factura', () => {
    const result = overdueOf({ total: 100, date: new Date('2026-03-01T10:00:00Z') }, '2026-03-02');
    assert.deepEqual(result, { amount: 100, dueDate: '2026-03-01', days: 1 });
  });

  test('el retraso no cuenta antes de emitirse', () => {
    const result = overdueOf(
      { total: 100, date: '2026-01-01', dueDate: '2026-01-31', lockedAt: '2026-03-08T09:00:00Z' },
      '2026-03-10',
    );
    assert.deepEqual(result, { amount: 100, dueDate: '2026-01-31', days: 2 });
  });

  test('emitida hoy con una fecha atrasada, lleva cero días', () => {
    const result = overdueOf(
      { total: 100, date: '2026-01-01', lockedAt: new Date('2026-03-10T09:00:00Z') },
      '2026-03-10',
    );
    assert.equal(result?.days, 0);
  });

  test('emitida antes de vencer, cuenta desde que venció', () => {
    const result = overdueOf(
      { total: 100, date: '2026-01-01', dueDate: '2026-03-01', lockedAt: '2026-01-01' },
      '2026-03-11',
    );
    assert.equal(result?.days, 10);
  });

  test('lo que vence hoy aún no está vencido', () => {
    assert.equal(
      overdueOf({ total: 100, date: '2026-03-01', dueDate: '2026-03-02' }, '2026-03-02'),
      null,
    );
  });

  test('resta lo cobrado', () => {
    const result = overdueOf(
      { total: 100, amountPaid: 30.5, date: '2026-03-01', dueDate: '2026-03-01' },
      '2026-03-05',
    );
    assert.equal(result?.amount, 69.5);
  });

  test('saldada no tiene nada vencido', () => {
    assert.equal(
      overdueOf(
        { total: 100, amountPaid: 100, date: '2026-03-01', dueDate: '2026-03-01' },
        '2026-04-01',
      ),
      null,
    );
  });

  test('no la da por vencida por menos de un céntimo: el total guarda más decimales', () => {
    assert.equal(
      overdueOf(
        { total: 93.398, amountPaid: 93.4, date: '2026-03-01', dueDate: '2026-03-01' },
        '2026-04-01',
      ),
      null,
    );
  });

  describe('con plazos', () => {
    const invoice = {
      total: 300,
      date: '2026-01-01',
      dueDate: '2026-04-01',
      paymentDueLines: [
        { date: '2026-02-01', amount: 100 },
        { date: '2026-03-01', amount: 100 },
        { date: '2026-04-01', amount: 100 },
      ],
    };

    test('solo los plazos pasados, y desde el primero', () => {
      assert.deepEqual(overdueOf(invoice, '2026-03-15'), {
        amount: 200,
        dueDate: '2026-02-01',
        days: 42,
      });
    });

    test('lo cobrado cubre primero el plazo más antiguo', () => {
      assert.deepEqual(overdueOf({ ...invoice, amountPaid: 150 }, '2026-03-15'), {
        amount: 50,
        dueDate: '2026-03-01',
        days: 14,
      });
    });

    test('con los plazos pasados cubiertos no hay nada vencido', () => {
      assert.equal(overdueOf({ ...invoice, amountPaid: 200 }, '2026-03-15'), null);
    });

    test('da igual en qué orden vengan guardados', () => {
      const shuffled = { ...invoice, paymentDueLines: [...invoice.paymentDueLines].reverse() };
      assert.equal(
        overdueOf({ ...shuffled, amountPaid: 150 }, '2026-03-15')?.dueDate,
        '2026-03-01',
      );
    });
  });
});

describe('niveles', () => {
  test('el nivel al que llega por sus días', () => {
    assert.equal(reachedLevel(3, LEVELS), 0);
    assert.equal(reachedLevel(7, LEVELS), 1);
    assert.equal(reachedLevel(29, LEVELS), 1);
    assert.equal(reachedLevel(30, LEVELS), 2);
    assert.equal(reachedLevel(500, LEVELS), 3);
  });

  test('sube de uno en uno: el primer aviso es siempre el primero', () => {
    assert.equal(nextLevelOf(500, 0, LEVELS), 1);
    assert.equal(nextLevelOf(500, 1, LEVELS), 2);
    assert.equal(nextLevelOf(500, 2, LEVELS), 3);
  });

  test('no toca otro hasta llegar a sus días', () => {
    assert.equal(nextLevelOf(20, 1, LEVELS), null);
    assert.equal(nextLevelOf(3, 0, LEVELS), null);
  });

  test('tras el último no hay más', () => {
    assert.equal(nextLevelOf(500, 3, LEVELS), null);
  });
});
