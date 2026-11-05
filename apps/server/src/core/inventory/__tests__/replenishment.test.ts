import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { deliveryDateFor, groupBySupplier, suggestion } from '../replenishmentRules';

describe('cuánto pedir', () => {
  const base = { stock: 2, committed: 0, ordered: 0, inDraft: 0, minStock: 10, reorderQty: 0 };

  test('lo que falta para llegar al mínimo', () => {
    assert.deepEqual(suggestion(base), { projected: 2, shortfall: 8, suggested: 8 });
  });

  test('lo comprometido resta', () => {
    assert.equal(suggestion({ ...base, committed: 3 }).projected, -1);
    assert.equal(suggestion({ ...base, committed: 3 }).suggested, 11);
  });

  test('lo pedido suma', () => {
    assert.equal(suggestion({ ...base, ordered: 5 }).projected, 7);
    assert.equal(suggestion({ ...base, ordered: 5 }).suggested, 3);
  });

  test('justo en el mínimo no hace falta', () => {
    assert.deepEqual(suggestion({ ...base, stock: 10 }), {
      projected: 10,
      shortfall: 0,
      suggested: 0,
    });
  });

  test('por encima del mínimo no hace falta', () => {
    assert.equal(suggestion({ ...base, stock: 30 }).shortfall, 0);
  });

  test('sin mínimo no hay nada que reponer', () => {
    assert.deepEqual(suggestion({ ...base, stock: -5, minStock: 0 }), {
      projected: -5,
      shortfall: 0,
      suggested: 0,
    });
  });

  test('la cantidad de reposición manda si es mayor', () => {
    assert.equal(suggestion({ ...base, reorderQty: 50 }).suggested, 50);
  });

  test('si no llega con ella, se pide lo que falta', () => {
    assert.equal(suggestion({ ...base, stock: -60, reorderQty: 50 }).suggested, 70);
  });

  test('un borrador ya cubre lo que falta', () => {
    assert.equal(suggestion({ ...base, inDraft: 8 }).suggested, 0);
    assert.equal(suggestion({ ...base, inDraft: 20 }).suggested, 0);
  });

  test('un borrador corto deja pedir el resto', () => {
    assert.equal(suggestion({ ...base, inDraft: 5 }).suggested, 3);
  });

  test('el borrador no cuenta como pedido en lo previsto', () => {
    assert.equal(suggestion({ ...base, inDraft: 5 }).projected, 2);
  });

  test('no arrastra decimales', () => {
    assert.equal(suggestion({ ...base, stock: 9.9, minStock: 10 }).suggested, 0.1);
  });
});

describe('agrupar por proveedor', () => {
  test('un pedido por proveedor, con sus líneas', () => {
    const groups = groupBySupplier([
      { itemId: 'a', quantity: 1, supplierId: 'p1' },
      { itemId: 'b', quantity: 2, supplierId: 'p2' },
      { itemId: 'c', quantity: 3, supplierId: 'p1' },
    ]);
    assert.deepEqual(
      groups.map((group) => [group.supplierId, group.lines.map((line) => line.itemId)]),
      [
        ['p1', ['a', 'c']],
        ['p2', ['b']],
      ],
    );
  });
  test('sin nada, nada', () => {
    assert.deepEqual(groupBySupplier([]), []);
  });
});

describe('cuándo llega', () => {
  test('la fecha más el mayor de los plazos', () => {
    assert.equal(deliveryDateFor('2026-06-15', [3, 10, null]), '2026-06-25');
  });
  test('cruza de mes', () => {
    assert.equal(deliveryDateFor('2026-06-25', [10]), '2026-07-05');
  });
  test('sin plazos, no se dice', () => {
    assert.equal(deliveryDateFor('2026-06-15', [null, null]), null);
    assert.equal(deliveryDateFor('2026-06-15', []), null);
  });
  test('un plazo de cero es hoy', () => {
    assert.equal(deliveryDateFor('2026-06-15', [0]), '2026-06-15');
  });
});
