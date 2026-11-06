/**
 * Los correos al cliente, en su idioma: ninguna frase se queda en español cuando el
 * correo va en inglés, y los datos del envío nunca se cuelan como HTML.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { forgetPluginMessages, registerPluginMessages } from '../../../i18n';
import { SHIPMENT_EMAIL_STAGES, renderShipmentEmail } from '../shipmentEmails';

const sample = {
  code: 'ENV-2026-00001',
  trackUrl: 'https://empresa.test/track/abc',
  address: 'Gran Via 1',
  photoCid: 'pod-photo',
  signatureCid: 'pod-signature',
  recipientName: 'Ana Ruiz',
  podNotes: 'Porteria',
};
const KINDS = ['delivery', 'pickup_return'];

/** Los trozos de texto que se leen, sin etiquetas ni los datos del propio envío. */
function sentences(html: string): string[] {
  return html
    .replace(/<title>[\s\S]*?<\/title>/, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .split(/<[^>]+>/)
    .map((piece) => piece.replace(/&nbsp;/g, ' ').trim())
    .filter((piece) => /\p{L}{3,}/u.test(piece))
    .filter((piece) => !Object.values(sample).some((value) => piece === value));
}

describe('correos de un envío', () => {
  for (const kind of KINDS) {
    for (const stage of SHIPMENT_EMAIL_STAGES) {
      test(`${kind}/${stage}: en inglés no queda nada en español`, () => {
        const es = renderShipmentEmail(stage, kind, 'es', sample);
        const en = renderShipmentEmail(stage, kind, 'en', sample);

        assert.notEqual(en.subject, es.subject);
        const english = new Set(sentences(en.html));
        const untranslated = sentences(es.html).filter((piece) => english.has(piece));
        assert.deepEqual(untranslated, []);
        assert.equal(en.html.includes('alt="Firma"'), false);
        assert.equal(en.html.includes('alt="Foto"'), false);
      });

      test(`${kind}/${stage}: no quedan huecos sin rellenar`, () => {
        for (const locale of ['es', 'en']) {
          const { subject, html } = renderShipmentEmail(stage, kind, locale, sample);
          assert.doesNotMatch(subject, /\{\w+\}/);
          assert.doesNotMatch(html, /\{\w+\}/);
          assert.ok(subject.includes(sample.code));
        }
      });
    }
  }

  test('el correo dice en qué idioma está', () => {
    assert.match(renderShipmentEmail('pending', 'delivery', 'es', sample).html, /<html lang="es">/);
    assert.match(renderShipmentEmail('pending', 'delivery', 'en', sample).html, /<html lang="en">/);
  });

  test('en español sigue diciendo lo mismo', () => {
    const { subject, html } = renderShipmentEmail('postponed', 'delivery', 'es', sample);
    assert.ok(subject.includes('Entrega aplazada'));
    assert.ok(html.includes('Tu entrega se ha aplazado'));
    assert.ok(html.includes(`<b>${sample.address}</b>`));
  });

  test('una recogida habla de recoger, no de entregar', () => {
    const { html } = renderShipmentEmail('delivered', 'pickup_return', 'en', sample);
    assert.ok(html.includes('Package collected'));
    const fallback = renderShipmentEmail('exception', 'pickup_return', 'en', sample);
    assert.ok(fallback.html.includes('An issue has occurred'));
  });

  test('lo que escribe la gente no se cuela como HTML', () => {
    for (const locale of ['es', 'en']) {
      const { html } = renderShipmentEmail('delivered', 'delivery', locale, {
        ...sample,
        recipientName: '<script>x</script>',
        podNotes: '<img src=x>',
      });
      assert.equal(html.includes('<script>'), false);
      assert.equal(html.includes('<img src=x>'), false);
    }
  });

  test('un idioma de plugin sirve, y lo que le falte sale en inglés', () => {
    registerPluginMessages('prueba', 'fr', {
      'Tu pedido se está preparando': 'Votre commande est en préparation',
    });
    try {
      const { html } = renderShipmentEmail('picking', 'delivery', 'fr', sample);
      assert.match(html, /<html lang="fr">/);
      assert.ok(html.includes('Votre commande est en préparation'));
      assert.ok(html.includes('Our team is picking it right now.'));
    } finally {
      forgetPluginMessages('prueba');
    }
  });
});
