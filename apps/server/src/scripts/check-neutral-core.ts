/**
 * Guardia del núcleo neutro: falla si aparece normativa de un país en el código
 * o en las traducciones. Lo específico de un país va en su plugin.
 *
 *   npx ts-node --transpile-only src/scripts/check-neutral-core.ts
 *
 * Mira código y textos, no datos históricos: las migraciones ya aplicadas y el
 * catálogo geográfico describen lo que hay, no deciden lo que hace el producto.
 */
import fs from 'fs';
import path from 'path';

const REPO = path.resolve(__dirname, '../../../..');

const ROOTS = ['apps/server/src', 'apps/web/src'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.json']);

const FORBIDDEN = [
  /\bIVA\d*\b/,
  /\bIRPF\b/,
  /\birpf\b/,
  /\bIGIC\b/,
  /\bPGC\b/,
  /\bNIF\b/,
  /\bCIF\b/,
  /\bAEAT\b/,
  /\bVeriFactu\b/i,
  /\bTicketBAI\b/i,
  /Seguridad Social/,
  /\bmodelo 303\b/i,
  /\bForm 303\b/,
];

/** Rutas enteras que no son código de producto. */
const IGNORED_PATHS = [
  /[\\/]migrations[\\/]/,
  /[\\/]seed-data[\\/]/,
  /[\\/]__tests__[\\/]/,
  /[\\/]scripts[\\/]/,
];

/**
 * Excepciones por fichero, cada una con su motivo. Antes de añadir una, piensa
 * si eso no debería estar en un plugin.
 */
const ALLOWED: Array<{ file: RegExp; pattern: RegExp; reason: string }> = [
  {
    file: /api[\\/]accountMappings\.ts$/,
    pattern: /payroll_irpf/,
    reason: 'kind retirado, se filtra del listado hasta borrar la copia de la migración 082',
  },
  {
    file: /api[\\/]hr[\\/]payrolls\.ts$/,
    pattern: /irpfAmount/,
    reason: 'columna anterior, se sigue escribiendo hasta la migración que la retire',
  },
  {
    file: /core[\\/]hr[\\/]payrollCalculation\.ts$/,
    pattern: /irpfAmount/,
    reason: 'columna anterior, se sigue escribiendo hasta la migración que la retire',
  },
  {
    file: /core[\\/]dataimport[\\/]automap\.ts$/,
    pattern: /./,
    reason: 'sinónimos para reconocer columnas de ficheros de cualquier origen',
  },
];

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (EXTENSIONS.has(path.extname(entry.name))) yield full;
  }
}

const problems: string[] = [];
for (const root of ROOTS) {
  for (const file of walk(path.join(REPO, root))) {
    if (IGNORED_PATHS.some((p) => p.test(file))) continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of FORBIDDEN) {
        if (!pattern.test(line)) continue;
        const allowed = ALLOWED.some((a) => a.file.test(file) && a.pattern.test(line));
        if (!allowed) {
          problems.push(`${path.relative(REPO, file)}:${index + 1}  ${line.trim().slice(0, 100)}`);
        }
        break;
      }
    });
  }
}

if (problems.length > 0) {
  console.error(`Normativa de un país dentro del núcleo (${problems.length}):\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`\nLlévalo a un paquete de localización. Ver docs/localizacion-plugins.md`);
  process.exit(1);
}
console.log('Núcleo neutro: sin normativa de ningún país.');
