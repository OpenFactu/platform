import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { funnelFromHistory, parsePeriod } from '../reports';

const stages = [
  { id: 'new', name: 'Nueva', kind: 'open', sortOrder: 10 },
  { id: 'prop', name: 'Propuesta', kind: 'open', sortOrder: 20 },
  { id: 'won', name: 'Ganada', kind: 'won', sortOrder: 30 },
  { id: 'lost', name: 'Perdida', kind: 'lost', sortOrder: 40 },
];
const d = (day: number) => new Date(Date.UTC(2026, 0, day));

describe('funnelFromHistory', () => {
  const opps = [
    { id: 'a', stageId: 'won', createdAt: d(1) }, // nueva → propuesta → ganada
    { id: 'b', stageId: 'lost', createdAt: d(1) }, // nueva → perdida
    { id: 'c', stageId: 'new', createdAt: d(1) }, // sigue en nueva, nunca se movió
    { id: 'e', stageId: 'won', createdAt: d(1) }, // nueva → ganada directamente
  ];
  const history = [
    { opportunityId: 'a', fromStageId: 'new', toStageId: 'prop', changedAt: d(3) },
    { opportunityId: 'a', fromStageId: 'prop', toStageId: 'won', changedAt: d(7) },
    { opportunityId: 'b', fromStageId: 'new', toStageId: 'lost', changedAt: d(5) },
    { opportunityId: 'e', fromStageId: 'new', toStageId: 'won', changedAt: d(2) },
  ];
  const r = Object.fromEntries(funnelFromHistory(stages, opps, history).map((x) => [x.stageId, x]));

  test('cuenta quién pasó por cada etapa, incluida la inicial sin historial', () => {
    assert.equal(r.new.reached, 4);
    assert.equal(r.prop.reached, 1);
    assert.equal(r.won.reached, 2);
    assert.equal(r.lost.reached, 1);
  });
  test('conversión: ganar cuenta como superar la etapa', () => {
    // De las 4 que pasaron por Nueva, a llegó a Propuesta y e ganó: 2 de 4.
    assert.equal(r.new.conversion, 50);
    // La última abierta convierte hacia ganada: 1 de 1.
    assert.equal(r.prop.conversion, 100);
    assert.equal(r.won.conversion, null);
  });
  test('días medios solo de estancias terminadas', () => {
    // En Nueva: a 2 días, b 4 días, e 1 día (c sigue dentro y no cuenta).
    assert.equal(r.new.avgDays, 2.3);
    assert.equal(r.prop.avgDays, 4);
  });
});

describe('parsePeriod', () => {
  test('por defecto, los últimos 12 meses', () => {
    const p = parsePeriod({});
    const days = (p.to.getTime() - p.from.getTime()) / 86_400_000;
    assert.equal(Math.round(days), 365);
  });
  test('rechaza fechas no válidas', () => {
    assert.throws(() => parsePeriod({ from: 'ayer' }), /Periodo/);
  });
});
