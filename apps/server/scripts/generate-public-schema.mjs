#!/usr/bin/env node
// Genera `sql/public-schema.sql`: el esquema público de Keirost, en SQL
// idempotente, sacado del propio `schema.ts`.
//
// Lo ejecuta el servidor al arrancar para asegurarse de que las tablas del
// esquema `public` están y tienen todas sus columnas. Antes ese SQL vivía
// escrito a mano dentro de `server.ts` —185 líneas— y en `push-public.ts`, que
// ya se había quedado atrás: diez columnas para «GlobalUser» donde el esquema
// tiene dieciocho. Un esquema a medias no falla al crearlo; falla mucho
// después, al consultarlo, con un error que no menciona ninguna columna.
//
// La lista de tablas sale del `tablesFilter` de `drizzle.config.ts`: el resto
// son tablas de empresa y viven en el esquema de cada tenant.
//
//   node scripts/generate-public-schema.mjs

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raizServidor = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.join(raizServidor, 'sql', 'public-schema.sql');

/**
 * Tablas que viven en el schema `public`.
 *
 * No sirve el `tablesFilter` de `drizzle.config.ts`: ésa es la lista que
 * gestiona `drizzle-kit push`, más corta. El schema `public` tiene además las
 * de plugins, tokens, automatizaciones y website, que son globales y no de
 * empresa. Todo lo que no esté aquí vive en el schema de cada tenant.
 */
const TABLAS_PUBLICAS = [
  'Tenant',
  'GlobalUser',
  'UserTenantMembership',
  'AuditLog',
  'PluginField',
  'PluginTable',
  'TenantPlugin',
  'ApiToken',
  'DevApiKey',
  'UserModule',
  'UserDashboardWidget',
  'Automation',
  'AutomationRun',
  'AiConversation',
  'WebsiteHost',
];

/** Tabla sobre la que actúa una sentencia, si se puede saber. */
function tablaDe(sentencia) {
  const m = sentencia.match(
    /^\s*(?:CREATE TABLE(?: IF NOT EXISTS)?|ALTER TABLE(?: ONLY)?|CREATE (?:UNIQUE )?INDEX[\s\S]*?\bON)\s+(?:"public"\.)?"([^"]+)"/i,
  );
  return m ? m[1] : null;
}

/** Tablas a las que apunta una clave foránea de la sentencia. */
function referencias(sentencia) {
  return [...sentencia.matchAll(/REFERENCES\s+(?:"public"\.)?"([^"]+)"/gi)].map((m) => m[1]);
}

/**
 * Convierte un `CREATE TABLE` en su versión idempotente más los `ALTER TABLE
 * ADD COLUMN` de cada columna.
 *
 * Los ALTER son lo que pone al día una instalación que ya existe: crear la
 * tabla no basta cuando la tabla está pero le faltan columnas nuevas, que es
 * justo lo que pasa al actualizar. Se repite la definición tal cual la escribe
 * Drizzle —con su tipo, su NOT NULL y su DEFAULT—, que es lo que PostgreSQL
 * admite en un ADD COLUMN.
 */
/**
 * Envuelve una sentencia para que no proteste si lo suyo ya está puesto.
 *
 * Se miran dos códigos porque una restricción `UNIQUE` crea además un índice
 * con su nombre: si sobrevive el índice pero no la restricción, el error que
 * sale es el del índice y no el de la restricción.
 */
function protegida(sentencia) {
  return `DO $$ BEGIN\n  ${sentencia};\nEXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;\nEND $$`;
}

function idempotente(sentencia, tabla) {
  // `ADD CONSTRAINT` no admite IF NOT EXISTS y este SQL se aplica más de una
  // vez —al instalar y en cada arranque—, así que la segunda reventaba con
  // «constraint already exists» y se llevaba por delante el resto del fichero.
  if (/ADD CONSTRAINT/i.test(sentencia)) {
    return [protegida(sentencia)];
  }

  const cuerpo = sentencia.match(/CREATE TABLE "[^"]+" \(([\s\S]*)\)\s*$/);
  const creacion = sentencia.replace(/^CREATE TABLE\s+"/i, 'CREATE TABLE IF NOT EXISTS "');
  if (!cuerpo) return [creacion];

  const lineas = cuerpo[1].split('\n').map((l) => l.trim().replace(/,$/, ''));
  const columnas = lineas.filter((l) => l.startsWith('"'));

  // Las restricciones escritas dentro del CREATE sólo se aplican al crear la
  // tabla. Sobre una que ya existe de una versión anterior no entrarían nunca,
  // así que se repiten aparte igual que las columnas.
  const restricciones = lineas
    .filter((l) => /^CONSTRAINT\s+"/i.test(l))
    .map((l) => protegida(`ALTER TABLE "${tabla}" ADD ${l}`));

  const alteraciones = columnas
    // Las claves primarias no se añaden después: si la tabla existe, ya la
    // tiene, y si no existe la crea el CREATE de arriba.
    .filter((c) => !/PRIMARY KEY/i.test(c))
    .map((c) => {
      // Una columna NOT NULL sin valor por defecto no se puede añadir a una
      // tabla que ya tenga filas. Al crearla desde cero sí lleva su NOT NULL
      // —está en el CREATE de arriba—; al añadirla después entra admitiendo
      // nulos, que es justo lo que hacía el SQL a mano que esto sustituye.
      const definicion = /\bDEFAULT\b/i.test(c) ? c : c.replace(/\s+NOT NULL\b/i, '');
      return `ALTER TABLE "${tabla}" ADD COLUMN IF NOT EXISTS ${definicion}`;
    });

  return [creacion, ...alteraciones, ...restricciones];
}

function main() {
  const tablas = new Set(TABLAS_PUBLICAS);

  // `drizzle-kit export` saca el DDL del esquema actual sin tocar ninguna base
  // de datos. Trae todas las tablas, también las de empresa: se filtran aquí.
  // `execSync` y no `execFileSync`: la orden es fija y sin nada del exterior, y
  // así se resuelve `npx` igual en Windows que en el resto sin buscar el .cmd.
  const exportado = execSync('npx drizzle-kit export --config drizzle.config.ts', {
    cwd: raizServidor,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });

  const sentencias = exportado
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => {
      const tabla = tablaDe(s);
      if (!tabla || !tablas.has(tabla)) return false;
      // Una clave foránea hacia una tabla de empresa no se puede aplicar aquí:
      // esa tabla no existe en «public».
      return referencias(s).every((destino) => tablas.has(destino));
    })
    .flatMap((s) => idempotente(s, tablaDe(s)));

  const creadas = sentencias
    .filter((s) => s.startsWith('CREATE TABLE'))
    .map((s) => s.match(/"([^"]+)"/)[1]);
  const ausentes = [...tablas].filter((t) => !creadas.includes(t));
  if (ausentes.length > 0) {
    throw new Error(`el esquema exportado no trae estas tablas públicas: ${ausentes.join(', ')}`);
  }

  mkdirSync(path.dirname(SALIDA), { recursive: true });
  writeFileSync(
    SALIDA,
    '-- Esquema público de Keirost. GENERADO: no editar a mano.\n' +
      '-- Sale de schema.ts vía scripts/generate-public-schema.mjs.\n\n' +
      sentencias.join(';\n\n') +
      ';\n',
    'utf8',
  );
  console.log(
    `sql/public-schema.sql: ${creadas.length} tablas, ${sentencias.length} sentencias ` +
      `(${creadas.join(', ')})`,
  );
}

main();
