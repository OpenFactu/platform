import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(
  new URL('../src/modules/hr/domain/timeclockUsb.ts', import.meta.url),
  'utf8',
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const { ReaderUsbSession, validateReaderSetup, connectionFailureMessage, readCardUid } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('connection failure reports the failing stage without native exception contents', () => {
  const error = new Error('secret');
  assert.match(connectionFailureMessage(error, 'open'), /abrir el puerto USB/);
  assert.match(connectionFailureMessage(error, 'handshake'), /abierto.*no responde/);
  assert.match(connectionFailureMessage(error, 'firmware'), /firmware/);
  error.name = 'NotFoundError';
  assert.match(connectionFailureMessage(error, 'select'), /seleccionado/);
  for (const stage of ['select', 'open', 'handshake', 'firmware'])
    assert.equal(connectionFailureMessage(error, stage).includes('secret'), false);
});
function mockPort(reply) {
  let output;
  const encoder = new TextEncoder();
  const port = {
    readable: new ReadableStream({
      start(controller) {
        output = controller;
      },
    }),
    writable: new WritableStream({
      write(bytes) {
        reply(
          JSON.parse(new TextDecoder().decode(bytes)),
          (s) => output.enqueue(encoder.encode(s)),
          output,
        );
      },
    }),
    async open() {},
    async setSignals() {},
    async close() {
      port.closed = true;
    },
  };
  return port;
}
const response = (request, extra = {}) =>
  JSON.stringify({ protocol: 'keirost-usb-v1', id: request.id, ok: true, ...extra }) + '\n';

test('card capture reads one UID and always releases the capture without writing a credential', async () => {
  const commands = [];
  let captureId;
  let polls = 0;
  const session = new ReaderUsbSession(
    mockPort((r, send) => {
      commands.push(r.command);
      if (r.command === 'hello') send(response(r, { cardCapture: true }));
      if (r.command === 'capture_start') {
        captureId = r.captureId;
        send(response(r));
      }
      if (r.command === 'capture_poll') {
        assert.equal(r.captureId, captureId);
        send(
          response(
            r,
            ++polls === 1
              ? { captureState: 'waiting' }
              : { captureState: 'captured', uid: '04A1B2C3' },
          ),
        );
      }
      if (r.command === 'capture_cancel') {
        assert.equal(r.captureId, captureId);
        send(response(r));
      }
    }),
  );
  await session.open();
  assert.equal(await readCardUid(session, new AbortController().signal, () => {}), '04A1B2C3');
  assert.deepEqual(commands, [
    'hello',
    'capture_start',
    'capture_poll',
    'capture_poll',
    'capture_cancel',
  ]);
  await session.close();
});

test('old firmware cannot start capture', async () => {
  const commands = [];
  const session = new ReaderUsbSession(
    mockPort((r, send) => {
      commands.push(r.command);
      send(response(r, { firmware: '0.2.0' }));
    }),
  );
  await session.open();
  await assert.rejects(
    readCardUid(session, new AbortController().signal, () => {}),
    /actualizar/,
  );
  assert.deepEqual(commands, ['hello']);
  await session.close();
});

for (const mode of ['cancel', 'expired', 'invalid', 'start_timeout']) {
  test(`card capture cleans up after ${mode} and never accepts a stale or invalid UID`, async () => {
    const abort = new AbortController();
    const commands = [];
    const session = new ReaderUsbSession(
      mockPort((r, send) => {
        commands.push(r.command);
        if (r.command === 'hello') send(response(r, { cardCapture: true }));
        else if (r.command === 'capture_start' && mode === 'start_timeout') return;
        else if (r.command === 'capture_poll') {
          if (mode === 'cancel') abort.abort();
          send(
            response(r, {
              captureState: mode === 'expired' ? 'expired' : 'captured',
              uid: mode === 'invalid' ? 'malformed' : '04A1B2C3',
            }),
          );
        } else send(response(r));
      }),
      30,
    );
    await session.open();
    await assert.rejects(readCardUid(session, abort.signal, () => {}));
    assert.equal(commands.at(-1), 'capture_cancel');
    await session.close();
  });
}
test('USB accepts fragmented correlated replies, ignoring boot text and other requests', async () => {
  const port = mockPort((r, send) => {
    send('ets boot text\n' + response({ id: 'other' }));
    const message = response(r, { firmware: '0.2.0' });
    send(message.slice(0, 17));
    send(message.slice(17));
  });
  const session = new ReaderUsbSession(port, 100);
  await session.open();
  assert.equal((await session.request('hello')).firmware, '0.2.0');
  await session.close();
  assert.equal(port.closed, true);
});
test('timeout never counts as configuration saved', async () => {
  const session = new ReaderUsbSession(
    mockPort(() => {}),
    20,
  );
  await session.open();
  await assert.rejects(session.request('configure', { deviceToken: 'private' }), /respond/);
  await session.close();
});

test('hello survives a lost request during board startup and stops retrying after reply', async () => {
  const requests = [];
  const session = new ReaderUsbSession(
    mockPort((request, send) => {
      requests.push(request);
      if (requests.length === 1) send('ets Jul 29 2019\nrst:0x1\n');
      else send(response(request, { firmware: '0.2.0' }));
    }),
    2000,
  );
  await session.open();
  assert.equal((await session.request('hello')).firmware, '0.2.0');
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], requests[1]);
  await session.close();
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.equal(requests.length, 2);
});

test('configuration is sent only once even if its acknowledgement is lost', async () => {
  let writes = 0;
  const session = new ReaderUsbSession(
    mockPort(() => {
      writes++;
    }),
    900,
  );
  await session.open();
  await assert.rejects(session.request('configure'), /respond/);
  assert.equal(writes, 1);
  await session.close();
});
test('disconnect rejects pending request without exposing input', async () => {
  const session = new ReaderUsbSession(
    mockPort((_r, _send, output) => output.close()),
    100,
  );
  await session.open();
  await assert.rejects(
    session.request('configure', { deviceToken: 'secret' }),
    (e) => !e.message.includes('secret') && /desconect/.test(e.message),
  );
  await session.close();
});
test('rejects oversized frames and ignores untrusted error text', async () => {
  const session = new ReaderUsbSession(
    mockPort((r, send) =>
      send(response(r, { ok: false, code: 'BOOT_REQUIRED', error: 'token-secret' })),
    ),
    100,
  );
  await session.open();
  await assert.rejects(session.request('configure', { caCert: 'x'.repeat(9000) }), /grande/);
  await assert.rejects(
    session.request('configure'),
    (e) => /BOOT/.test(e.message) && !e.message.includes('token-secret'),
  );
  await session.close();
});
test('firmware configuration requires reachable HTTPS origin without embedded credentials', () => {
  const base = {
    serverUrl: 'https://keirost.example',
    ssid: 'Oficina',
    password: '12345678',
    caCert: '',
  };
  assert.equal(validateReaderSetup(base), '');
  for (const serverUrl of [
    'http://192.168.1.10:3000',
    'https://localhost',
    'https://127.0.0.1',
    'https://user:secret@keirost.example',
    'https://keirost.example/?token=x',
    'https://keirost.example/path',
  ]) {
    assert.notEqual(validateReaderSetup({ ...base, serverUrl }), '', serverUrl);
  }
  assert.notEqual(validateReaderSetup({ ...base, ssid: 'ñ'.repeat(17) }), '');
  assert.notEqual(validateReaderSetup({ ...base, password: '' }), '');
  assert.equal(validateReaderSetup({ ...base, password: '', openNetwork: true }), '');
});
