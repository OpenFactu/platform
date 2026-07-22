import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
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
      ],
      manifest: {
        name: 'Keirost ERP',
        short_name: 'Keirost',
        description: 'Gestión logística, facturación y contabilidad — ERP en tu bolsillo.',
        theme_color: '#0D9488',
        background_color: '#FAFBFC',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'es',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          // El mismo 512 lo marcamos como "maskable" para que Android lo
          // recorte correctamente dentro de la máscara del launcher.
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
        // Cachea la shell de la SPA y los assets. /api/ nunca se cachea —
        // siempre debe ir a red para datos frescos.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/track\//],
        runtimeCaching: [
          {
            // Tiles de MapLibre (Carto Positron) — cachea 7 días.
            urlPattern: ({ url }) =>
              url.hostname === 'basemaps.cartocdn.com' ||
              url.hostname.endsWith('.tile.openstreetmap.org'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 300, maxAgeSeconds: 7 * 24 * 3600 },
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
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  // Paquetes @openfactu/* se publican como CommonJS. Cuando están linkados
  // localmente (symlink en node_modules), Vite los trata como fuente y falla
  // al resolver named exports. Forzamos pre-bundling para que esbuild los
  // convierta a ESM igual que cuando vienen del registry.
  optimizeDeps: {
    include: [
      '@openfactu/common',
      '@openfactu/pdf',
      '@openfactu/pdf/browser',
      '@openfactu/ui',
      '@openfactu/plugin-sdk',
      '@zxing/browser',
      '@zxing/library',
    ],
  },
});
