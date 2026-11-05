import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateDifference,
  allocationProblem,
  buildCountLines,
  countedProblem,
  lineDifference,
  lineStock,
  negativeAfter,
  type ItemLayers,
} from '../countRules';

const plain = (over: Partial<ItemLayers> = {}): ItemLayers => ({
  itemId: 'a',
  manageBy: 'N',
  warehouse: 10,
  zones: [],
  batches: [],
  ...over,
});

describe('qué se cuenta al abrir', () => {
  test('sin zonas ni lotes, una línea por artículo', () => {
    assert.deepEqual(buildCountLines([plain()], null), [
      { itemId: 'a', zoneId: null, batchNum: null, expectedQty: 10 },
    ]);
  });

  test('con zonas, una línea por zona y otra con lo que no tiene ubicación', () => {
    const lines = buildCountLines([plain({ zones: [{ zoneId: 'z1', stock: 4 }] })], null);
    assert.deepEqual(lines, [
      { itemId: 'a', zoneId: 'z1', batchNum: null, expectedQty: 4 },
      { itemId: 'a', zoneId: null, batchNum: null, expectedQty: 6 },
    ]);
  });

  test('si todo está ubicado no sale la línea sin ubicación', () => {
    const lines = buildCountLines([plain({ zones: [{ zoneId: 'z1', stock: 10 }] })], null);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].zoneId, 'z1');
  });

  test('con lote, una línea por lote aunque tenga zonas', () => {
    const lines = buildCountLines(
      [
        plain({
          manageBy: 'B',
          zones: [{ zoneId: 'z1', stock: 4 }],
          batches: [
            { batchNum: 'L1', quantity: 7 },
            { batchNum: 'L2', quantity: 3 },
          ],
        }),
      ],
      null,
    );
    assert.deepEqual(lines, [
      { itemId: 'a', zoneId: null, batchNum: 'L1', expectedQty: 7 },
      { itemId: 'a', zoneId: null, batchNum: 'L2', expectedQty: 3 },
    ]);
  });

  test('lo que no está en ningún lote sale aparte', () => {
    const lines = buildCountLines(
      [plain({ manageBy: 'B', batches: [{ batchNum: 'L1', quantity: 7 }] })],
      null,
    );
    assert.deepEqual(lines[1], { itemId: 'a', zoneId: null, batchNum: null, expectedQty: 3 });
  });

  test('lo que ya se acabó no se cuenta', () => {
    const lines = buildCountLines(
      [
        plain({
          manageBy: 'B',
          warehouse: 3,
          batches: [
            { batchNum: 'L1', quantity: 3 },
            { batchNum: 'L2', quantity: 0 },
          ],
        }),
      ],
      null,
    );
    assert.deepEqual(
      lines.map((l) => l.batchNum),
      ['L1'],
    );
  });

  test('un stock en negativo también se cuenta: es lo que hay que arreglar', () => {
    const [line] = buildCountLines([plain({ warehouse: -3 })], null);
    assert.equal(line.expectedQty, -3);
  });

  test('en una zona, solo lo de esa zona y sin separar lotes', () => {
    const lines = buildCountLines(
      [
        plain({
          zones: [
            { zoneId: 'z1', stock: 4 },
            { zoneId: 'z2', stock: 6 },
          ],
        }),
        plain({
          itemId: 'b',
          manageBy: 'B',
          zones: [{ zoneId: 'z1', stock: 2 }],
          batches: [{ batchNum: 'L1', quantity: 10 }],
        }),
        plain({ itemId: 'c', zones: [{ zoneId: 'z2', stock: 1 }] }),
      ],
      'z1',
    );
    assert.deepEqual(lines, [
      { itemId: 'a', zoneId: 'z1', batchNum: null, expectedQty: 4 },
      { itemId: 'b', zoneId: 'z1', batchNum: null, expectedQty: 2 },
    ]);
  });
});

describe('cuánto dice el sistema de una línea', () => {
  const layers = plain({
    zones: [{ zoneId: 'z1', stock: 4 }],
  });
  const tracked = plain({
    manageBy: 'B',
    batches: [{ batchNum: 'L1', quantity: 7 }],
  });

  test('una zona, lo de la zona', () => {
    assert.equal(lineStock(layers, { zoneId: 'z1', batchNum: null }), 4);
  });
  test('sin zona, lo que no está en ninguna', () => {
    assert.equal(lineStock(layers, { zoneId: null, batchNum: null }), 6);
  });
  test('un lote, lo del lote', () => {
    assert.equal(lineStock(tracked, { zoneId: null, batchNum: 'L1' }), 7);
  });
  test('con lote pero sin decir cuál, lo que no está en ninguno', () => {
    assert.equal(lineStock(tracked, { zoneId: null, batchNum: null }), 3);
  });
  test('lo que no existe, cero', () => {
    assert.equal(lineStock(tracked, { zoneId: null, batchNum: 'NO' }), 0);
    assert.equal(lineStock(layers, { zoneId: 'NO', batchNum: null }), 0);
  });
});

describe('la diferencia', () => {
  test('es contra lo que había al contar, no contra lo que había al abrir', () => {
    assert.equal(lineDifference({ countedQty: 8, systemAtCount: 10 }), -2);
  });
  test('no arrastra decimales de más', () => {
    assert.equal(lineDifference({ countedQty: 0.3, systemAtCount: 0.1 }), 0.2);
  });
  test('sin contar no hay diferencia', () => {
    assert.equal(lineDifference({ countedQty: null, systemAtCount: 10 }), 0);
  });
});

describe('qué se puede contar', () => {
  const key = { zoneId: null, batchNum: null };
  test('nada negativo', () => {
    assert.ok(countedProblem(plain(), key, -1, 10));
  });
  test('un número de verdad', () => {
    assert.ok(countedProblem(plain(), key, Number.NaN, 10));
  });
  test('cero vale', () => {
    assert.equal(countedProblem(plain(), key, 0, 10), null);
  });
  test('una serie está o no está', () => {
    const serial = plain({ manageBy: 'S' });
    assert.ok(countedProblem(serial, { zoneId: null, batchNum: 'S1' }, 2, 1));
    assert.equal(countedProblem(serial, { zoneId: null, batchNum: 'S1' }, 1, 1), null);
    assert.equal(countedProblem(serial, { zoneId: null, batchNum: 'S1' }, 0, 1), null);
  });
  test('por zona, las series se cuentan enteras', () => {
    const serial = plain({ manageBy: 'S' });
    assert.ok(countedProblem(serial, { zoneId: 'z1', batchNum: null }, 1.5, 1));
    assert.equal(countedProblem(serial, { zoneId: 'z1', batchNum: null }, 2, 1), null);
  });
  test('sin lote no se puede añadir stock a un artículo con lote', () => {
    const tracked = plain({ manageBy: 'B' });
    assert.ok(countedProblem(tracked, key, 11, 10));
    assert.equal(countedProblem(tracked, key, 9, 10), null);
    assert.equal(countedProblem(tracked, key, 10, 10), null);
  });
  test('en una zona sí, porque luego se dice de qué lote es', () => {
    const tracked = plain({ manageBy: 'B' });
    assert.equal(countedProblem(tracked, { zoneId: 'z1', batchNum: null }, 11, 10), null);
  });
});

describe('a dónde va la diferencia', () => {
  test('sin nada más que decidir, a la propia línea', () => {
    assert.deepEqual(
      allocateDifference({
        line: { zoneId: 'z1', batchNum: null },
        difference: -2,
        layers: plain({ zones: [{ zoneId: 'z1', stock: 4 }] }),
      }),
      { allocations: [{ zoneId: 'z1', batchNum: null, quantity: -2 }], needsBatch: false },
    );
  });

  test('sin diferencia, nada', () => {
    assert.deepEqual(
      allocateDifference({
        line: { zoneId: null, batchNum: null },
        difference: 0,
        layers: plain(),
      }),
      { allocations: [], needsBatch: false },
    );
  });

  describe('un lote contado en un almacén con zonas', () => {
    const layers = plain({
      manageBy: 'B',
      warehouse: 10,
      zones: [
        { zoneId: 'z1', stock: 2 },
        { zoneId: 'z2', stock: 5 },
      ],
      batches: [{ batchNum: 'L1', quantity: 10 }],
    });
    const line = { zoneId: null, batchNum: 'L1' };

    test('lo que falta sale primero de lo que no tiene ubicación', () => {
      assert.deepEqual(allocateDifference({ line, difference: -2, layers }).allocations, [
        { zoneId: null, batchNum: 'L1', quantity: -2 },
      ]);
    });

    test('y después de la zona que más tiene', () => {
      assert.deepEqual(allocateDifference({ line, difference: -9, layers }).allocations, [
        { zoneId: null, batchNum: 'L1', quantity: -3 },
        { zoneId: 'z2', batchNum: 'L1', quantity: -5 },
        { zoneId: 'z1', batchNum: 'L1', quantity: -1 },
      ]);
    });

    test('lo que sobra va a la ubicación del artículo', () => {
      assert.deepEqual(
        allocateDifference({ line, difference: 2, layers, defaultZoneId: 'z1' }).allocations,
        [{ zoneId: 'z1', batchNum: 'L1', quantity: 2 }],
      );
    });

    test('sin ubicación propia, a la zona que más tiene', () => {
      assert.deepEqual(allocateDifference({ line, difference: 2, layers }).allocations, [
        { zoneId: 'z2', batchNum: 'L1', quantity: 2 },
      ]);
    });

    test('sin ninguna zona, sin zona', () => {
      assert.deepEqual(
        allocateDifference({
          line,
          difference: 2,
          layers: { ...layers, zones: [] },
        }).allocations,
        [{ zoneId: null, batchNum: 'L1', quantity: 2 }],
      );
    });
  });

  describe('un artículo con lote contado por zona', () => {
    const line = { zoneId: 'z1', batchNum: null };
    const zones = [{ zoneId: 'z1', stock: 4 }];

    test('con un solo lote, ese', () => {
      assert.deepEqual(
        allocateDifference({
          line,
          difference: -1,
          layers: plain({ manageBy: 'B', zones, batches: [{ batchNum: 'L1', quantity: 4 }] }),
        }),
        { allocations: [{ zoneId: 'z1', batchNum: 'L1', quantity: -1 }], needsBatch: false },
      );
    });

    test('con varios hay que decirlo', () => {
      const result = allocateDifference({
        line,
        difference: -1,
        layers: plain({
          manageBy: 'B',
          zones,
          batches: [
            { batchNum: 'L1', quantity: 2 },
            { batchNum: 'L2', quantity: 2 },
          ],
        }),
      });
      assert.equal(result.needsBatch, true);
      assert.deepEqual(result.allocations, []);
    });

    test('sin ninguno, hay que decirlo', () => {
      const result = allocateDifference({
        line,
        difference: 1,
        layers: plain({ manageBy: 'B', zones }),
      });
      assert.equal(result.needsBatch, true);
    });

    test('una serie que aparece nunca se adivina', () => {
      const result = allocateDifference({
        line,
        difference: 1,
        layers: plain({ manageBy: 'S', zones, batches: [{ batchNum: 'S1', quantity: 1 }] }),
      });
      assert.equal(result.needsBatch, true);
    });

    test('lo que ya se dijo manda', () => {
      const saved = [{ zoneId: 'z1', batchNum: 'L2', quantity: -1 }];
      assert.deepEqual(
        allocateDifference({
          line,
          difference: -1,
          saved,
          layers: plain({
            manageBy: 'B',
            zones,
            batches: [
              { batchNum: 'L1', quantity: 2 },
              { batchNum: 'L2', quantity: 2 },
            ],
          }),
        }),
        { allocations: saved, needsBatch: false },
      );
    });

    test('si lo dicho ya no suma la diferencia, hay que decirlo otra vez', () => {
      const result = allocateDifference({
        line,
        difference: -2,
        saved: [{ zoneId: 'z1', batchNum: 'L2', quantity: -1 }],
        layers: plain({
          manageBy: 'B',
          zones,
          batches: [
            { batchNum: 'L1', quantity: 2 },
            { batchNum: 'L2', quantity: 2 },
          ],
        }),
      });
      assert.equal(result.needsBatch, true);
    });
  });
});

describe('qué se puede decir de los lotes de una diferencia', () => {
  const tracked = plain({ manageBy: 'B' });
  const serial = plain({ manageBy: 'S' });

  test('tiene que sumar la diferencia', () => {
    assert.ok(allocationProblem(tracked, [{ batchNum: 'L1', quantity: -1 }], -2));
    assert.equal(allocationProblem(tracked, [{ batchNum: 'L1', quantity: -2 }], -2), null);
  });
  test('todas con lote', () => {
    assert.ok(allocationProblem(tracked, [{ batchNum: ' ', quantity: -2 }], -2));
  });
  test('todas del mismo signo que la diferencia', () => {
    assert.ok(
      allocationProblem(
        tracked,
        [
          { batchNum: 'L1', quantity: -3 },
          { batchNum: 'L2', quantity: 1 },
        ],
        -2,
      ),
    );
  });
  test('una serie, de una en una', () => {
    assert.ok(allocationProblem(serial, [{ batchNum: 'S1', quantity: -2 }], -2));
    assert.equal(
      allocationProblem(
        serial,
        [
          { batchNum: 'S1', quantity: -1 },
          { batchNum: 'S2', quantity: -1 },
        ],
        -2,
      ),
      null,
    );
  });
});

describe('no se puede dejar en negativo', () => {
  const layers = plain({
    manageBy: 'B',
    warehouse: 5,
    zones: [{ zoneId: 'z1', stock: 3 }],
    batches: [{ batchNum: 'L1', quantity: 5 }],
  });

  test('lo que cabe, pasa', () => {
    assert.deepEqual(negativeAfter(layers, [{ zoneId: 'z1', batchNum: 'L1', quantity: -3 }]), []);
  });
  test('una zona que no llega', () => {
    assert.deepEqual(negativeAfter(layers, [{ zoneId: 'z1', batchNum: 'L1', quantity: -4 }]), [
      { layer: 'zone', zoneId: 'z1', after: -1 },
    ]);
  });
  test('un lote que no llega', () => {
    assert.deepEqual(negativeAfter(layers, [{ zoneId: null, batchNum: 'L2', quantity: -1 }]), [
      { layer: 'batch', batchNum: 'L2', after: -1 },
    ]);
  });
  test('un almacén que no llega', () => {
    assert.deepEqual(
      negativeAfter(plain({ warehouse: 1 }), [{ zoneId: null, batchNum: null, quantity: -2 }]),
      [{ layer: 'warehouse', after: -1 }],
    );
  });
  test('un negativo que mejora, pasa', () => {
    assert.deepEqual(
      negativeAfter(plain({ warehouse: -5 }), [{ zoneId: null, batchNum: null, quantity: 3 }]),
      [],
    );
  });
  test('suma lo de varias líneas del mismo artículo', () => {
    assert.deepEqual(
      negativeAfter(plain({ warehouse: 3 }), [
        { zoneId: null, batchNum: null, quantity: -2 },
        { zoneId: null, batchNum: null, quantity: -2 },
      ]),
      [{ layer: 'warehouse', after: -1 }],
    );
  });
});
