import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { automap, automapToMapping } from '../automap';
import type { ImportObjectConfig } from '../ImportRegistry';

/** Un objeto mínimo con los campos que más se mapean en la vida real. */
const config = {
  id: 'partner',
  label: 'Interlocutores',
  group: 'maestros',
  modulePath: '/partners',
  table: 'BusinessPartner',
  router: () => ({}) as any,
  createPath: '/',
  naturalKeys: [],
  fields: [
    { key: 'code', label: 'Código', type: 'string' },
    { key: 'name', label: 'Nombre o razón social', type: 'string' },
    { key: 'nif', label: 'NIF/CIF', type: 'string' },
    { key: 'email', label: 'Email', type: 'string' },
    { key: 'phone', label: 'Teléfono', type: 'string' },
    { key: 'city', label: 'Dirección · Ciudad', type: 'string' },
    { key: 'zipCode', label: 'Dirección · Código postal', type: 'string' },
  ],
} as unknown as ImportObjectConfig;

const mapOf = (headers: string[]) => automapToMapping(automap(config, headers));

describe('automap', () => {
  test('la cabecera igual a la plantilla se reconoce', () => {
    assert.deepEqual(mapOf(['Código', 'NIF/CIF']), { Código: 'code', 'NIF/CIF': 'nif' });
  });

  test('ignora acentos, mayúsculas y puntuación', () => {
    const m = mapOf(['CODIGO', 'n.i.f.', 'TELÉFONO']);
    assert.equal(m['CODIGO'], 'code');
    assert.equal(m['n.i.f.'], 'nif');
    assert.equal(m['TELÉFONO'], 'phone');
  });

  test('reconoce cómo llama la gente a las cosas en sus ficheros', () => {
    const m = mapOf(['Razón social', 'CIF', 'Correo electrónico', 'Móvil', 'C.P.']);
    assert.equal(m['Razón social'], 'name');
    assert.equal(m['CIF'], 'nif');
    assert.equal(m['Correo electrónico'], 'email');
    assert.equal(m['Móvil'], 'phone');
    assert.equal(m['C.P.'], 'zipCode');
  });

  test('un campo compuesto responde también por su última parte', () => {
    assert.equal(mapOf(['Ciudad'])['Ciudad'], 'city');
  });

  test('no asigna dos columnas al mismo campo', () => {
    const entries = automap(config, ['Código', 'Codigo']);
    const asignados = entries.filter((e) => e.field === 'code');
    assert.equal(asignados.length, 1);
  });

  test('una coincidencia exacta gana a una parcial de otra columna', () => {
    // "Nombre comercial" podría casar parcialmente con "Nombre o razón
    // social", pero "Razón social" es más exacto y debe quedarse el campo.
    const m = mapOf(['Nombre comercial', 'Razón social']);
    assert.equal(m['Razón social'], 'name');
  });

  test('una columna que no se reconoce se deja sin mapear, no se inventa', () => {
    const entries = automap(config, ['Descuento especial pactado 2019']);
    assert.equal(entries[0].field, null);
    assert.equal(entries[0].confidence, null);
  });

  test('cada propuesta dice de qué se fía', () => {
    const entries = automap(config, ['Código', 'CIF']);
    assert.equal(entries.find((e) => e.column === 'Código')!.confidence, 'exact');
    assert.equal(entries.find((e) => e.column === 'CIF')!.confidence, 'synonym');
  });

  test('devuelve una entrada por columna, en el orden del fichero', () => {
    const headers = ['Uno', 'Código', 'Dos'];
    assert.deepEqual(
      automap(config, headers).map((e) => e.column),
      headers,
    );
  });

  test('sin columnas no falla', () => {
    assert.deepEqual(automap(config, []), []);
  });
});
