import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA, type ManifestOptions } from 'vite-plugin-pwa';
import { collectShellScripts } from './scripts/pwa-shell.ts';

/**
 * Manifest de la PWA. Lo usa `VitePWA` en la build y `pwa-dev-manifest` en el
 * servidor de desarrollo (ver más abajo).
 */
const pwaManifest: Partial<ManifestOptions> = {
  id: '/',
  name: 'Keirost ERP',
  short_name: 'Keirost',
  description:
    'ERP en la nube para pymes y autónomos: facturación electrónica, contabilidad, compras, ventas e inventario.',
  // Mismo color que el meta theme-color oscuro de index.html y la baldosa del icono.
  theme_color: '#0A1628',
  // También es el fondo de la ventana de la app instalada: Android lo enseña mientras sube el teclado y en la franja
  // que queda encima. Claro, dejaba una raya blanca bajo el chat en modo oscuro.
  background_color: '#0A1628',
  display: 'standalone',
  // Sin `orientation`: bloquearla en vertical impedía usar la app instalada en
  // tablet o escritorio en horizontal.
  start_url: '/',
  scope: '/',
  lang: 'es-ES',
  categories: ['business', 'finance', 'productivity'],
  icons: [
    { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    // Maskable propio, a sangre y con la K dentro de la zona segura (círculo
    // del 80%): reutilizar el 512 hacía que Android recortara el logo.
    {
      src: '/icon-maskable-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
};

let shellScripts = new Set<string>();

/** Servidor de teselas propio, si se configura con `VITE_MAP_TILE_URL`. */
const mapTilesHost = (() => {
  try {
    return new URL(process.env.VITE_MAP_TILE_URL || '').hostname;
  } catch {
    return '';
  }
})();

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'pwa-shell-scripts',
      apply: 'build',
      generateBundle(_, bundle) {
        shellScripts = collectShellScripts(bundle);
      },
    },
    // En desarrollo el service worker va apagado (ver `devOptions` abajo) y, con
    // él, el plugin deja de servir el manifest: `/manifest.webmanifest` caía en
    // el fallback de la SPA y devolvía el HTML. El navegador lo veía como una web
    // cualquiera y no dejaba instalarla (p. ej. al probar desde el móvil por el
    // túnel). Aquí se sirve el mismo manifest; para instalar ya no hace falta
    // service worker.
    {
      name: 'pwa-dev-manifest',
      apply: 'serve',
      configureServer(server) {
        if (process.env.VITE_PWA_DEV === 'true') return; // ya lo sirve VitePWA
        server.middlewares.use('/manifest.webmanifest', (_req, res) => {
          res.setHeader('Content-Type', 'application/manifest+json');
          res.end(JSON.stringify(pwaManifest));
        });
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      // El service worker en dev cachea el propio bundle de la app (mismo
      // origen que la página) y Workbox no activa una versión nueva hasta
      // cerrar TODAS las pestañas — un simple refresco no alcanza, lo que
      // hace parecer "roto" cualquier fix mientras se itera. Por eso queda
      // apagado por default; activalo puntualmente con
      // `VITE_PWA_DEV=true npm run dev:web` para probar la instalación
      // desde el móvil sin tener que hacer `npm run build`.
      devOptions: { enabled: process.env.VITE_PWA_DEV === 'true', type: 'module' },
      includeAssets: [
        'favicon.svg',
        'favicon-16.png',
        'favicon-32.png',
        'apple-touch-icon.png',
        'logo.png',
        'brand/*.svg',
      ],
      manifest: pwaManifest,
      workbox: {
        // Las pantallas lazy se guardan al visitarlas. Precargar todo el JS
        // anularía la carga bajo demanda al instalar/actualizar la PWA.
        manifestTransforms: [
          async (entries) => ({
            manifest: entries.filter(
              (entry) =>
                !entry.url.endsWith('.js') ||
                entry.url === 'registerSW.js' ||
                shellScripts.has(entry.url),
            ),
            warnings: [],
          }),
        ],
        // Cachea la shell de la SPA y los assets. /api/ nunca se cachea —
        // siempre debe ir a red para datos frescos.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/track\//],
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith('/assets/') && url.pathname.endsWith('.js'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'page-code',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 3600 },
            },
          },
          {
            // Teselas de los mapas, con caché propia: como imágenes llenarían la general.
            urlPattern: ({ url }) =>
              url.hostname === 'tile.openstreetmap.org' ||
              url.hostname === 'server.arcgisonline.com' ||
              url.hostname === mapTilesHost,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 800, maxAgeSeconds: 7 * 24 * 3600 },
            },
          },
          {
            // Fuentes / imágenes externas.
            urlPattern: ({ request }) =>
              request.destination === 'font' || request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-assets',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 3600 },
            },
          },
        ],
      },
    }),
  ],
  // Con paquetes @openfactu/* linkados localmente (symlinks), cada uno trae
  // su propio react/react-dom en node_modules y React detecta varias copias
  // (rompe hooks). Forzamos una única copia resuelta desde la app.
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Motor de formularios: el mismo fichero que usa el servidor (sin dependencias).
      '@forms-engine': path.resolve(__dirname, '../server/src/core/forms/engine.ts'),
    },
  },
  server: {
    // Túnel rápido de Cloudflare (cloudflared tunnel --url …) para abrir el
    // entorno de desarrollo desde fuera, p. ej. los enlaces de formularios.
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // Webs públicas del módulo Website (assets del editor, "Ver web" en dev)
      '/site': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // Eventos en vivo del ERP (/ws/events). Sin esto la conexión se queda
      // colgada en el servidor de Vite, y el navegador encola detrás de ella
      // cualquier otro websocket al mismo host (el de mensajería incluido).
      '/ws': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
      // Mensajería (apps/messaging, servicio Rust): REST y websocket.
      '/rt': {
        target: 'http://localhost:3100',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  // Paquetes @openfactu/* se publican como CommonJS. Cuando están linkados
  // localmente (symlink en node_modules), Vite los trata como fuente y falla
  // al resolver named exports. Forzamos pre-bundling para que esbuild los
  // convierta a ESM igual que cuando vienen del registry.
  optimizeDeps: {
    // Con paquetes junction-linkados, la caché de prebundle (.vite/deps) NO se
    // invalida al recompilar su dist — el navegador se queda con código viejo.
    // force re-optimiza en cada arranque (coste: ~1s). Quitar cuando todos los
    // @openfactu/* vengan de npm en lugar de junctions.
    force: true,
    include: [
      '@openfactu/common',
      '@openfactu/pdf',
      '@openfactu/pdf/browser',
      '@openfactu/site-builder',
      '@openfactu/ui',
      // Subruta propia: los gráficos viven aparte porque arrastran recharts
      // (peerDependency opcional), y Vite la prebundlea como entrada distinta.
      '@openfactu/ui/charts',
      // Sin prebundlear, el kit de IA se sirve desde el repo enlazado con su propia copia del
      // catálogo de textos: en desarrollo no veía el inglés que registra la app.
      '@openfactu/ui/ai',
      '@openfactu/plugin-sdk',
      '@zxing/browser',
      '@zxing/library',
    ],
  },
});
