/** @type {import('tailwindcss').Config} */
import { createRequire } from 'node:module';
import path from 'node:path';

import animated from 'tailwindcss-animated';
import uiPreset from '@openfactu/ui/tailwind-preset';

// Dónde está de verdad el paquete de interfaz que importa esta app.
//
// La ruta iba escrita a mano a `../../node_modules`, y npm no siempre lo deja
// ahí: con dos versiones en juego, la de la app queda en `apps/web/node_modules`
// y en la raíz se hoistea otra. Tailwind escaneaba entonces las clases de una
// versión mientras la app renderizaba componentes de otra, así que las clases
// que sólo existen en la nueva se purgaban al compilar —el modal salía sin
// fondo— y en desarrollo, sin purga, se veía bien.
const require = createRequire(import.meta.url);
const distDeUi = path
  .join(path.dirname(require.resolve('@openfactu/ui/package.json')), 'dist')
  .replace(/\\/g, '/');

export default {
  // El preset mapea las utilidades (text-ink-900, bg-card, shadow-k-md…) a las
  // variables CSS de '@openfactu/ui/styles.css', importado desde src/index.css.
  // Antes esta configuración replicaba ese mapeo a mano en theme.extend.
  presets: [uiPreset],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    // Necesario para que Tailwind JIT procese las clases arbitrarias
    // (rounded-[2px], bg-[var(--bg-card)], etc.) de los componentes del paquete.
    `${distDeUi}/**/*.{js,jsx}`,
  ],
  // Redundante con el preset, pero explícito: perderlo rompe medio diseño.
  darkMode: 'class',
  // El preset omite `plugins` a propósito, para no convertir una devDependency
  // de la librería en dependencia dura del consumidor. Las clases animate-in /
  // fade-in-50 que usa la app vienen de aquí.
  plugins: [animated],
};
