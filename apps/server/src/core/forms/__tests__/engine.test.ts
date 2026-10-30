import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  OTHER,
  assertValidDefinition,
  gradeResponse,
  normalizeDefinition,
  otherKey,
  summarize,
  validateAnswers,
  visitedPath,
  type FormDefinition,
} from '../engine';

// Encuesta con salto: si no es cliente, salta a «Despedida» sin pasar por «Valoración».
const def: FormDefinition = {
  version: 2,
  sections: [
    {
      id: 's1',
      items: [
        {
          kind: 'question',
          id: 'cliente',
          type: 'radio',
          title: '¿Eres cliente?',
          required: true,
          options: [
            { id: 'si', label: 'Sí' },
            { id: 'no', label: 'No' },
          ],
          goTo: { no: 's3' },
        },
        {
          kind: 'question',
          id: 'desde',
          type: 'shortText',
          title: '¿Desde cuándo?',
          required: true,
          showIf: { questionId: 'cliente', op: 'equals', value: 'si' },
        },
      ],
    },
    {
      id: 's2',
      items: [
        {
          kind: 'question',
          id: 'nps',
          type: 'scale',
          title: 'NPS',
          required: true,
          scale: { min: 0, max: 10 },
        },
        {
          kind: 'question',
          id: 'canal',
          type: 'checkbox',
          title: 'Canal',
          hasOther: true,
          options: [
            { id: 'web', label: 'Web' },
            { id: 'tel', label: 'Teléfono' },
          ],
        },
      ],
    },
    {
      id: 's3',
      items: [
        {
          kind: 'question',
          id: 'grid',
          type: 'gridRadio',
          title: 'Valora',
          required: true,
          rows: [
            { id: 'r1', label: 'Precio' },
            { id: 'r2', label: 'Trato' },
          ],
          columns: [
            { id: 'b', label: 'Bien' },
            { id: 'm', label: 'Mal' },
          ],
        },
      ],
    },
  ],
};

describe('recorrido', () => {
  test('el salto se aplica y la sección saltada no se visita', () => {
    assert.deepEqual(visitedPath(def, { cliente: 'no' }), ['s1', 's3']);
    assert.deepEqual(visitedPath(def, { cliente: 'si' }), ['s1', 's2', 's3']);
  });
  test('no entra en bucles aunque una sección salte hacia atrás', () => {
    const loop: FormDefinition = {
      version: 2,
      sections: [
        { id: 'a', items: [], next: 'b' },
        { id: 'b', items: [], next: 'a' },
      ],
    };
    assert.deepEqual(visitedPath(loop, {}), ['a', 'b']);
  });
});

describe('validateAnswers', () => {
  test('lo que queda fuera del camino o es invisible no se valida ni se guarda', () => {
    const { answers, errors } = validateAnswers(def, {
      cliente: 'no',
      desde: 'ignorado',
      nps: 99,
      grid: { r1: 'b', r2: 'm' },
    });
    assert.deepEqual(errors, {});
    assert.deepEqual(Object.keys(answers).sort(), ['cliente', 'grid']);
  });
  test('condicional obligatoria visible, cuadrícula incompleta y «Otro» vacío dan error', () => {
    const { errors } = validateAnswers(def, {
      cliente: 'si',
      nps: 8,
      canal: ['web', OTHER],
      grid: { r1: 'b' },
    });
    assert.deepEqual(Object.keys(errors).sort(), ['canal', 'desde', 'grid']);
  });
  test('«Otro» guarda su texto aparte', () => {
    const { answers, errors } = validateAnswers(def, {
      cliente: 'si',
      desde: '2020',
      nps: 10,
      canal: [OTHER],
      [otherKey('canal')]: 'Feria',
      grid: { r1: 'b', r2: 'b' },
    });
    assert.deepEqual(errors, {});
    assert.equal(answers[otherKey('canal')], 'Feria');
  });
});

describe('cuestionario', () => {
  const quiz: FormDefinition = {
    version: 2,
    sections: [
      {
        id: 's',
        items: [
          {
            kind: 'question',
            id: 'capital',
            type: 'radio',
            title: 'Capital',
            options: [
              { id: 'm', label: 'Madrid' },
              { id: 'b', label: 'Barcelona' },
            ],
            quiz: { points: 2, correct: ['m'] },
          },
          {
            kind: 'question',
            id: 'primos',
            type: 'checkbox',
            title: 'Primos',
            options: [
              { id: '2', label: '2' },
              { id: '4', label: '4' },
              { id: '5', label: '5' },
            ],
            quiz: { points: 1, correct: ['2', '5'] },
          },
          {
            kind: 'question',
            id: 'rio',
            type: 'shortText',
            title: 'Río',
            quiz: { points: 1, correct: ['Ebro'] },
          },
          {
            kind: 'question',
            id: 'ensayo',
            type: 'paragraph',
            title: 'Ensayo',
            quiz: { points: 3 },
          },
        ],
      },
    ],
  };
  test('corrige solo lo corregible y deja pendiente el párrafo', () => {
    const g = gradeResponse(quiz, {
      capital: 'm',
      primos: ['2', '4'],
      rio: ' ebro ',
      ensayo: 'texto',
    });
    assert.equal(g.score, 3);
    assert.equal(g.maxScore, 7);
    assert.equal(g.pending, true);
    assert.equal(g.questions.primos.correct, false);
  });
  test('la corrección manual completa la nota', () => {
    const g = gradeResponse(quiz, { capital: 'b', ensayo: 'texto' }, { ensayo: 2 });
    assert.equal(g.score, 2);
    assert.equal(g.pending, false);
  });
});

describe('normalizeDefinition (v1)', () => {
  test('la lista plana pasa a una sección y las opciones conservan su texto como id', () => {
    const d = normalizeDefinition(null, [
      { id: 'n', type: 'text', label: 'Nombre', required: true, mapTo: 'prospectName' },
      { id: 'i', type: 'checkbox', label: 'Interés', options: ['ERP', 'CRM'] },
      { id: 'p', type: 'nps', label: 'NPS' },
      { id: 't', type: 'section', label: 'Más' },
    ]);
    assertValidDefinition(d);
    const items = d.sections[0].items as any[];
    assert.equal(items[0].type, 'shortText');
    assert.deepEqual(items[1].options, [
      { id: 'ERP', label: 'ERP' },
      { id: 'CRM', label: 'CRM' },
    ]);
    assert.equal(items[2].scale.max, 10);
    assert.equal(items[3].kind, 'text');
    // Una respuesta antigua (por texto) sigue siendo válida.
    assert.deepEqual(validateAnswers(d, { n: 'Ana', i: ['CRM'] }).errors, {});
  });
});

describe('summarize', () => {
  test('NPS, «Otro» y cuadrícula', () => {
    const s = summarize(def, [
      {
        answers: {
          nps: 10,
          canal: ['web', OTHER],
          [otherKey('canal')]: 'Feria',
          grid: { r1: 'b', r2: 'm' },
        },
      },
      { answers: { nps: 3, canal: ['web'], grid: { r1: 'b', r2: 'b' } } },
    ]);
    const by = Object.fromEntries(s.map((x) => [x.questionId, x]));
    assert.equal(by.nps.nps, 0);
    assert.deepEqual(
      by.canal.counts!.map((c) => [c.label, c.count]),
      [
        ['Web', 2],
        ['Teléfono', 0],
        ['Otro', 1],
      ],
    );
    assert.deepEqual(by.canal.texts, ['Feria']);
    assert.deepEqual(
      by.grid.grid![0].cells.map((c) => c.count),
      [2, 0],
    );
  });
});
