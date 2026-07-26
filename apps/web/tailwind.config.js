/** @type {import('tailwindcss').Config} */
import animated from 'tailwindcss-animated';
import uiPreset from '@openfactu/ui/tailwind-preset';

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
    // Con el junction a D:\dev\ui, el glob sigue el enlace hasta su dist.
    '../../node_modules/@openfactu/ui/dist/**/*.{js,jsx}',
  ],
  // Redundante con el preset, pero explícito: perderlo rompe medio diseño.
  darkMode: 'class',
  // El preset omite `plugins` a propósito, para no convertir una devDependency
  // de la librería en dependencia dura del consumidor. Las clases animate-in /
  // fade-in-50 que usa la app vienen de aquí.
  plugins: [animated],
};
