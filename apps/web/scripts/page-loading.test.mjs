import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));

// Follow emitted static imports, including re-exports and aliases. Dynamic
// imports are deliberately excluded: those files are requested on demand.
function eagerFiles(entry) {
  const visited = new Set();
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    });
    const ast = ts.createSourceFile(file, outputText, ts.ScriptTarget.Latest, true);
    for (const statement of ast.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      const specifier = statement.moduleSpecifier?.text;
      if (!specifier || (!specifier.startsWith('.') && !specifier.startsWith('@/'))) continue;
      if (/\.(css|json|svg|png)$/.test(specifier)) continue;
      const base = specifier.startsWith('@/')
        ? path.join(sourceRoot, specifier.slice(2))
        : path.resolve(path.dirname(file), specifier);
      const resolved = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']
        .map((suffix) => base + suffix)
        .find((candidate) => /\.(ts|tsx)$/.test(candidate) && existsSync(candidate));
      assert.ok(resolved, `Unresolved source import: ${specifier} in ${file}`);
      visit(resolved);
    }
  }
  visit(path.join(sourceRoot, entry));
  return [...visited].map((file) => path.relative(sourceRoot, file).replaceAll('\\', '/'));
}

for (const entry of ['main.tsx', 'components/MainLayout.tsx', 'modules/index.ts']) {
  test(`${entry} does not download screens before they are opened`, () => {
    const pages = eagerFiles(entry).filter((file) => /(^|\/)pages\//.test(file));
    assert.deepEqual(pages, [], `Eagerly loaded screens:\n${pages.join('\n')}`);
  });
}

test('the closed chat launcher does not download the message renderer', () => {
  const files = eagerFiles('modules/ai/components/ChatLauncherPanel.tsx');
  assert.equal(files.includes('modules/ai/components/MessageBubble.tsx'), false);
});
