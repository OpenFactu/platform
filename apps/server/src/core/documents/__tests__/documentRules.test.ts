import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { documentProblem } from '../documentRules';

const line = (patch: Record<string, unknown> = {}) => ({
  itemId: 'a',
  quantity: 2,
  price: 10,
  taxGroupId: 't',
  ...patch,
});
const request = (patch: Record<string, unknown> = {}) => ({
  seriesId: 's',
  periodId: 'p',
  partnerId: 'c',
  date: '2026-06-15',
  lines: [line()],
  ...patch,
});

describe('lo que un documento no puede traer', () => {
  test('un documento normal pasa', () => {
    assert.equal(documentProblem(request() as any), null);
  });

  const headerCases: Array<[string, Record<string, unknown>, RegExp]> = [
    ['sin interlocutor', { partnerId: undefined }, /interlocutor/],
    ['sin serie', { seriesId: '' }, /serie/],
    ['sin periodo', { periodId: null }, /periodo/],
    ['sin fecha', { date: undefined }, /fecha/],
    ['con una fecha sin sentido', { date: 'hola' }, /fecha/],
    ['sin líneas', { lines: [] }, /líneas/],
    ['con las líneas mal', { lines: 'nada' }, /líneas/],
    ['con una retención de más del 100 %', { withholdingRate: 150 }, /retención/],
  ];
  for (const [name, patch, expected] of headerCases) {
    test(name, () => {
      assert.match(String(documentProblem(request(patch) as any)), expected);
    });
  }

  const lineCases: Array<[string, Record<string, unknown>, RegExp]> = [
    ['línea sin artículo', { itemId: undefined }, /línea 1 no tiene artículo/],
    ['cantidad cero', { quantity: 0 }, /cantidad de la línea 1/],
    ['cantidad negativa', { quantity: -3 }, /cantidad de la línea 1/],
    ['cantidad de texto', { quantity: 'abc' }, /cantidad de la línea 1/],
    ['cantidad infinita', { quantity: Infinity }, /cantidad de la línea 1/],
    ['un total en negativo', { price: -5 }, /total del documento/],
    ['precio de texto', { price: 'abc' }, /precio de la línea 1/],
    ['descuento de más del 100 %', { discountRate: 150 }, /descuento de la línea 1/],
    ['descuento negativo', { discountRate: -1 }, /descuento de la línea 1/],
    ['descuento mayor que el importe', { discountAmount: 21 }, /descuento de la línea 1/],
    ['retención de línea de más del 100 %', { withholdingRate: 101 }, /retención de la línea 1/],
    ['factor de unidad cero', { uomFactor: 0 }, /unidad de la línea 1/],
  ];
  for (const [name, patch, expected] of lineCases) {
    test(name, () => {
      assert.match(String(documentProblem(request({ lines: [line(patch)] }) as any)), expected);
    });
  }

  test('el número de línea es el que toca', () => {
    const problem = documentProblem(request({ lines: [line(), line({ quantity: 0 })] }) as any);
    assert.match(String(problem), /línea 2/);
  });

  test('una línea de descuento en negativo vale si el total sigue en positivo', () => {
    const lines = [line({ price: 50 }), line({ quantity: 1, price: -20 })];
    assert.equal(documentProblem(request({ lines }) as any), null);
  });

  test('y si el total queda justo a cero, también', () => {
    const lines = [line({ quantity: 1, price: 20 }), line({ quantity: 1, price: -20 })];
    assert.equal(documentProblem(request({ lines }) as any), null);
  });

  test('el descuento cuenta para el total', () => {
    const lines = [
      line({ quantity: 1, price: 20, discountRate: 50 }),
      line({ quantity: 1, price: -15 }),
    ];
    assert.match(String(documentProblem(request({ lines }) as any)), /total del documento/);
  });

  test('un precio sin indicar es cero, como hasta ahora', () => {
    assert.equal(documentProblem(request({ lines: [line({ price: undefined })] }) as any), null);
    assert.equal(documentProblem(request({ lines: [line({ price: 0 })] }) as any), null);
  });
});

describe('un abono', () => {
  const credit = (patch: Record<string, unknown>) =>
    request({ rectifiesInvoiceId: 'f', lines: [line({ quantity: -2, ...patch })] }) as any;

  test('lleva las cantidades en negativo', () => {
    assert.equal(documentProblem(credit({})), null);
  });

  test('pero tampoco admite una cantidad cero', () => {
    assert.match(String(documentProblem(credit({ quantity: 0 }))), /cantidad de la línea 1/);
  });

  test('su descuento fijo va en negativo y no pasa del importe', () => {
    assert.equal(documentProblem(credit({ discountAmount: -5 })), null);
    assert.match(String(documentProblem(credit({ discountAmount: -21 }))), /descuento/);
  });
});
