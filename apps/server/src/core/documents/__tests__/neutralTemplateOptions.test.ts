import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildVisualTemplate, NEUTRAL_VISUAL_OPTIONS, type VisualOptions } from '@openfactu/pdf';

/** Lo que pinta la plantilla, sin el comentario que guarda las opciones. */
function page(options: Partial<VisualOptions> = {}): string {
  return buildVisualTemplate('SINV', { ...NEUTRAL_VISUAL_OPTIONS, ...options }).replace(
    /<!--OPENFACTU-META:.*?-->/s,
    '',
  );
}

test('la estándar sin tocar sigue siendo solo negro sobre blanco', () => {
  const colors = page().match(/#[0-9a-f]{3,8}\b/gi) ?? [];
  assert.ok(colors.length > 0);
  for (const color of colors) {
    assert.match(color.toLowerCase(), /^#(0{3}|0{6}|f{3})$/, `color inesperado: ${color}`);
  }
});

for (const key of ['accentColor', 'headerBgColor', 'textColor', 'mutedColor'] as const) {
  test(`${key} del formulario llega a la plantilla estándar`, () => {
    assert.ok(page({ [key]: '#ff0001' }).includes('#ff0001'));
  });
}

test('el color primario se ve en el título del documento', () => {
  assert.match(page({ accentColor: '#ff0001' }), /\.doc-info \.tag \{[^}]*color: #ff0001/);
});

test('el logo solo va en grises mientras el documento no tenga color', () => {
  assert.ok(page().includes('grayscale'));
  assert.ok(!page({ accentColor: '#ff0001' }).includes('grayscale'));
});

test('la fuente elegida llega a la plantilla estándar', () => {
  assert.notEqual(page({ fontFamily: 'serif' }), page({ fontFamily: 'sans' }));
  assert.notEqual(page({ fontFamily: 'mono' }), page({ fontFamily: 'sans' }));
  // Sin descargas: el formato estándar no depende de fuentes externas.
  assert.ok(!page({ fontFamily: 'mono' }).includes('fonts.googleapis.com'));
});

test('el mensaje y la fecha del pie llegan a la plantilla estándar', () => {
  const footer = NEUTRAL_VISUAL_OPTIONS.footer;
  assert.ok(!page().includes('{{generatedAt}}'));
  assert.ok(page({ footer: { ...footer, text: 'Gracias' } }).includes('Gracias'));
  assert.ok(page({ footer: { ...footer, showGeneratedAt: true } }).includes('{{generatedAt}}'));
});

test('la posición del logo tiene efecto en la plantilla estándar', () => {
  assert.match(page({ logoPosition: 'center' }), /\.page-header\.logo-center \{/);
  assert.match(page({ logoPosition: 'right' }), /\.page-header\.logo-right \{/);
});
