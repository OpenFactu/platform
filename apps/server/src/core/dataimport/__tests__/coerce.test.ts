import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { coerceValue } from '../coerce';
import type { ImportFieldDef } from '../ImportRegistry';

const field = (over: Partial<ImportFieldDef>): ImportFieldDef => ({
  key: 'x',
  label: 'Campo',
  type: 'string',
  ...over,
});

describe('coerceValue · números', () => {
  const num = field({ type: 'number' });

  test('formato español: el punto separa millares y la coma decimales', () => {
    assert.equal(coerceValue(num, '1.234,56').value, 1234.56);
    assert.equal(coerceValue(num, '1.234.567,89').value, 1234567.89);
  });

  test('formato inglés: manda el separador que va más a la derecha', () => {
    assert.equal(coerceValue(num, '1,234.56').value, 1234.56);
  });

  test('un solo punto con tres decimales exactos son millares, no decimales', () => {
    // "1.234" en un Excel español es mil doscientos treinta y cuatro.
    assert.equal(coerceValue(num, '1.234').value, 1234);
  });

  test('un solo punto que no agrupa de tres en tres es decimal', () => {
    assert.equal(coerceValue(num, '12.5').value, 12.5);
  });

  test('una sola coma siempre es decimal', () => {
    assert.equal(coerceValue(num, '12,5').value, 12.5);
  });

  test('quita el símbolo de moneda, el porcentaje y los espacios', () => {
    assert.equal(coerceValue(num, ' 1.500,00 € ').value, 1500);
    assert.equal(coerceValue(num, '21%').value, 21);
  });

  test('los paréntesis son negativo, como en contabilidad', () => {
    assert.equal(coerceValue(num, '(250,50)').value, -250.5);
  });

  test('un número que ya viene como número pasa tal cual', () => {
    assert.equal(coerceValue(num, 42.5).value, 42.5);
  });

  test('lo que no es un número da un error legible', () => {
    const r = coerceValue(num, 'doce euros');
    assert.equal(r.value, null);
    assert.match(r.error!, /no es un número/);
  });
});

describe('coerceValue · fechas', () => {
  const date = field({ type: 'date' });

  test('dd/mm/aaaa', () => {
    assert.equal(coerceValue(date, '05/03/2026').value, '2026-03-05');
  });

  test('dd-mm-aaaa y dd.mm.aaaa', () => {
    assert.equal(coerceValue(date, '05-03-2026').value, '2026-03-05');
    assert.equal(coerceValue(date, '05.03.2026').value, '2026-03-05');
  });

  test('año de dos cifras: 26 es 2026, 85 es 1985', () => {
    assert.equal(coerceValue(date, '05/03/26').value, '2026-03-05');
    assert.equal(coerceValue(date, '05/03/85').value, '1985-03-05');
  });

  test('ISO se respeta', () => {
    assert.equal(coerceValue(date, '2026-03-05').value, '2026-03-05');
  });

  test('un Date de Excel (cellDates) no se desplaza de día', () => {
    assert.equal(coerceValue(date, new Date(2026, 2, 5)).value, '2026-03-05');
  });

  test('el número de serie de Excel se convierte', () => {
    // 45000 = 2023-03-15 en el calendario de Excel.
    assert.equal(coerceValue(date, 45000).value, '2023-03-15');
  });

  test('un mes 13 no cuela', () => {
    assert.ok(coerceValue(date, '05/13/2026').error);
  });

  test('texto que no es fecha da error con la pista del formato', () => {
    assert.match(coerceValue(date, 'el martes').error!, /dd\/mm\/aaaa/);
  });
});

describe('coerceValue · booleanos', () => {
  const bool = field({ type: 'boolean' });

  test('las formas de decir que sí', () => {
    for (const v of ['Sí', 'si', 'SI', 'X', '1', 'true', 'Verdadero']) {
      assert.equal(coerceValue(bool, v).value, true, `"${v}" debería ser true`);
    }
  });

  test('las formas de decir que no', () => {
    for (const v of ['No', 'n', '0', 'false', 'Falso']) {
      assert.equal(coerceValue(bool, v).value, false, `"${v}" debería ser false`);
    }
  });

  test('lo ambiguo se rechaza en vez de adivinar', () => {
    assert.ok(coerceValue(bool, 'quizás').error);
  });
});

describe('coerceValue · enumerados y vacíos', () => {
  test('el enum no distingue mayúsculas pero devuelve el valor canónico', () => {
    const f = field({ type: 'enum', enumValues: ['activo', 'inactivo'] });
    assert.equal(coerceValue(f, 'ACTIVO').value, 'activo');
  });

  test('un valor fuera del enum lista los admitidos en el error', () => {
    const f = field({ type: 'enum', enumValues: ['activo', 'inactivo'] });
    assert.match(coerceValue(f, 'pendiente').error!, /activo, inactivo/);
  });

  test('una celda vacía es null, no un error', () => {
    for (const empty of [null, undefined, '', '   ']) {
      const r = coerceValue(field({ type: 'number' }), empty);
      assert.equal(r.value, null);
      assert.equal(r.error, undefined);
    }
  });

  test('el texto se recorta', () => {
    assert.equal(coerceValue(field({}), '  Ferretería  ').value, 'Ferretería');
  });
});
