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
  pdf: 'D:/dev/pdf',
  'plugin-sdk': 'D:/dev/plugin-sdk',
};

/**
 * carpeta dentro de plugins/ -> ruta del repo local. Los plugins viven en su
 * propio repositorio; el servidor los ve por este enlace.
 */
const PLUGIN_LINKS = {
  'openfactu-plugin-es': 'D:/dev/openfactu-plugin-es',
};

function link(linkPath, target, label) {
  if (!fs.existsSync(target)) {
    console.warn(`[link:local] ~ ${label}: no existe ${target}, se omite`);
    return;
  }

  // lstat (no existsSync) para detectar tambien un enlace roto, que hay que
  // borrar igual antes de recrearlo.
  if (fs.lstatSync(linkPath, { throwIfNoEntry: false })) {
    fs.rmSync(linkPath, { recursive: true, force: true });
  }
  // plugins/ no está en git: en un clon nuevo todavía no existe.
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });

  if (process.platform === 'win32') {
    // mklink es un builtin de cmd.exe, no un ejecutable.
    execFileSync('cmd.exe', ['/c', 'mklink', '/J', linkPath, path.normalize(target)], {
      stdio: 'ignore',
    });
  } else {
    fs.symlinkSync(target, linkPath, 'dir');
  }

  const { version } = JSON.parse(fs.readFileSync(path.join(linkPath, 'package.json'), 'utf8'));
  console.log(`[link:local] ✓ ${label} -> ${target} (${version})`);
}

for (const [name, target] of Object.entries(LINKS)) {
  link(path.join(repoRoot, 'node_modules', '@openfactu', name), target, `@openfactu/${name}`);
}

for (const [name, target] of Object.entries(PLUGIN_LINKS)) {
  link(path.join(repoRoot, 'plugins', name), target, `plugins/${name}`);
}
