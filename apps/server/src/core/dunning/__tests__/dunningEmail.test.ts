import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDunningLetter, type LetterInput } from '../dunningEmail';

const input = (extra: Partial<LetterInput> = {}): LetterInput => ({
  locale: 'es',
  level: 1,
  company: 'Mi Empresa',
  partner: 'Cliente',
  currency: 'EUR',
  total: 121,
  invoices: [{ code: 'FA-1', dueDate: '2026-03-01', days: 40, amount: 121 }],
  ...extra,
});

describe('la carta de reclamación', () => {
  test('el texto de fábrica sube de tono con el nivel', () => {
    const subjects = [1, 2, 3].map((level) => renderDunningLetter(input({ level })).subject);
    assert.equal(subjects[0], 'Facturas pendientes de Mi Empresa');
    assert.match(subjects[1], /^Segundo aviso/);
    assert.match(subjects[2], /^Último aviso/);
  });

  test('con más niveles que textos de fábrica se repite el último', () => {
    assert.match(renderDunningLetter(input({ level: 7 })).subject, /^Último aviso/);
  });

  test('en inglés, si el cliente es de otro idioma', () => {
    const { subject, html, text } = renderDunningLetter(input({ locale: 'en' }));
    assert.equal(subject, 'Unpaid invoices from Mi Empresa');
    assert.match(html, /Hello Cliente,/);
    assert.match(html, /Outstanding/);
    assert.match(text, /€121\.00/);
    assert.doesNotMatch(html, /Según nuestras cuentas/);
  });

  test('lleva la lista de facturas y el total, con la moneda de la empresa', () => {
    const { html } = renderDunningLetter(
      input({
        currency: 'USD',
        locale: 'en',
        total: 30,
        invoices: [
          { code: 'FA-1', dueDate: '2026-03-01', days: 40, amount: 10 },
          { code: 'FA-2', dueDate: '2026-03-02', days: 39, amount: 20 },
        ],
      }),
    );
    assert.match(html, /FA-1/);
    assert.match(html, /FA-2/);
    assert.match(html, /US\$30\.00|\$30\.00/);
  });

  test('sin colores: es un aviso de dinero, no publicidad', () => {
    const { html } = renderDunningLetter(input());
    const colors = [...html.matchAll(/(?:color|background):\s*(#[0-9a-f]{3,6})/gi)].map(
      (m) => m[1],
    );
    assert.deepEqual([...new Set(colors)].sort(), ['#000000', '#ffffff']);
  });

  test('el texto de la empresa manda, con sus datos', () => {
    const { subject, html } = renderDunningLetter(
      input({
        template: {
          days: 7,
          subject: '{{company}} reclama a {{partner}}',
          body: 'Debes {{total}} desde hace {{days}} días.\n\nGracias.',
        },
      }),
    );
    assert.equal(subject, 'Mi Empresa reclama a Cliente');
    assert.match(html, /<p[^>]*>Debes [^<]*121[^<]* desde hace 40 días\.<\/p>/);
    assert.match(html, /<p[^>]*>Gracias\.<\/p>/);
  });

  test('un texto vacío de la empresa es el de fábrica', () => {
    const { subject } = renderDunningLetter(
      input({ template: { days: 7, subject: ' ', body: '' } }),
    );
    assert.equal(subject, 'Facturas pendientes de Mi Empresa');
  });

  test('nada de lo que llega puede meter HTML', () => {
    const { html } = renderDunningLetter(
      input({
        partner: '<script>alert(1)</script>',
        company: '<b>Empresa</b>',
        invoices: [{ code: '<i>FA</i>', dueDate: '2026-03-01', days: 40, amount: 121 }],
        template: { days: 7, subject: '', body: '<img src=x> {{partner}}' },
      }),
    );
    assert.doesNotMatch(html, /<script>/);
    assert.doesNotMatch(html, /<img/);
    assert.doesNotMatch(html, /<b>Empresa/);
    assert.doesNotMatch(html, /<i>FA/);
  });
});
