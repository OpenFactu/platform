/** Run only against an explicitly selected disposable database. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const url = process.env.TIMECLOCK_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.includes('timeclock_test')) {
  console.error(
    'Configura TIMECLOCK_TEST_DATABASE_URL con una base desechable cuyo nombre contenga timeclock_test.',
  );
  process.exitCode = 1;
} else {
  const result = spawnSync(
    process.execPath,
    [
      '--require',
      'ts-node/register/transpile-only',
      '--test',
      'src/core/hr/__tests__/timeclock.integration.test.ts',
    ],
    { cwd: path.resolve(__dirname, '../..'), env: process.env, stdio: 'inherit' },
  );
  process.exitCode = result.status ?? 1;
}
