// Config de desarrollo HTTPS — solo se usa con:
//   npx vite --config vite.https.config.ts
// Lee cert/key autofirmados desde /tmp/vite-certs (generados con openssl).
// No tocar vite.config.ts — este archivo es solo para pruebas en LAN con
// móviles que necesitan origen seguro (cámara, geolocalización, etc.). Por eso
// lleva también la PWA activa: es donde se prueba a instalarla.

// Primero: activa la PWA (manifest + service worker) antes de cargar la base.
import './scripts/pwa-dev-env';
import { defineConfig } from 'vite';
import fs from 'node:fs';
import base from './vite.config';

const CERT_DIR = process.env.VITE_CERT_DIR || '/tmp/vite-certs';

export default defineConfig({
  ...(base as any),
  server: {
    ...((base as any).server || {}),
    host: '0.0.0.0',
    port: 5174,
    https: {
      key: fs.readFileSync(`${CERT_DIR}/key.pem`),
      cert: fs.readFileSync(`${CERT_DIR}/cert.pem`),
    },
  },
});
