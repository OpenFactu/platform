import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/context/TabsContext.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source.replaceAll('import.meta', '__importMeta'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
});

function loadContext(hot) {
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    __importMeta: { hot },
    require(name) {
      if (name.endsWith('/RouteRegistry'))
        return { resolveRouteMeta: () => ({ title: 'Pedidos' }) };
      if (name.endsWith('/permissions')) return { canRead: () => true };
      if (name.endsWith('/AuthContext')) return { useAuth: () => ({ user: { role: 'ADMIN' } }) };
      return require(name);
    },
    window: { location: { pathname: '/purchase-orders', search: '' } },
    localStorage: { getItem: () => null },
  });
  return exports;
}

function renderWith(providers, consumers) {
  function Screen() {
    const { tabs } = consumers.useTabs();
    const { id } = consumers.useCurrentTab();
    return React.createElement('span', null, `${tabs[0].path}:${id}`);
  }
  return renderToStaticMarkup(
    React.createElement(
      providers.TabsProvider,
      null,
      React.createElement(
        providers.CurrentTabProvider,
        { tabId: 'purchase-tab' },
        React.createElement(Screen),
      ),
    ),
  );
}

test('normal loads provide the tab state and current tab', () => {
  const context = loadContext();
  assert.equal(renderWith(context, context), '<span>/purchase-orders:purchase-tab</span>');
});

test('hot updates keep existing providers connected to newly loaded screens', () => {
  const data = {};
  let dispose;
  const original = loadContext({
    data,
    dispose: (callback) => {
      dispose = callback;
    },
  });
  dispose?.(data);
  const updated = loadContext({ data, dispose: () => {} });
  assert.equal(renderWith(original, updated), '<span>/purchase-orders:purchase-tab</span>');
  assert.equal(renderWith(updated, original), '<span>/purchase-orders:purchase-tab</span>');
});

test('a genuinely missing provider still reports the configuration error', () => {
  const context = loadContext();
  function Screen() {
    context.useTabs();
    return null;
  }
  assert.throws(
    () => renderToStaticMarkup(React.createElement(Screen)),
    /useTabs must be used within TabsProvider/,
  );
});
