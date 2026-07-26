/**
 * Rehace los junctions de los paquetes @openfactu/* que se desarrollan en local.
 *
 *   npm run link:local
 *
 * `npm install` sustituye cualquier enlace de node_modules por la version
 * publicada en el registry, asi que hay que volver a lanzarlo despues de cada
 * instalacion. El sintoma tipico de haberlo olvidado es un `tsc` quejandose de
 * que el paquete "has no exported member 'X'": se esta compilando contra la
 * version antigua de npm.
 *
 * Los paquetes que no existan en disco se ignoran con un aviso, para que la
 * lista pueda ser mas larga que lo que cada maquina tenga clonado.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** nombre dentro de @openfactu/ -> ruta del repo local */
const LINKS = {
  ui: 'D:/dev/ui',
  'site-builder': 'D:/dev/site-builder',
};

for (const [name, target] of Object.entries(LINKS)) {
  const link = path.join(repoRoot, 'node_modules', '@openfactu', name);

  if (!fs.existsSync(target)) {
    console.warn(`[link:local] ~ @openfactu/${name}: no existe ${target}, se omite`);
    continue;
  }

  // lstat (no existsSync) para detectar tambien un enlace roto, que hay que
  // borrar igual antes de recrearlo.
  if (fs.lstatSync(link, { throwIfNoEntry: false })) {
    fs.rmSync(link, { recursive: true, force: true });
  }

  if (process.platform === 'win32') {
    // mklink es un builtin de cmd.exe, no un ejecutable.
    execFileSync('cmd.exe', ['/c', 'mklink', '/J', link, path.normalize(target)], {
      stdio: 'ignore',
    });
  } else {
    fs.symlinkSync(target, link, 'dir');
  }

  const { version } = JSON.parse(fs.readFileSync(path.join(link, 'package.json'), 'utf8'));
  console.log(`[link:local] ✓ @openfactu/${name} -> ${target} (${version})`);
}
