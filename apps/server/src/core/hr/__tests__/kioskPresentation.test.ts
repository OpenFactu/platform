import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKioskAppearance } from '../kioskAppearance';
import { publishKioskFeedback, getKioskFeedback } from '../kioskFeedback';

test('kiosk appearance validates colors, plain text, local raster images and size', () => {
  const defaults = parseKioskAppearance({});
  assert.equal(defaults.backgroundColor, '#020617');
  assert.equal(defaults.welcomeMessage, 'Acerca tu tarjeta');
  assert.equal(
    parseKioskAppearance({ welcomeMessage: '  Bienvenido  ' }).welcomeMessage,
    'Bienvenido',
  );
  for (const value of [
    null,
    [],
    { backgroundColor: 'url(secret)' },
    { welcomeMessage: 'x'.repeat(121) },
    { logoImage: 'https://outside.example/logo.png' },
    { logoImage: 'data:image/svg+xml;base64,AAAA' },
    { backgroundImage: 'data:image/png;base64,' + 'A'.repeat(400000) },
    { soundEnabled: 'yes' },
  ]) {
    assert.throws(() => parseKioskAppearance(value));
  }
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1sAAAAASUVORK5CYII=';
  assert.equal(parseKioskAppearance({ logoImage: png }).logoImage, png);
  assert.throws(() => parseKioskAppearance({ logoImage: 'data:image/png;base64,SGVsbG8=' }));
});

test('reader errors are isolated by tenant and kiosk, expire and deduplicate retries', () => {
  const event = { id: 'attempt-1', code: 'CREDENTIAL_NOT_RECOGNIZED' };
  publishKioskFeedback('tenant-a', 'kiosk-a', event, 1000);
  assert.equal(getKioskFeedback('tenant-a', 'kiosk-a', 2000)?.id, event.id);
  assert.equal(getKioskFeedback('tenant-b', 'kiosk-a', 2000), null);
  assert.equal(getKioskFeedback('tenant-a', 'kiosk-b', 2000), null);
  publishKioskFeedback('tenant-a', 'kiosk-a', event, 9000);
  assert.equal(getKioskFeedback('tenant-a', 'kiosk-a', 11001), null);
  publishKioskFeedback(
    'tenant-a',
    'kiosk-a',
    { id: 'attempt-2', code: 'UNTRUSTED_MESSAGE' },
    11002,
  );
  assert.equal(getKioskFeedback('tenant-a', 'kiosk-a', 11003), null);
});
