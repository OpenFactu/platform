/** Si un cobro le cabe a su factura. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPaymentFits } from '../creditNoteMoney';

const invoice = (total: number, amountPaid = 0, extra: Record<string, unknown> = {}) => ({
  status: 'O',
  total: String(total),
  amountPaid: String(amountPaid),
  ...extra,
});
const creditNote = (total: number, amountPaid = 0) =>
  invoice(total, amountPaid, { rectifiesInvoiceId: 'factura' });

const refusedWith = (statusCode: number) => (err: any) => err.statusCode === statusCode;

describe('assertPaymentFits', () => {
  test('una factura admite hasta lo que queda', () => {
    assert.doesNotThrow(() => assertPaymentFits(invoice(121), 121));
    assert.doesNotThrow(() => assertPaymentFits(invoice(121, 50), 71));
    assert.throws(() => assertPaymentFits(invoice(121, 50), 71.01), refusedWith(409));
  });

  test('una factura saldada no admite nada', () => {
    assert.throws(() => assertPaymentFits(invoice(121, 121), 0.01), /saldada/);
    assert.throws(() => assertPaymentFits(invoice(121, 121), 0.01), refusedWith(409));
  });

  test('cuentan los céntimos, no las fracciones de céntimo', () => {
    assert.doesNotThrow(() => assertPaymentFits(invoice(93.398), 93.4));
    assert.throws(() => assertPaymentFits(invoice(93.398, 93.4), 0.01), /saldada/);
    assert.throws(() => assertPaymentFits(invoice(121.004, 121), 0.01), /saldada/);
  });

  test('solo se cobran facturas emitidas', () => {
    for (const status of ['D', 'X']) {
      assert.throws(() => assertPaymentFits(invoice(121, 0, { status }), 1), refusedWith(409));
    }
  });

  test('sin factura, o sin un importe de verdad, no hay cobro', () => {
    assert.throws(() => assertPaymentFits(undefined, 1), refusedWith(404));
    assert.throws(() => assertPaymentFits(invoice(121), 0), refusedWith(400));
    assert.throws(() => assertPaymentFits(invoice(121), Number.NaN), refusedWith(400));
    assert.throws(() => assertPaymentFits(invoice(121), -1), refusedWith(400));
  });

  test('un abono solo se devuelve, y hasta su saldo', () => {
    assert.doesNotThrow(() => assertPaymentFits(creditNote(-121), -121));
    assert.throws(() => assertPaymentFits(creditNote(-121), 1), refusedWith(400));
    assert.throws(() => assertPaymentFits(creditNote(-121), -121.01), refusedWith(400));
    assert.throws(() => assertPaymentFits(creditNote(-121, -121), -0.01), refusedWith(400));
  });
});
