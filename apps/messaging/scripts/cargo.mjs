// Lanza cargo con un compilador de C que funcione: `ring` compila C con el MSVC
// que encuentre, y en Windows ese puede ser un Visual Studio recién instalado sin
// las librerías de escritorio x64 (`vcruntime.h` o `msvcrt.lib` no encontrados).
// Aquí se elige el más nuevo que las tenga y se carga su entorno antes de cargo.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const cwd = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const installerDir = path.join(
  process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
  'Microsoft Visual Studio',
  'Installer',
);

/** Instalaciones de Visual Studio, de la más nueva a la más antigua. */
function visualStudios() {
  const vswhere = path.join(installerDir, 'vswhere.exe');
  if (!existsSync(vswhere)) return [];
  const { stdout } = spawnSync(
    vswhere,
    ['-all', '-products', '*', '-sort', '-property', 'installationPath'],
    { encoding: 'utf8' },
  );
  return (stdout ?? '').split(/\r?\n/).filter(Boolean);
}

function hasDesktopLibs(installation) {
  const tools = path.join(installation, 'VC', 'Tools', 'MSVC');
  if (!existsSync(tools)) return false;
  return readdirSync(tools).some(
    (version) =>
      existsSync(path.join(tools, version, 'include', 'vcruntime.h')) &&
      existsSync(path.join(tools, version, 'lib', 'x64', 'msvcrt.lib')),
  );
}

function run(command, commandArgs, options) {
  const child = spawn(command, commandArgs, { cwd, stdio: 'inherit', ...options });
  child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
}

// Fuera de Windows, o desde un "Native Tools Command Prompt", el entorno ya vale.
if (process.platform !== 'win32' || process.env.VCINSTALLDIR) {
  run('cargo', args);
} else {
  const installation = visualStudios().find(hasDesktopLibs);
  if (!installation) {
    console.warn(
      '[messaging] Ningún Visual Studio tiene las librerías de C++ de escritorio x64: ' +
        'instala el componente "Desarrollo para el escritorio con C++". Se intenta igualmente.',
    );
    run('cargo', args);
  } else {
    const vcvars = path.join(installation, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat');
    const line = `call "${vcvars}" >nul && cargo ${args.join(' ')}`;
    run('cmd.exe', ['/d', '/s', '/c', `"${line}"`], {
      windowsVerbatimArguments: true,
      // vcvars llama a vswhere y no siempre está en el PATH.
      env: { ...process.env, PATH: `${process.env.PATH};${installerDir}` },
    });
  }
}
