#!/usr/bin/env node
/**
 * Comprueba la traducción de la web:
 *   1. claves que están en un idioma y faltan en otro (y `{variables}` distintas);
 *   2. claves usadas con t('…') que no existen en `es`;
 *   3. literales que siguen pareciendo español en el código (heurística).
 *
 *   node scripts/check-i18n.mjs            → resumen + listado
 *   node scripts/check-i18n.mjs --strict   → exit 1 si hay 1 o 2
 *   node scripts/check-i18n.mjs --only=src/modules/hr   → filtra el punto 3
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const localesDir = path.join(src, 'i18n', 'locales');
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const only = args.find((a) => a.startsWith('--only='))?.slice(7);

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = String(v);
  }
  return out;
}

function loadLocale(l) {
  const dir = path.join(localesDir, l);
  const merged = {};
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const flat = flatten(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    for (const [k, v] of Object.entries(flat)) {
      if (k in merged) console.warn(`! clave duplicada entre ficheros (${l}/${f}): ${k}`);
      merged[k] = v;
    }
  }
  return merged;
}

const es = loadLocale('es');
const en = loadLocale('en');
const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const base = (k) => k.replace(/_(one|other)$/, '');

const problems = [];
for (const k of Object.keys(es)) if (!(k in en)) problems.push(`falta en en: ${k}`);
for (const k of Object.keys(en)) if (!(k in es)) problems.push(`falta en es: ${k}`);
for (const k of Object.keys(es))
  if (k in en && vars(es[k]) !== vars(en[k])) problems.push(`variables distintas: ${k}`);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== 'i18n' && e.name !== '__tests__') walk(p, out);
    } else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.(test|spec|d)\./.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(src);
const known = new Set(Object.keys(es).map(base));
const leftovers = [];
// Acentos / signos españoles, o palabras muy frecuentes de la UI sin acento.
const SPANISH = /[áéíóúñÁÉÍÓÚÑ¿¡]|\b(Guardar|Cancelar|Eliminar|Nuevo|Nueva|Buscar|Cerrar|Volver|Crear|Editar|Añadir|Sin|Todos|Todas|Fecha|Importe|Cliente|Proveedor|Artículo|Estado|Nombre|Descripción|Cantidad|Precio|Pendiente|Error al|No se pudo|cargando|Cargando)\b/;

for (const file of files) {
  const rel = path.relative(root, file).replaceAll('\\', '/');
  const text = fs.readFileSync(file, 'utf8');

  for (const m of text.matchAll(/\bt\(\s*['"`]([\w.-]+)['"`]/g)) {
    const key = m[1];
    if (key.endsWith('.')) continue; // prefijo dinámico: t(`x.${y}`)
    if (!known.has(key)) problems.push(`clave inexistente: ${key} (${rel})`);
  }

  if (only && !rel.startsWith(only)) continue;
  const lines = text.split('\n');
  let inBlock = false;
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.includes('*/')) inBlock = false;
      return;
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlock = true;
      return;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('{/*')) return;
    if (/console\.(log|warn|error|debug|info)\(/.test(line)) return;
    const code = line.replace(/\/\/.*$/, '').replace(/\{\/\*.*?\*\/\}/g, '');
    // Solo nos interesa texto: literales entre comillas o texto JSX entre > y <.
    const chunks = [
      ...code.matchAll(/'([^'\\]|\\.)*'|"([^"\\]|\\.)*"|`([^`\\]|\\.)*`/g),
      ...code.matchAll(/>([^<>{}]+)</g),
    ].map((m) => m[0]);
    if (chunks.some((c) => SPANISH.test(c))) leftovers.push(`${rel}:${i + 1}: ${trimmed.slice(0, 140)}`);
  });
}

for (const p of problems) console.log(p);
if (leftovers.length) {
  console.log('\n— Literales que parecen español —');
  for (const l of leftovers) console.log(l);
}
const byDir = {};
for (const l of leftovers) {
  const d = l.split(':')[0].split('/').slice(0, 4).join('/');
  byDir[d] = (byDir[d] || 0) + 1;
}
console.log('\n— Resumen —');
console.log(`claves es=${Object.keys(es).length} en=${Object.keys(en).length}`);
console.log(`problemas de claves: ${problems.length}`);
console.log(`literales en español: ${leftovers.length}`);
for (const [d, n] of Object.entries(byDir).sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${d}`);

if (strict && problems.length) process.exit(1);
