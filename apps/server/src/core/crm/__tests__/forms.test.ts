import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFields, summarizeResponses, validateAnswers, type FormField } from '../forms';

const fields: FormField[] = [
  { id: 'nombre', type: 'text', label: 'Nombre', required: true },
  { id: 'correo', type: 'email', label: 'Correo' },
  { id: 'interes', type: 'checkbox', label: 'Interés', options: ['A', 'B', 'C'] },
  { id: 'nota', type: 'rating', label: 'Valoración' },
  { id: 'nps', type: 'nps', label: '¿Nos recomendarías?' },
  { id: 'titulo', type: 'section', label: 'Sección' },
];

describe('sanitizeFields', () => {
  test('exige opciones en los campos de elección', () => {
    assert.throws(() => sanitizeFields([{ type: 'select', label: 'X', options: [] }]), /opción/);
  });
  test('rechaza tipos desconocidos', () => {
    assert.throws(() => sanitizeFields([{ type: 'html', label: 'X' }]), /tipo no válido/);
  });
  test('una sección nunca es obligatoria y los ids repetidos se renuevan', () => {
    const out = sanitizeFields([
      { id: 'a', type: 'section', label: 'S', required: true },
      { id: 'a', type: 'text', label: 'T' },
    ]);
    assert.equal(out[0].required, undefined);
    assert.notEqual(out[0].id, out[1].id);
  });
});

describe('validateAnswers', () => {
  test('obligatorio vacío da error y lo ajeno se descarta', () => {
    const { answers, errors } = validateAnswers(fields, { correo: 'x@y.es', otro: 'nada' });
    assert.equal(errors.nombre, 'Obligatorio');
    assert.deepEqual(Object.keys(answers), ['correo']);
  });
  test('valida correo, rangos y opciones', () => {
    const { errors } = validateAnswers(fields, {
      nombre: 'Ana',
      correo: 'no-es-correo',
      interes: ['Z'],
      nota: 6,
      nps: 11,
    });
    assert.deepEqual(Object.keys(errors).sort(), ['correo', 'interes', 'nota', 'nps']);
  });
  test('normaliza casillas y números', () => {
    const { answers, errors } = validateAnswers(fields, {
      nombre: 'Ana',
      interes: ['A', 'A', 'C', 'Z'],
      nota: '4',
      nps: '10',
    });
    assert.deepEqual(errors, {});
    assert.deepEqual(answers.interes, ['A', 'C']);
    assert.equal(answers.nota, 4);
    assert.equal(answers.nps, 10);
  });
});

describe('summarizeResponses', () => {
  test('NPS = % promotores − % detractores', () => {
    const r = summarizeResponses(fields, [
      { answers: { nps: 10 } },
      { answers: { nps: 9 } },
      { answers: { nps: 7 } },
      { answers: { nps: 3 } },
    ]);
    const nps = r.find((x) => x.fieldId === 'nps')!;
    assert.equal(nps.nps, 25);
    assert.equal(nps.answered, 4);
    assert.equal(nps.counts!['10'], 1);
  });
  test('recuento de casillas y media de valoración', () => {
    const r = summarizeResponses(fields, [
      { answers: { interes: ['A', 'B'], nota: 4 } },
      { answers: { interes: ['A'], nota: 2 } },
    ]);
    assert.deepEqual(r.find((x) => x.fieldId === 'interes')!.counts, { A: 2, B: 1, C: 0 });
    assert.equal(r.find((x) => x.fieldId === 'nota')!.average, 3);
    assert.equal(
      r.some((x) => x.fieldId === 'titulo'),
      false,
    );
  });
});
