import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { parseFirmwareRelease, verifyFirmwareAsset, validFirmwareVersion } from '../readerFirmware';
import { applyFirmwareReport, type ReaderFirmwareState } from '../readerUpdates';
const asset = (name: string, address: number, size: number) => ({
  name,
  address,
  size,
  sha256: 'a'.repeat(64),
  md5: 'b'.repeat(32),
});
const release = () => ({
  version: '0.3.0',
  board: 'esp32-devkit-v1-rc522',
  assets: [
    asset('firmware.bin', 65536, 1000000),
    asset('boot_app0.bin', 57344, 8192),
    asset('partitions.bin', 32768, 3072),
  ],
});
test('release accepts only the fixed board, layout, sizes and filenames', () => {
  assert.equal(parseFirmwareRelease(release()).version, '0.3.0');
  for (const version of ['../main', '0.3.0/other', 'https://evil', '0.3'])
    assert.equal(validFirmwareVersion(version), false);
  for (const patch of [{ board: 'esp32-s3' }, { assets: [] }, { version: '../secret' }])
    assert.throws(() => parseFirmwareRelease({ ...release(), ...patch }));
  const bad = release();
  bad.assets[0].address = 0x9000;
  assert.throws(() => parseFirmwareRelease(bad), 'must not overwrite NVS');
  const duplicate = release();
  duplicate.assets[1] = duplicate.assets[0];
  assert.throws(() => parseFirmwareRelease(duplicate));
});
test('damaged or truncated downloads are rejected before installation', () => {
  const bytes = Buffer.from('verified firmware');
  const a = {
    ...asset('firmware.bin', 65536, bytes.length),
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    md5: crypto.createHash('md5').update(bytes).digest('hex'),
  };
  verifyFirmwareAsset(bytes, a);
  assert.throws(() => verifyFirmwareAsset(bytes.subarray(1), a));
  assert.throws(() => verifyFirmwareAsset(Buffer.alloc(bytes.length), a));
});
test('only the requested version proves OTA completion and failures match their job', () => {
  const state: ReaderFirmwareState = {
    currentVersion: '0.3.0',
    update: {
      id: 'job',
      version: '0.3.1',
      board: 'esp32-devkit-v1-rc522',
      sha256: 'a'.repeat(64),
      size: 1000000,
      status: 'pending',
      requestedAt: 'now',
    },
  };
  assert.equal(
    applyFirmwareReport(state, '0.3.0', state.update!.board, 'other').update?.status,
    'pending',
  );
  assert.equal(
    applyFirmwareReport(state, '0.3.0', state.update!.board, 'job').update?.status,
    'failed',
  );
  assert.equal(
    applyFirmwareReport(state, '0.3.1', state.update!.board, '').update?.status,
    'installed',
  );
  assert.equal(state.update?.status, 'pending');
});
