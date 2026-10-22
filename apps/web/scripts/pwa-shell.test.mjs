import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Match Vite's TS transpilation without requiring Node's native TS support.
const source = readFileSync(new URL('./pwa-shell.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { collectShellScripts } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

test('precache includes the entry and its static dependencies, but not unopened screens', () => {
  const bundle = {
    'entry.js': {
      type: 'chunk',
      fileName: 'entry.js',
      isEntry: true,
      imports: ['shared.js'],
      dynamicImports: ['page.js'],
    },
    'shared.js': { type: 'chunk', fileName: 'shared.js', imports: ['react.js'] },
    'react.js': { type: 'chunk', fileName: 'react.js', imports: [] },
    'page.js': {
      type: 'chunk',
      fileName: 'page.js',
      isDynamicEntry: true,
      imports: ['shared.js', 'editor.js'],
    },
    'editor.js': { type: 'chunk', fileName: 'editor.js', imports: [] },
    'style.css': { type: 'asset', fileName: 'style.css' },
  };
  assert.deepEqual([...collectShellScripts(bundle)].sort(), ['entry.js', 'react.js', 'shared.js']);
});

test('shared dependency cycles do not prevent shell collection', () => {
  const bundle = {
    'entry.js': { type: 'chunk', fileName: 'entry.js', isEntry: true, imports: ['shared.js'] },
    'shared.js': { type: 'chunk', fileName: 'shared.js', imports: ['entry.js'] },
  };
  assert.deepEqual([...collectShellScripts(bundle)].sort(), ['entry.js', 'shared.js']);
});
