import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyToday } from '../shipmentViews';

const NOW = new Date('2026-11-03T12:00:00');
const shipment = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  status,
  preparationStatus: status,
  ...extra,
});

describe('qué hay que mirar hoy', () => {
  test('un envío pendiente sin ruta está por planificar: no se queda sin aparecer', () => {
    const groups = classifyToday(
      [shipment('libre', 'pending'), shipment('en-ruta', 'pending')],
      [{ shipmentId: 'en-ruta', routeId: 'r1' }],
      [{ id: 'r1', plannedDate: '2026-11-03' }],
      NOW,
    );
    assert.deepEqual(
      groups.readyForRoute.map((s) => s.id),
      ['libre'],
    );
  });

  test('reparte los envíos por lo que toca hacer con ellos', () => {
    const groups = classifyToday(
      [
        shipment('a', 'picking'),
        shipment('b', 'receiving'),
        shipment('c', 'ready'),
        shipment('d', 'dispatched'),
        shipment('e', 'exception'),
        shipment('f', 'postponed'),
      ],
      [{ shipmentId: 'd', routeId: 'r1' }],
      [{ id: 'r1', plannedDate: '2026-11-03' }],
      NOW,
    );
    assert.deepEqual(
      groups.toPrepare.map((s) => s.id),
      ['a', 'b'],
    );
    assert.deepEqual(
      groups.readyForRoute.map((s) => s.id),
      ['c', 'f'],
    );
    assert.deepEqual(
      groups.onRoute.map((s) => s.id),
      ['d'],
    );
    assert.deepEqual(
      groups.incidents.map((s) => s.id),
      ['e'],
    );
    assert.equal(groups.late.length, 0);
    assert.equal(groups.staleRoutes.length, 0);
  });

  test('lo que ya tiene parada no está pendiente de ruta', () => {
    const groups = classifyToday(
      [shipment('a', 'ready')],
      [{ shipmentId: 'a', routeId: 'r1' }],
      [],
      NOW,
    );
    assert.equal(groups.readyForRoute.length, 0);
  });

  test('una ruta sin terminar de otro día está abierta de más, y lo suyo va tarde', () => {
    const groups = classifyToday(
      [shipment('a', 'in_transit'), shipment('b', 'in_transit')],
      [
        { shipmentId: 'a', routeId: 'vieja' },
        { shipmentId: 'b', routeId: 'hoy' },
      ],
      [
        { id: 'vieja', plannedDate: '2026-07-21' },
        { id: 'hoy', plannedDate: '2026-11-03' },
      ],
      NOW,
    );
    assert.deepEqual(
      groups.staleRoutes.map((r) => r.id),
      ['vieja'],
    );
    assert.deepEqual(
      groups.late.map((s) => s.id),
      ['a'],
    );
  });

  test('un envío con la fecha prevista pasada va tarde', () => {
    const groups = classifyToday(
      [
        shipment('a', 'ready', { estimatedDelivery: '2026-11-02T10:00:00' }),
        shipment('b', 'ready', { estimatedDelivery: '2026-11-04T10:00:00' }),
      ],
      [],
      [],
      NOW,
    );
    assert.deepEqual(
      groups.late.map((s) => s.id),
      ['a'],
    );
  });

  test('lo cerrado no cuenta', () => {
    const groups = classifyToday(
      [
        shipment('a', 'delivered', { estimatedDelivery: '2026-11-01T10:00:00' }),
        shipment('b', 'cancelled'),
      ],
      [],
      [],
      NOW,
    );
    assert.equal(groups.late.length, 0);
    assert.equal(groups.readyForRoute.length, 0);
  });
});
