import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseTabularFile, rowNumberOf } from '../fileParsing';

function csv(text: string, withBom = false): Buffer {
  return Buffer.from((withBom ? '﻿' : '') + text, 'utf8');
}

function xlsx(rows: any[][], sheetName = 'Hoja1'): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), sheetName);
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

describe('parseTabularFile · CSV', () => {
  test('reconoce el punto y coma, que es lo que exporta Excel en español', () => {
    const [sheet] = parseTabularFile(
      csv('Código;Nombre;Importe\nCLI-1;Ferretería Pérez;1.234,56'),
      'clientes.csv',
    );

    assert.deepEqual(sheet.headers, ['Código', 'Nombre', 'Importe']);
    assert.equal(sheet.rows.length, 1);
    assert.equal(sheet.rows[0]['Nombre'], 'Ferretería Pérez');
  });

  test('reconoce la coma', () => {
    const [sheet] = parseTabularFile(csv('code,name\nCLI-1,Pérez'), 'clientes.csv');
    assert.deepEqual(sheet.headers, ['code', 'name']);
    assert.equal(sheet.rows[0]['name'], 'Pérez');
  });

  test('reconoce el tabulador', () => {
    const [sheet] = parseTabularFile(csv('code\tname\nCLI-1\tPérez'), 'clientes.tsv');
    assert.deepEqual(sheet.headers, ['code', 'name']);
  });

  test('el BOM de Excel no se cuela en la primera cabecera', () => {
    const [sheet] = parseTabularFile(csv('Código;Nombre\nCLI-1;Pérez', true), 'clientes.csv');
    assert.equal(sheet.headers[0], 'Código');
  });

  test('respeta las comillas con el separador dentro', () => {
    const [sheet] = parseTabularFile(
      csv('code;name\nCLI-1;"Pérez; e Hijos, S.L."'),
      'clientes.csv',
    );
    assert.equal(sheet.rows[0]['name'], 'Pérez; e Hijos, S.L.');
  });
});

describe('parseTabularFile · cabeceras', () => {
  test('una columna sin nombre recibe uno posicional', () => {
    const [sheet] = parseTabularFile(
      xlsx([
        ['Código', null, 'Nombre'],
        ['A', 'x', 'B'],
      ]),
      'f.xlsx',
    );
    assert.deepEqual(sheet.headers, ['Código', 'Columna 2', 'Nombre']);
  });

  test('una cabecera repetida se numera en vez de pisarse', () => {
    const [sheet] = parseTabularFile(
      xlsx([
        ['Precio', 'Precio', 'Precio'],
        [1, 2, 3],
      ]),
      'f.xlsx',
    );

    assert.deepEqual(sheet.headers, ['Precio', 'Precio (2)', 'Precio (3)']);
    // Lo importante: no se pierde ningún valor.
    assert.equal(sheet.rows[0]['Precio'], 1);
    assert.equal(sheet.rows[0]['Precio (2)'], 2);
    assert.equal(sheet.rows[0]['Precio (3)'], 3);
  });

  test('las cabeceras se recortan', () => {
    const [sheet] = parseTabularFile(xlsx([['  Código  '], ['A']]), 'f.xlsx');
    assert.equal(sheet.headers[0], 'Código');
  });
});

describe('parseTabularFile · filas', () => {
  test('las filas en blanco intercaladas no cuentan como datos', () => {
    const [sheet] = parseTabularFile(xlsx([['code'], ['A'], [null], ['   '], ['B']]), 'f.xlsx');
    assert.equal(sheet.rows.length, 2);
  });

  test('conserva el número de fila real del fichero para los errores', () => {
    const [sheet] = parseTabularFile(xlsx([['code'], ['A'], [null], ['B']]), 'f.xlsx');
    // La cabecera es la 1, "A" la 2 y "B" la 4 aunque sea la segunda con datos.
    assert.equal(rowNumberOf(sheet.rows[0], 0), 2);
    assert.equal(rowNumberOf(sheet.rows[1], 1), 4);
  });

  test('una celda vacía llega como null, no como undefined', () => {
    const [sheet] = parseTabularFile(
      xlsx([
        ['a', 'b'],
        ['x', null],
      ]),
      'f.xlsx',
    );
    assert.equal(sheet.rows[0]['b'], null);
  });
});

describe('parseTabularFile · varias hojas', () => {
  test('devuelve todas las hojas del libro', () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['a'], [1]]), 'Cabeceras');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['b'], [2]]), 'Líneas');
    const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });

    const sheets = parseTabularFile(buffer, 'doc.xlsx');

    assert.equal(sheets.length, 2);
    assert.deepEqual(
      sheets.map((s) => s.name),
      ['Cabeceras', 'Líneas'],
    );
  });
});

describe('parseTabularFile · formatos', () => {
  test('un formato no soportado lo dice con la lista de los que sí', () => {
    assert.throws(() => parseTabularFile(Buffer.from(''), 'clientes.pdf'), /Admitidos/);
  });

  test('una hoja vacía no revienta, devuelve cero filas', () => {
    const [sheet] = parseTabularFile(xlsx([]), 'vacio.xlsx');
    assert.deepEqual(sheet.headers, []);
    assert.equal(sheet.rows.length, 0);
  });
});
