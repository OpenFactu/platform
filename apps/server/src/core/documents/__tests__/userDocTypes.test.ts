/**
 * Tipos de documento en plantillas y PDF: los del registro (SQ incluido) y los de
 * las tablas propias, y la cantidad de las líneas en todos ellos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTableColumns } from 'drizzle-orm';
import { PdfHandlebars, getDefaultTemplate } from '@openfactu/pdf';
import '../registerDocumentTypes';
import { DocumentRegistry } from '../DocumentRegistry';
import { lineQuantity } from '../PdfPayloadBuilder';
import {
  UserDocTypes,
  formatFieldValue,
  isFieldVisibleInPdf,
  isTemplateDocType,
  isUserDocType,
} from '../UserDocTypes';
import { registerCanvasHelpers } from '../../../api/documentTemplates';

test('la cantidad se lee bien en las líneas de todos los tipos de documento', () => {
  const types = DocumentRegistry.getAll();
  assert.ok(types.length >= 7);
  for (const config of types) {
    const columns = getTableColumns(config.lineSchemaTable as any) as Record<string, any>;
    const key = Object.keys(columns).find((k) => columns[k].name === 'quantity');
    assert.ok(key, `${config.docType} no tiene columna de cantidad`);
    assert.equal(lineQuantity({ [key as string]: '7.5000' }), 7.5, config.docType);
  }
});

test('todos los tipos del registro admiten plantilla, también el presupuesto', async () => {
  assert.equal(await isTemplateDocType('t', 'SQ'), true);
  for (const config of DocumentRegistry.getAll()) {
    assert.equal(await isTemplateDocType('t', config.docType), true, config.docType);
  }
  assert.equal(await isTemplateDocType('t', 'FREE'), true);
  assert.equal(await isTemplateDocType('t', 'LABEL'), true);
  assert.equal(await isTemplateDocType('t', 'NOEXISTE'), false);
  assert.equal(await isTemplateDocType('t', undefined), false);
});

test('una tabla propia solo es tipo si es de documento y de esa empresa', async (t) => {
  t.mock.method(UserDocTypes, 'list', async (tenantId: string) =>
    tenantId === 'a' ? [{ docType: 'pt_contratos', label: 'Contratos', displayField: null }] : [],
  );
  assert.equal(await isTemplateDocType('a', 'pt_contratos'), true);
  assert.equal(await isTemplateDocType('b', 'pt_contratos'), false);
  assert.equal(await isTemplateDocType('a', 'pt_otra'), false);
});

test('un nombre con caracteres raros no pasa por tipo de tabla propia', () => {
  assert.equal(isUserDocType('pt_contratos_2026'), true);
  assert.equal(isUserDocType('SINV'), false);
  assert.equal(isUserDocType('pt_x" OR 1=1'), false);
  assert.equal(isUserDocType('pt_'), false);
  assert.equal(isUserDocType(null), false);
});

test('los helpers del diseñador quedan en el Handlebars con el que se renderiza', () => {
  registerCanvasHelpers();
  const render = PdfHandlebars.compile('{{sum lines "total"}}|{{count lines}}');
  assert.equal(render({ lines: [{ total: 2 }, { total: 3 }] }), '5|2');
});

test('los campos se imprimen formateados según su tipo', () => {
  const f = (fieldType: string, value: unknown, options?: unknown, currency?: string) =>
    formatFieldValue({ fieldType, options }, value, 'en', currency);
  assert.equal(f('TEXT', 'hola'), 'hola');
  assert.equal(f('TEXT', null), '');
  assert.equal(f('BOOLEAN', true), 'Yes');
  assert.equal(f('BOOLEAN', false), 'No');
  assert.equal(f('INTEGER', '1200'), '1,200');
  assert.equal(f('DECIMAL', '10.5000'), '10.5');
  assert.equal(f('PERCENT', 21), '21%');
  assert.equal(f('CURRENCY', 10, undefined, 'EUR'), '€10.00');
  assert.equal(f('CURRENCY', 10), '10.00');
  assert.equal(f('ENUM', 'a', [{ value: 'a', label: 'Alta' }]), 'Alta');
  assert.equal(f('ENUM', 'b', [{ value: 'a', label: 'Alta' }]), 'b');
  assert.equal(f('ENUM', 'a', ['a', 'b']), 'a');
  assert.equal(f('MULTISELECT', ['a', 'b'], [{ value: 'a', label: 'Alta' }]), 'Alta, b');
  assert.equal(f('MULTISELECT', '["a"]', [{ value: 'a', label: 'Alta' }]), 'Alta');
  assert.equal(f('JSONB', { a: 1 }), '{"a":1}');
  assert.equal(f('DATE', 'no es fecha'), 'no es fecha');
  // Una fecha sin hora no cambia de día con la zona horaria del servidor.
  assert.equal(f('DATE', '2026-11-02'), new Date(2026, 10, 2).toLocaleDateString('en-GB'));
});

test('sin indicar dónde se ve, un campo sale en el PDF', () => {
  assert.equal(isFieldVisibleInPdf({}), true);
  assert.equal(isFieldVisibleInPdf({ visibleIn: [] }), true);
  assert.equal(isFieldVisibleInPdf({ visibleIn: ['pdf', 'form'] }), true);
  assert.equal(isFieldVisibleInPdf({ visibleIn: ['form'] }), false);
});

test('la ficha es neutra, lleva su título y no tiene tercero, líneas ni totales', () => {
  const html = getDefaultTemplate('pt_contratos', { layout: 'record' });
  assert.match(html, /\{\{doc\.title\}\}/);
  assert.match(html, /\{\{#each doc\.fieldList\}\}/);
  assert.match(html, /"layout":"record"/);
  assert.match(html, /"style":"neutral"/);
  assert.doesNotMatch(html, /partner\.name/);
  assert.doesNotMatch(html, /#each lines/);
  assert.doesNotMatch(html, /doc\.total/);
});

test('el documento comercial solo añade la columna de descuento si hay descuentos', () => {
  const html = getDefaultTemplate('SO');
  assert.match(html, /\{\{#if hasDiscounts\}\}<th[^>]*>\{\{label "col\.discount"\}\}/);
  assert.match(html, /\{\{#if @root\.hasDiscounts\}\}<td/);
  assert.match(html, /partner\.name/);
});
