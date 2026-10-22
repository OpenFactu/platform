import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
const hash = (bytes, type = 'sha256') => createHash(type).update(bytes).digest('hex');
const fixtures = new Map([
  ['firmware.bin', Buffer.alloc(1024, 0xe9)],
  ['boot_app0.bin', Buffer.alloc(8192, 0xff)],
  ['partitions.bin', Buffer.alloc(3072, 0xaa)],
]);
const release = {
  version: '0.3.0',
  board: 'esp32-devkit-v1-rc522',
  assets: [...fixtures].map(([name, bytes], i) => ({
    name,
    address: [65536, 57344, 32768][i],
    size: bytes.length,
    sha256: hash(bytes),
    md5: hash(bytes, 'md5'),
  })),
};
let wrongLayout = false,
  corrupt = false,
  writes = [],
  disconnected = false,
  connections = 0,
  bootVersion = '0.3.0';
class Transport {
  async disconnect() {
    disconnected = true;
  }
}
class ESPLoader {
  chip = { CHIP_NAME: 'ESP32' };
  async main() {
    connections++;
  }
  async readFlash(address, size) {
    assert.equal(address, 32768);
    assert.equal(size, 3072);
    return wrongLayout ? Buffer.alloc(3072) : fixtures.get('partitions.bin');
  }
  async writeFlash(options) {
    writes.push(options);
    options.reportProgress(0, 1024, 1024);
  }
  async after() {}
}
globalThis.__firmwareMocks = {
  apiClient: {
    getBlob: async (path) => ({
      blob: new Blob([corrupt ? Buffer.alloc(1024) : fixtures.get(path.split('/').at(-1))]),
    }),
  },
  selectReaderPort: async () => ({}),
  ReaderUsbSession: class {
    async open() {}
    async close() {}
    async request() {
      return { firmware: bootVersion };
    }
  },
  ESPLoader,
  Transport,
};
const source = readFileSync(
  new URL('../src/modules/hr/domain/readerFirmware.ts', import.meta.url),
  'utf8',
);
let { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
outputText = outputText
  .replace(/import\s*\{[^}]*\}\s*from ['"][^'"]+['"];?/g, '')
  .replace("await import('esptool-js')", 'globalThis.__firmwareMocks');
const prefix = 'const {apiClient,selectReaderPort,ReaderUsbSession}=globalThis.__firmwareMocks;\n';
const { installReaderUsb } = await import(
  `data:text/javascript;base64,${Buffer.from(prefix + outputText).toString('base64')}`
);
test('USB verifies layout, writes only app and boot selection, and confirms the booted version', async () => {
  const progress = [];
  await installReaderUsb(release, {}, (text, value) => progress.push(value));
  assert.deepEqual(
    writes.map((w) => w.fileArray[0].address),
    [65536, 57344],
  );
  assert.ok(writes.every((w) => w.eraseAll === false));
  assert.equal(writes[0].calculateMD5Hash(), release.assets[0].md5);
  assert.equal(disconnected, true);
  assert.equal(progress.at(-1), 100);
});
test('USB refuses mismatched partitions or a corrupted download before any flash writes', async () => {
  writes = [];
  wrongLayout = true;
  await assert.rejects(
    installReaderUsb(release, {}, () => {}),
    /distribución/,
  );
  assert.equal(writes.length, 0);
  wrongLayout = false;
  corrupt = true;
  const before = connections;
  await assert.rejects(
    installReaderUsb(release, {}, () => {}),
    /incompleta/,
  );
  assert.equal(connections, before);
  assert.equal(writes.length, 0);
  corrupt = false;
});
test('writing without a matching reboot response is never reported as installed', async () => {
  bootVersion = '0.2.1';
  const progress = [];
  await assert.rejects(
    installReaderUsb(release, {}, (_text, value) => progress.push(value)),
    /arranque/,
  );
  assert.ok(!progress.includes(100));
});
