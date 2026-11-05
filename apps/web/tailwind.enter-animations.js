import plugin from 'tailwindcss/plugin';

/**
 * Las clases `animate-in`, `fade-in`, `slide-in-from-*` y `zoom-in-*` que usa la app.
 * `tailwindcss-animated` no las trae, así que no generaban nada y las pantallas no
 * animaban al abrirse. Siguen al tema: el muelle de entrada pone la curva y `--k-motion`
 * la velocidad, de modo que «Sin animaciones» las deja en cero.
 *
 * La transformación solo se declara si la pide una clase: un `fade-in` con `transform`
 * convertiría la pantalla en el contenedor de lo que lleve `position: fixed` mientras dura.
 */
const transform =
  'translate3d(var(--tw-enter-x, 0), var(--tw-enter-y, 0), 0) scale(var(--tw-enter-scale, 1))';

const moved = (variables) => ({ ...variables, '--tw-enter-transform': transform });

export default plugin(({ addBase, addUtilities, matchUtilities, theme }) => {
  addBase({
    '@keyframes k-enter': {
      from: {
        opacity: 'var(--tw-enter-opacity, 1)',
        transform: 'var(--tw-enter-transform, none)',
      },
    },
  });

  addUtilities({
    '.animate-in': {
      'animation-name': 'k-enter',
      'animation-duration': 'calc(var(--k-spring-enter-duration, 300ms) * var(--k-motion, 1))',
      'animation-timing-function': 'var(--k-spring-enter, var(--k-ease, ease-out))',
      '@media (prefers-reduced-motion: reduce)': { 'animation-name': 'none' },
    },
  });

  matchUtilities(
    { 'fade-in': (value) => ({ '--tw-enter-opacity': value }) },
    { values: { DEFAULT: '0', ...theme('opacity') } },
  );
  matchUtilities(
    { 'zoom-in': (value) => moved({ '--tw-enter-scale': value }) },
    { values: { DEFAULT: '0.95', ...theme('scale') } },
  );

  const distances = { DEFAULT: '0.5rem', ...theme('spacing'), full: '100%' };
  matchUtilities(
    {
      'slide-in-from-top': (value) => moved({ '--tw-enter-y': `calc(${value} * -1)` }),
      'slide-in-from-bottom': (value) => moved({ '--tw-enter-y': value }),
      'slide-in-from-left': (value) => moved({ '--tw-enter-x': `calc(${value} * -1)` }),
      'slide-in-from-right': (value) => moved({ '--tw-enter-x': value }),
    },
    { values: distances },
  );

  // `duration-500` también manda en estas animaciones, no solo en las transiciones.
  matchUtilities(
    { duration: (value) => ({ 'animation-duration': value }) },
    { values: theme('transitionDuration') },
  );
});
