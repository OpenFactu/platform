/**
 * Traducciones de plugins: que un plugin pueda traer sus textos y un idioma entero,
 * y que nada de eso pueda estropear lo que ya funciona.
 */
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PluginTranslations } from '../PluginTranslations';
import { TenantPluginCache } from '../TenantPluginCache';
import { isKnownLocale, parseLocale, tr } from '../../../i18n';
import { translateReportResult } from '../../reports/PluginReports';
import { amountToWords } from '../../../utils/numberToWords';

const PLUGIN = 'test-traducciones';
const TENANT = 'tenant-a';

const CATALOGS = {
  es: { plugins: { demo: { title: 'Libro', total: 'Total de {count}', onlyEs: 'Solo español' } } },
  en: { plugins: { demo: { title: 'Book', total: 'Total of {count}', onlyEn: 'English only' } } },
  zh: {
    plugins: { demo: { title: '账簿' } },
    pdf: { date: '日期', col: { qty: '数量' } },
    messages: {
      'Falta el certificado del plugin': '缺少证书',
      'Sin permiso del plugin para {0}': '无权访问 {0}',
    },
  },
};

afterEach(() => PluginTranslations.removePlugin(PLUGIN));

function activate(t: any, active = true) {
  t.mock.method(TenantPluginCache, 'isActive', (tenantId: string, pluginId: string) => {
    return active && tenantId === TENANT && pluginId === PLUGIN;
  });
}

function registerAll() {
  for (const [locale, catalog] of Object.entries(CATALOGS)) {
    PluginTranslations.register(PLUGIN, locale, catalog);
  }
}

test('una clave se traduce al idioma pedido, y un texto plano se queda como está', (t) => {
  activate(t);
  registerAll();
  assert.equal(PluginTranslations.text(TENANT, 'en', 'plugins.demo.title'), 'Book');
  assert.equal(PluginTranslations.text(TENANT, 'es', 'plugins.demo.title'), 'Libro');
  assert.equal(PluginTranslations.text(TENANT, 'zh', 'plugins.demo.title'), '账簿');
  assert.equal(PluginTranslations.text(TENANT, 'en', 'Texto plano'), 'Texto plano');
  assert.equal(
    PluginTranslations.text(TENANT, 'en', 'plugins.demo.total', { count: 3 }),
    'Total of 3',
  );
});

test('lo que falta cae a inglés y luego a español, nunca a un hueco', (t) => {
  activate(t);
  registerAll();
  assert.equal(PluginTranslations.text(TENANT, 'zh', 'plugins.demo.onlyEn'), 'English only');
  assert.equal(PluginTranslations.text(TENANT, 'zh', 'plugins.demo.onlyEs'), 'Solo español');
  assert.equal(PluginTranslations.text(TENANT, 'es', 'plugins.demo.onlyEn'), 'English only');
});

test('sin el plugin activo en la empresa no se aplica nada', (t) => {
  activate(t, false);
  registerAll();
  assert.equal(PluginTranslations.text(TENANT, 'en', 'plugins.demo.title'), 'plugins.demo.title');
  assert.deepEqual(PluginTranslations.languagesFor(TENANT), []);
  assert.deepEqual(PluginTranslations.catalogsFor(TENANT, 'en'), {});
});

test('textOf traduce aunque el plugin no esté activo: el gestor de plugins lo necesita', (t) => {
  activate(t, false);
  registerAll();
  assert.equal(PluginTranslations.textOf(PLUGIN, 'en', 'plugins.demo.title'), 'Book');
});

test('la web recibe el idioma pedido y los de reserva, y los idiomas nuevos', (t) => {
  activate(t);
  registerAll();
  assert.deepEqual(PluginTranslations.languagesFor(TENANT), ['zh']);
  assert.deepEqual(Object.keys(PluginTranslations.catalogsFor(TENANT, 'zh')).sort(), [
    'en',
    'es',
    'zh',
  ]);
  assert.deepEqual(Object.keys(PluginTranslations.catalogsFor(TENANT, 'en')).sort(), ['en', 'es']);
  // El zh no se manda a quien no lo pide: un idioma entero pesa.
  assert.equal(PluginTranslations.catalogsFor(TENANT, 'en').zh, undefined);
  // `messages` es del servidor: no viaja a la web.
  assert.equal((PluginTranslations.catalogsFor(TENANT, 'zh').zh as any).messages, undefined);
});

test('un idioma de plugin se reconoce en las peticiones; uno desconocido, no', () => {
  assert.equal(isKnownLocale('fr'), false);
  registerAll();
  assert.equal(parseLocale('zh,en;q=0.9'), 'zh');
  assert.equal(parseLocale('zh-CN'), 'zh');
  assert.equal(parseLocale('fr'), 'es');
  assert.equal(parseLocale('en-GB'), 'en');
  assert.equal(isKnownLocale('zh'), true);
  assert.equal(isKnownLocale('../../etc'), false);
});

test('los errores del plugin se traducen, también con variables', () => {
  registerAll();
  assert.equal(tr('zh', 'Falta el certificado del plugin'), '缺少证书');
  assert.equal(tr('zh', 'Sin permiso del plugin para ventas'), '无权访问 ventas');
  // En español es el propio texto.
  assert.equal(tr('es', 'Falta el certificado del plugin'), 'Falta el certificado del plugin');
});

test('un plugin no puede cambiar una traducción del núcleo', () => {
  const coreText = 'Generado {date}';
  const before = tr('en', coreText, { date: 'x' });
  PluginTranslations.register(PLUGIN, 'en', { messages: { [coreText]: 'HACKED {date}' } });
  assert.equal(tr('en', coreText, { date: 'x' }), before);
});

test('lo que falta en un idioma de plugin sale en inglés, no en español', () => {
  registerAll();
  assert.equal(tr('zh', 'Sin datos'), tr('en', 'Sin datos'));
  assert.notEqual(tr('zh', 'Sin datos'), 'Sin datos');
});

test('al quitar el plugin desaparecen también sus textos de servidor', () => {
  registerAll();
  PluginTranslations.removePlugin(PLUGIN);
  assert.equal(tr('zh', 'Falta el certificado del plugin'), 'Falta el certificado del plugin');
});

test('un catálogo mal formado se rechaza', () => {
  assert.throws(() => PluginTranslations.register(PLUGIN, 'es', { a: 1 }), /objeto de textos/);
  assert.throws(() => PluginTranslations.register(PLUGIN, 'es', 'hola'), /objeto de textos/);
  assert.throws(() => PluginTranslations.register(PLUGIN, '../es', {}), /código de idioma/);
});

test('un fichero roto se ignora sin tumbar el plugin ni los demás idiomas', (t) => {
  activate(t);
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-'));
  try {
    fs.writeFileSync(path.join(dir, 'es.json'), '{ esto no es JSON');
    fs.writeFileSync(path.join(dir, 'notas.json'), '{}');
    fs.writeFileSync(path.join(dir, 'en.json'), JSON.stringify(CATALOGS.en));
    assert.equal(PluginTranslations.loadFromDirectory(PLUGIN, dir), true);
    assert.equal(PluginTranslations.text(TENANT, 'en', 'plugins.demo.title'), 'Book');
    assert.equal(
      PluginTranslations.text(TENANT, 'es', 'plugins.demo.onlyEs'),
      'plugins.demo.onlyEs',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('un plugin sin carpeta i18n no da problemas', () => {
  assert.equal(PluginTranslations.loadFromDirectory(PLUGIN, '/no/existe/i18n'), false);
});

test('dos plugins: el primero gana y quitar uno no afecta al otro', (t) => {
  t.mock.method(TenantPluginCache, 'isActive', () => true);
  try {
    PluginTranslations.register('primero', 'en', { plugins: { shared: { a: 'uno' } } });
    PluginTranslations.register('segundo', 'en', { plugins: { shared: { a: 'dos', b: 'tres' } } });
    const catalog = PluginTranslations.catalogsFor(TENANT, 'en').en as any;
    assert.equal(catalog.plugins.shared.a, 'uno');
    assert.equal(catalog.plugins.shared.b, 'tres');
    PluginTranslations.removePlugin('primero');
    assert.equal(PluginTranslations.text(TENANT, 'en', 'plugins.shared.a'), 'dos');
  } finally {
    PluginTranslations.removePlugin('primero');
    PluginTranslations.removePlugin('segundo');
  }
});

test('etiquetas de PDF solo para los idiomas que el núcleo no trae', (t) => {
  activate(t);
  registerAll();
  assert.deepEqual(PluginTranslations.pdfLabelsFor(TENANT, 'zh'), {
    date: '日期',
    'col.qty': '数量',
  });
  assert.deepEqual(PluginTranslations.pdfLabelsFor(TENANT, 'es'), {});
});

test('un informe traduce títulos y etiquetas, pero no toca las filas', () => {
  const upper = (text: string) => text.toUpperCase();
  const result = translateReportResult(
    {
      title: 'titulo',
      sections: [
        {
          title: 'seccion',
          columns: [{ key: 'a', label: 'columna' }],
          rows: [{ a: 'dato' }],
          totals: { label: 'total', values: { a: 1 } },
        },
      ],
    },
    upper,
  );
  assert.equal(result.title, 'TITULO');
  assert.equal(result.sections[0].title, 'SECCION');
  assert.equal(result.sections[0].columns[0].label, 'COLUMNA');
  assert.equal(result.sections[0].totals?.label, 'TOTAL');
  assert.equal(result.sections[0].rows[0].a, 'dato');
});

test('un informe sin título propio conserva el de su definición', () => {
  const result = translateReportResult({ sections: [] }, (text) => text);
  assert.equal('title' in result, false);
  assert.equal({ title: 'Del informe', ...result }.title, 'Del informe');
});

test('el total en letras no sale en un idioma que no le corresponde', () => {
  assert.notEqual(amountToWords(10, 'es'), '');
  assert.notEqual(amountToWords(10, 'en'), '');
  assert.equal(amountToWords(10, 'zh'), '');
});
