// Copia a dist/ los ficheros no-TS que el build necesita en runtime
// (migraciones SQL de tenant + datos de seed). Antes era un one-liner de
// shell (`mkdir -p ... && cp ...`) que solo funcionaba en shells POSIX — en
// Windows, npm ejecuta los scripts vía cmd.exe, que no entiende `mkdir -p`
// ni `cp`. Este script hace lo mismo con `node:fs`, cross-platform.
import { mkdirSync, readdirSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function copyMatching(srcDir, destDir, filter) {
  mkdirSync(destDir, { recursive: true });
  if (!existsSync(srcDir)) return;
  for (const name of readdirSync(srcDir)) {
    const srcPath = join(srcDir, name);
    if (!statSync(srcPath).isFile()) continue;
    if (filter && !filter(name)) continue;
    copyFileSync(srcPath, join(destDir, name));
  }
}

copyMatching(
  join(root, 'src/core/tenant/migrations'),
  join(root, 'dist/core/tenant/migrations'),
  (name) => name.endsWith('.sql'),
);
copyMatching(join(root, 'src/seed-data'), join(root, 'dist/seed-data'));
