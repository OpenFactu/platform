import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // fetch() solo es legal en src/shared/http: el resto de la app pasa por
    // apiClient / los adaptadores api/ de cada módulo.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/shared/http/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.name='fetch'], CallExpression[callee.object.name='window'][callee.property.name='fetch']",
          message: 'Usa apiClient / los adaptadores api/ del módulo en lugar de fetch().',
        },
      ],
    },
  },
]);
