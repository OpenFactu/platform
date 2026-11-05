import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recalcInvoicePaymentStatus } from '../paymentStatusRecalc';

/** Un cliente de base mínimo: una factura y la suma de sus cobros. */
function fakeDb(total: string, paid: number) {
  const updates: any[] = [];
  const db = {
    select: (fields?: any) => ({
      from: () => ({
        where: async () => (fields?.sum !== undefined ? [{ sum: paid }] : [{ id: 'f', total }]),
      }),
    }),
    update: () => ({
      set: (values: any) => {
        updates.push(values);
        return { where: async () => undefined };
      },
    }),
  };
  return { db, updates };
}

const statusOf = async (total: string, paid: number) => {
  const { db } = fakeDb(total, paid);
  return (await recalcInvoicePaymentStatus(db, 'sales', 'f'))?.paymentStatus;
};

test('factura normal: pendiente, parcial y pagada', async () => {
  assert.equal(await statusOf('100', 0), 'pending');
  assert.equal(await statusOf('100', 40), 'partial');
  assert.equal(await statusOf('100', 100), 'paid');
});

test('abono: pendiente, parcial y pagado con importes negativos', async () => {
  assert.equal(await statusOf('-100', 0), 'pending');
  assert.equal(await statusOf('-100', -40), 'partial');
  assert.equal(await statusOf('-100', -100), 'paid');
});

test('un total a cero no queda pendiente si se ha aplicado algo', async () => {
  assert.equal(await statusOf('0', 0), 'pending');
});
