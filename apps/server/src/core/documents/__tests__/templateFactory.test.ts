import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasDesignedElements, isFactoryTemplateEdit } from '../templateFactory';

const emptyLayout = { bands: [{ elements: [] }, { elements: [] }] };
const designedLayout = { bands: [{ elements: [] }, { elements: [{ id: 'a' }] }] };

test('un lienzo vacío no cuenta como diseño', () => {
  assert.equal(hasDesignedElements(null), false);
  assert.equal(hasDesignedElements(undefined), false);
  assert.equal(hasDesignedElements({}), false);
  assert.equal(hasDesignedElements(emptyLayout), false);
  assert.equal(hasDesignedElements(designedLayout), true);
});

test('cambiar el HTML de la estándar la saca de fábrica', () => {
  const existing = { isFactoryDefault: true, html: '<a>' };
  assert.equal(isFactoryTemplateEdit(existing, { html: '<b>' }), true);
  assert.equal(isFactoryTemplateEdit(existing, { canvasLayout: designedLayout }), true);
});

test('guardarla sin cambios o renombrarla no la saca de fábrica', () => {
  const existing = { isFactoryDefault: true, html: '<a>' };
  assert.equal(isFactoryTemplateEdit(existing, { html: '<a>' }), false);
  assert.equal(isFactoryTemplateEdit(existing, {}), false);
  assert.equal(isFactoryTemplateEdit(existing, { canvasLayout: emptyLayout }), false);
});

test('una plantilla que ya es de la empresa no cambia', () => {
  assert.equal(
    isFactoryTemplateEdit({ isFactoryDefault: false, html: '<a>' }, { html: '<b>' }),
    false,
  );
});
