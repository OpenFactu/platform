import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LogisticsError,
  SHIPMENT_STATES,
  assertTransition,
  canTransition,
  canonicalState,
  isClosedState,
  isLiveStop,
  packageStatusAfter,
  resumeStateAfterIncident,
  stateOf,
} from '../shipmentLifecycle';

describe('ciclo de vida del envío', () => {
  test('el camino normal de un envío está permitido', () => {
    const path = [
      'pending',
      'picking',
      'packed',
      'ready',
      'dispatched',
      'in_transit',
      'out_for_delivery',
      'delivered',
      'returned',
    ] as const;
    for (let i = 0; i < path.length - 1; i++) {
      assert.ok(canTransition(path[i], path[i + 1]), `${path[i]} → ${path[i + 1]}`);
    }
  });

  test('una compra se recibe', () => {
    assert.ok(canTransition('pending', 'receiving'));
    assert.ok(canTransition('receiving', 'received'));
  });

  test('no se salta de nuevo a entregado', () => {
    assert.equal(canTransition('pending', 'delivered'), false);
    assert.equal(canTransition('ready', 'delivered'), false);
  });

  test('lo entregado no vuelve atrás', () => {
    for (const to of ['ready', 'dispatched', 'in_transit', 'exception', 'cancelled'] as const) {
      assert.equal(canTransition('delivered', to), false, to);
    }
  });

  test('una salida no se recibe', () => {
    assert.equal(canTransition('in_transit', 'received'), false);
    assert.equal(canTransition('pending', 'received'), false);
  });

  test('lo cancelado, devuelto o recibido se queda ahí', () => {
    for (const from of ['cancelled', 'returned', 'received'] as const) {
      for (const to of SHIPMENT_STATES) {
        assert.equal(canTransition(from, to), false, `${from} → ${to}`);
      }
    }
  });

  test('aplazado e incidencia se pueden reintentar', () => {
    assert.ok(canTransition('postponed', 'dispatched'));
    assert.ok(canTransition('postponed', 'ready'));
    assert.ok(canTransition('exception', 'dispatched'));
    assert.ok(canTransition('exception', 'ready'));
  });

  test('un estado inventado no llega a ningún sitio', () => {
    assert.equal(canTransition('pending', 'patata' as any), false);
    assert.equal(canTransition('patata' as any, 'pending'), false);
  });

  test('un salto prohibido da un error con su código y en palabras', () => {
    assert.throws(
      () => assertTransition('pending', 'delivered'),
      (e: any) => e instanceof LogisticsError && e.status === 409 && /pending/.test(e.message),
    );
    assert.doesNotThrow(() => assertTransition('ready', 'dispatched'));
  });

  test('qué está cerrado', () => {
    for (const s of ['delivered', 'received', 'returned', 'cancelled']) {
      assert.ok(isClosedState(s), s);
    }
    for (const s of ['pending', 'postponed', 'exception', 'in_transit']) {
      assert.equal(isClosedState(s), false, s);
    }
  });

  test('qué paradas siguen vivas', () => {
    for (const s of ['pending', 'en_route', 'arrived']) assert.ok(isLiveStop(s), s);
    for (const s of ['delivered', 'postponed', 'exception', 'cancelled']) {
      assert.equal(isLiveStop(s), false, s);
    }
  });
});

describe('de dos columnas a un solo estado', () => {
  const cases: Array<[string, string, string]> = [
    // preparationStatus, status, estado único
    ['draft', 'pending', 'pending'],
    ['picking', 'pending', 'picking'],
    ['packed', 'pending', 'packed'],
    ['ready', 'pending', 'ready'],
    ['dispatched', 'dispatched', 'dispatched'],
    ['in_transit', 'in_transit', 'in_transit'],
    ['out_for_delivery', 'out_for_delivery', 'out_for_delivery'],
    ['postponed', 'postponed', 'postponed'],
    ['delivered', 'delivered', 'delivered'],
    ['ready', 'delivered', 'delivered'],
    ['returned', 'delivered', 'returned'],
    ['cancelled', 'pending', 'cancelled'],
    ['receiving', 'pending', 'receiving'],
    ['received', 'pending', 'received'],
    ['received', 'delivered', 'received'],
    ['receiving', 'delivered', 'received'],
    ['in_transit', 'exception', 'exception'],
  ];
  for (const [prep, status, expected] of cases) {
    test(`${prep} / ${status} → ${expected}`, () => {
      assert.equal(canonicalState(prep, status), expected);
    });
  }

  test('lo inventado no gana a lo que se conoce', () => {
    assert.equal(canonicalState('draft', 'patata'), 'pending');
    assert.equal(canonicalState('patata', 'in_transit'), 'in_transit');
    assert.equal(canonicalState(null, null), 'pending');
  });

  test('stateOf lee un envío ya guardado', () => {
    assert.equal(stateOf({ preparationStatus: 'received', status: 'delivered' }), 'received');
    assert.equal(stateOf({ status: 'ready' }), 'ready');
  });
});

describe('los paquetes siguen a su envío', () => {
  test('salen con el reparto', () => {
    assert.equal(packageStatusAfter('in_transit', 'sealed'), 'shipped');
    assert.equal(packageStatusAfter('out_for_delivery', 'open'), 'shipped');
  });
  test('se entregan y se devuelven', () => {
    assert.equal(packageStatusAfter('delivered', 'shipped'), 'delivered');
    assert.equal(packageStatusAfter('delivered', 'sealed'), 'delivered');
    assert.equal(packageStatusAfter('returned', 'delivered'), 'returned');
  });
  test('un aplazado vuelve al almacén', () => {
    assert.equal(packageStatusAfter('postponed', 'shipped'), 'sealed');
    assert.equal(packageStatusAfter('postponed', 'open'), 'open');
  });
  test('cancelar en reparto los deja devueltos, y en el almacén no los toca', () => {
    assert.equal(packageStatusAfter('cancelled', 'shipped'), 'returned');
    assert.equal(packageStatusAfter('cancelled', 'sealed'), 'sealed');
  });
  test('el resto de etapas no los mueve', () => {
    assert.equal(packageStatusAfter('ready', 'sealed'), 'sealed');
    assert.equal(packageStatusAfter('dispatched', 'sealed'), 'sealed');
    assert.equal(packageStatusAfter('exception', 'shipped'), 'shipped');
  });
});

describe('volver de una incidencia', () => {
  test('sin parada viva, a preparado para volver a salir', () => {
    assert.equal(resumeStateAfterIncident(null, null), 'ready');
  });
  test('con parada en una ruta sin empezar, sigue despachado', () => {
    assert.equal(resumeStateAfterIncident('pending', 'planned'), 'dispatched');
  });
  test('con la ruta en marcha, vuelve al reparto', () => {
    assert.equal(resumeStateAfterIncident('pending', 'active'), 'in_transit');
    assert.equal(resumeStateAfterIncident('en_route', 'active'), 'out_for_delivery');
    assert.equal(resumeStateAfterIncident('arrived', 'active'), 'out_for_delivery');
  });
});
