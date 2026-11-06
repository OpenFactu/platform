import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { guessMapping, normalizeRows, scoreCandidate, withFingerprints } from '../statementLines';

describe('qué columna es cada cosa', () => {
  test('reconoce las cabeceras habituales', () => {
    assert.deepEqual(
      guessMapping(['Fecha', 'F. Valor', 'Concepto', 'Referencia', 'Importe', 'Saldo']),
      {
        date: 'Fecha',
        valueDate: 'F. Valor',
        description: 'Concepto',
        reference: 'Referencia',
        amount: 'Importe',
        balance: 'Saldo',
      },
    );
    assert.deepEqual(guessMapping(['Date', 'Details', 'Debit', 'Credit']), {
      date: 'Date',
      description: 'Details',
      debit: 'Debit',
      credit: 'Credit',
    });
  });

  test('lo que no reconoce se queda sin poner', () => {
    assert.deepEqual(guessMapping(['Columna 1', 'Columna 2']), {});
  });
});

describe('las filas del extracto', () => {
  const mapping = { date: 'Fecha', amount: 'Importe', description: 'Concepto' };

  test('entiende fechas y números de cualquier banco', () => {
    const { lines, rejected } = normalizeRows(
      [
        { Fecha: '15/06/2026', Importe: '1.234,56', Concepto: ' Transferencia ' },
        { Fecha: '2026-06-16', Importe: '-1,234.56', Concepto: 'Recibo' },
        { Fecha: '17-06-26', Importe: '12,50-', Concepto: 'Comisión' },
        { Fecha: '18/06/2026', Importe: '(5,00)', Concepto: 'Otra' },
      ],
      mapping,
    );
    assert.deepEqual(rejected, []);
    assert.deepEqual(
      lines.map((line) => [line.date, line.amount, line.description]),
      [
        ['2026-06-15', 1234.56, 'Transferencia'],
        ['2026-06-16', -1234.56, 'Recibo'],
        ['2026-06-17', -12.5, 'Comisión'],
        ['2026-06-18', -5, 'Otra'],
      ],
    );
  });

  test('con cargo y abono en columnas, el cargo sale en negativo', () => {
    const { lines } = normalizeRows(
      [
        { Fecha: '15/06/2026', Cargo: '10,00', Abono: '' },
        { Fecha: '16/06/2026', Cargo: '', Abono: '20,00' },
      ],
      { date: 'Fecha', debit: 'Cargo', credit: 'Abono' },
    );
    assert.deepEqual(
      lines.map((line) => line.amount),
      [-10, 20],
    );
  });

  test('una fila vacía se salta; una mala se dice cuál y por qué', () => {
    const { lines, rejected } = normalizeRows(
      [
        { Fecha: '', Importe: '', Concepto: '' },
        { Fecha: 'ayer', Importe: '5', Concepto: 'x' },
        { Fecha: '15/06/2026', Importe: 'mucho', Concepto: 'y' },
        { Fecha: '15/06/2026', Importe: '0', Concepto: 'z' },
      ],
      mapping,
    );
    assert.deepEqual(lines, []);
    assert.deepEqual(
      rejected.map((row) => row.row),
      [3, 4, 5],
    );
    assert.match(rejected[0].reason, /fecha/i);
    assert.match(rejected[1].reason, /importe/i);
    assert.match(rejected[2].reason, /cero/i);
  });
});

describe('cada movimiento una vez', () => {
  const line = (amount: number, description = 'Recibo') => ({
    date: '2026-06-15',
    valueDate: null,
    amount,
    description,
    reference: null,
    counterparty: null,
    balance: null,
  });

  test('el mismo fichero da las mismas huellas', () => {
    const a = withFingerprints([line(10), line(20)]);
    const b = withFingerprints([line(10), line(20)]);
    assert.deepEqual(
      a.map((x) => x.fingerprint),
      b.map((x) => x.fingerprint),
    );
    assert.notEqual(a[0].fingerprint, a[1].fingerprint);
  });

  test('dos movimientos iguales del mismo día son dos', () => {
    const [first, second] = withFingerprints([line(10), line(10)]);
    assert.notEqual(first.fingerprint, second.fingerprint);
  });

  test('mayúsculas y espacios no cambian la huella', () => {
    const [a] = withFingerprints([line(10, 'Recibo  LUZ')]);
    const [b] = withFingerprints([line(10, 'recibo luz')]);
    assert.equal(a.fingerprint, b.fingerprint);
  });
});

describe('qué se parece a un movimiento', () => {
  const movement = {
    date: '2026-06-15',
    amount: 121,
    description: 'TRANSFERENCIA ACME SL FACTURA FA-2026-000012',
    reference: null,
    counterparty: null,
  };

  test('importe, referencia, interlocutor y fecha suman', () => {
    const all = scoreCandidate(movement, {
      amount: 121,
      date: '2026-06-14',
      partnerName: 'Acme SL',
      codes: ['FA-2026-000012'],
    });
    assert.deepEqual(all.reasons, ['amount', 'reference', 'partner', 'date']);
    const none = scoreCandidate(movement, {
      amount: 50,
      date: '2026-01-01',
      partnerName: 'Otra empresa',
      codes: ['FA-2026-000099'],
    });
    assert.deepEqual(none.reasons, []);
    assert.equal(none.score, 0);
    assert.ok(all.score > 0);
  });

  test('el importe exacto pesa más que una fecha cercana', () => {
    const byAmount = scoreCandidate(movement, { amount: 121, date: '2026-01-01', codes: [] });
    const byDate = scoreCandidate(movement, { amount: 50, date: '2026-06-15', codes: [] });
    assert.ok(byAmount.score > byDate.score);
  });

  const partnerOf = (description: string, partnerName: string) =>
    scoreCandidate(
      { ...movement, description },
      { amount: 50, date: '2026-01-01', partnerName, codes: [] },
    ).reasons.includes('partner');

  test('una palabra común no basta para decir que es ese interlocutor', () => {
    assert.equal(partnerOf('Transferencia Cliente Banco', 'Cliente de Prueba'), false);
    assert.equal(partnerOf('Pago de Talleres del Norte', 'Talleres Martínez López'), false);
  });

  test('con su nombre, o casi todo, sí', () => {
    assert.equal(partnerOf('TRANSFERENCIA ACME SL', 'Acme SL'), true);
    assert.equal(partnerOf('Pago Cliente de Prueba', 'Cliente de Prueba'), true);
    assert.equal(partnerOf('TRF TALLERES MARTINEZ', 'Talleres Martínez López'), true);
  });

  test('los acentos no cambian nada', () => {
    assert.equal(partnerOf('RECIBO COMPAÑIA ELECTRICA', 'Compañía Eléctrica'), true);
  });

  test('el banco puede escribir el número de factura sin separadores', () => {
    const result = scoreCandidate(
      { ...movement, description: 'ABONO FACTURA FA2026000012' },
      { amount: 50, date: '2026-01-01', codes: ['FA-2026-000012'] },
    );
    assert.ok(result.reasons.includes('reference'));
  });

  test('una palabra corta del nombre no cuenta como interlocutor', () => {
    const result = scoreCandidate(
      { ...movement, description: 'SL TRANSFERENCIA' },
      { amount: 50, date: '2026-01-01', partnerName: 'Otra SL', codes: [] },
    );
    assert.ok(!result.reasons.includes('partner'));
  });

  test('un número corto de factura no se confunde con otra cifra', () => {
    const result = scoreCandidate(
      { ...movement, description: 'RECIBO 1234' },
      { amount: 50, date: '2026-01-01', codes: ['12'] },
    );
    assert.ok(!result.reasons.includes('reference'));
  });
});
