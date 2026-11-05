import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplatePieces } from '../templatePieces';

const payload = {
  locale: 'es',
  currency: 'EUR',
  doc: { docCode: 'FA-1', total: 12345.5, taxBreakdown: [{ rate: 21, tax: 21, name: 'IVA' }] },
  partner: { name: 'Ana & Co' },
  lines: [{ itemName: 'Llave' }, { itemName: 'Tuerca' }],
};

test('un trozo se resuelve con los mismos helpers que el PDF', () => {
  const [html] = renderTemplatePieces(['<b>{{formatCurrency doc.total}}</b>'], payload);
  assert.match(html as string, /12\.345,50/);
});

test('los valores se escapan igual que en el PDF', () => {
  const [html] = renderTemplatePieces(['{{partner.name}}'], payload);
  assert.equal(html, 'Ana &amp; Co');
});

test('lo que no tiene valor queda vacío, sin enseñar la expresión', () => {
  const [html] = renderTemplatePieces(['ORIGEN: {{doc.baseDocCode}}'], payload);
  assert.equal(html, 'ORIGEN: ');
});

test('los bucles recorren todas las líneas', () => {
  const [html] = renderTemplatePieces(['{{#each lines}}<i>{{itemName}}</i>{{/each}}'], payload);
  assert.equal(html, '<i>Llave</i><i>Tuerca</i>');
});

test('los códigos de barras salen de verdad', () => {
  const [html] = renderTemplatePieces(
    ['<img src="{{{barcode doc.docCode symbology="code128" includeText=true}}}" />'],
    payload,
  );
  assert.match(html as string, /src="data:image\/svg\+xml;base64,/);
});

test('un trozo que no compila no se lleva por delante a los demás', () => {
  const html = renderTemplatePieces(
    ['{{#if}', '{{helperQueNoExiste doc.total 1}}', 'bien'],
    payload,
  );
  assert.deepEqual(html, [null, null, 'bien']);
});
