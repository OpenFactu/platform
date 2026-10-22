/** HTTP-only reference client for the separate firmware repository. */
import crypto from 'node:crypto';

async function main() {
  const [command, action, ...options] = process.argv.slice(2);
  const base = process.env.TIMECLOCK_BASE_URL;
  const tenant = process.env.TIMECLOCK_TENANT_ID;
  const token = process.env.TIMECLOCK_DEVICE_TOKEN;
  const uid = process.env.TIMECLOCK_TEST_UID;
  if (!base || !tenant || !token)
    throw new Error('Configura TIMECLOCK_BASE_URL, TIMECLOCK_TENANT_ID y TIMECLOCK_DEVICE_TOKEN.');
  const url = new URL(base);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('Usa HTTPS fuera de localhost.');
  if (
    !['config', 'read', 'punch'].includes(command) ||
    (command === 'punch' && !['in', 'out', 'break_start', 'break_end'].includes(action))
  )
    throw new Error('Uso: config | read | punch in|out|break_start|break_end [--request-id UUID]');
  const args = process.argv.slice(2);
  const flag = args.indexOf('--request-id');
  const requestId = flag >= 0 ? args[flag + 1] : crypto.randomUUID();
  if (flag >= 0 && !requestId) throw new Error('Falta el UUID de --request-id.');
  if (command !== 'config' && !uid) throw new Error('Configura TIMECLOCK_TEST_UID.');
  const endpoint = command === 'config' ? 'config' : command === 'read' ? 'readings' : 'punch';
  const body =
    command === 'config'
      ? undefined
      : { requestId, uid, ...(command === 'punch' ? { kind: action } : {}) };
  console.log(`Operación: ${command}; petición: ${command === 'config' ? 'consulta' : requestId}`);
  const response = await fetch(new URL(`/api/hr/timeclock/terminal/v1/device/${endpoint}`, url), {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenant, 'x-device-token': token },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  console.log(`HTTP ${response.status}`);
  console.log(JSON.stringify(await response.json(), null, 2));
  if (!response.ok) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
