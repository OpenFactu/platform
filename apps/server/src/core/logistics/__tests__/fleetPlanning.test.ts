import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceKm, estimateStopTimes, fleetWarnings, outsideWindow } from '../fleetPlanning';

describe('hora estimada de cada parada', () => {
  const start = new Date('2026-11-04T08:00:00Z');

  test('suma el viaje y el tiempo de atender cada parada', () => {
    // Un grado de latitud son unos 111 km: a 40 km/h, casi tres horas de viaje.
    const times = estimateStopTimes(
      start,
      [
        { lat: 40, lng: -3 },
        { lat: 41, lng: -3 },
      ],
      { speedKmh: 40, serviceMinutes: 10 },
    );
    assert.equal(times[0]?.toISOString(), start.toISOString());
    const minutes = (times[1]!.getTime() - start.getTime()) / 60000;
    assert.ok(minutes > 170 && minutes < 180, `${minutes}`);
  });

  test('una parada sin coordenadas no tiene hora, y las siguientes siguen desde la última conocida', () => {
    const times = estimateStopTimes(
      start,
      [{ lat: 40, lng: -3 }, null, { lat: 40, lng: -3 }],
      { speedKmh: 40, serviceMinutes: 10 },
    );
    assert.equal(times[1], null);
    assert.equal((times[2]!.getTime() - start.getTime()) / 60000, 10);
  });

  test('la distancia entre dos puntos es razonable', () => {
    const km = distanceKm({ lat: 40.4168, lng: -3.7038 }, { lat: 41.3874, lng: 2.1686 });
    assert.ok(km > 490 && km < 520, `${km}`);
  });
});

describe('ventana horaria', () => {
  test('dentro no avisa', () => {
    assert.equal(outsideWindow(new Date(2026, 10, 4, 10, 30), '09:00', '14:00'), false);
  });
  test('fuera avisa', () => {
    assert.equal(outsideWindow(new Date(2026, 10, 4, 15, 0), '09:00', '14:00'), true);
    assert.equal(outsideWindow(new Date(2026, 10, 4, 8, 59), '09:00', '14:00'), true);
  });
  test('sin ventana no hay nada que avisar', () => {
    assert.equal(outsideWindow(new Date(2026, 10, 4, 15, 0), null, null), false);
    assert.equal(outsideWindow(null, '09:00', '14:00'), false);
  });
});

describe('avisos de flota', () => {
  test('más peso del que aguanta el vehículo', () => {
    const warnings = fleetWarnings({ loadKg: 500, capacityKg: 10, otherRoutes: [] });
    assert.deepEqual(warnings, [{ kind: 'over_capacity', loadKg: 500, capacityKg: 10 }]);
  });
  test('sin capacidad indicada no se avisa', () => {
    assert.deepEqual(fleetWarnings({ loadKg: 500, capacityKg: null, otherRoutes: [] }), []);
  });
  test('el mismo conductor en otra ruta ese día', () => {
    const warnings = fleetWarnings({ loadKg: 0, capacityKg: null, otherRoutes: ['RT-1'] });
    assert.deepEqual(warnings, [{ kind: 'driver_busy', routes: ['RT-1'] }]);
  });
});
