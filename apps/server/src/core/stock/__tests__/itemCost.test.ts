import { test } from 'node:test';
import assert from 'node:assert/strict';
import { averageAfterEntry, averageAfterUndo } from '../itemCost';

test('la primera entrada pone el coste', () => {
  assert.equal(averageAfterEntry(0, 0, 10, 12), 12);
});

test('las entradas ponderan por cantidad', () => {
  assert.equal(averageAfterEntry(10, 10, 10, 20), 15);
  assert.equal(averageAfterEntry(15, 15, 5, 30), 18.75);
});

test('con stock negativo o a cero, el coste es el de la entrada', () => {
  assert.equal(averageAfterEntry(-2, 50, 5, 9), 9);
  assert.equal(averageAfterEntry(0, 50, 5, 9), 9);
});

test('una entrada a coste cero baja la media', () => {
  assert.equal(averageAfterEntry(10, 10, 10, 0), 5);
});

test('deshacer una entrada vuelve a la media anterior', () => {
  const after = averageAfterEntry(15, 15, 5, 30);
  assert.equal(averageAfterUndo(20, after, 5, 30), 15);
});

test('deshacer la única entrada deja el coste como estaba', () => {
  assert.equal(averageAfterUndo(5, 12, 5, 12), 12);
});

test('deshacer nunca deja un coste negativo', () => {
  assert.equal(averageAfterUndo(10, 1, 5, 100), 0);
});

test('se redondea a seis decimales', () => {
  assert.equal(averageAfterEntry(3, 1, 1, 2), 1.25);
  assert.equal(averageAfterEntry(10, 20, 5, 15), 18.333333);
});
