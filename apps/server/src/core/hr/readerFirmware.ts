import crypto from 'node:crypto';
import { fail } from './timeclockTypes';

export const FIRMWARE_REPOSITORY = 'OpenFactu/keirots';
export const FIRMWARE_BOARD = 'esp32-devkit-v1-rc522';
export type FirmwareAsset = {
  name: string;
  address: number;
  size: number;
  sha256: string;
  md5: string;
};
export type FirmwareRelease = { version: string; board: string; assets: FirmwareAsset[] };
export const validFirmwareVersion = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value);
export function parseFirmwareRelease(data: any): FirmwareRelease {
  if (
    !data ||
    !validFirmwareVersion(data.version) ||
    data.board !== FIRMWARE_BOARD ||
    !Array.isArray(data.assets) ||
    data.assets.length !== 3
  )
    throw new Error('Versión de firmware incompatible.');
  const expected = new Map([
    ['firmware.bin', [0x10000, 0x140000]],
    ['boot_app0.bin', [0xe000, 8192]],
    ['partitions.bin', [0x8000, 3072]],
  ]);
  for (const asset of data.assets) {
    const limits = expected.get(asset?.name);
    if (
      !limits ||
      asset.address !== limits[0] ||
      !Number.isInteger(asset.size) ||
      asset.size < 1024 ||
      asset.size > limits[1] ||
      (asset.name !== 'firmware.bin' && asset.size !== limits[1]) ||
      !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      !/^[a-f0-9]{32}$/.test(asset.md5)
    )
      throw new Error('Archivo de firmware inválido.');
    expected.delete(asset.name);
  }
  return {
    version: data.version,
    board: data.board,
    assets: data.assets.map((a: FirmwareAsset) => ({
      name: a.name,
      address: a.address,
      size: a.size,
      sha256: a.sha256,
      md5: a.md5,
    })),
  };
}
export function verifyFirmwareAsset(data: Buffer, asset: FirmwareAsset) {
  if (
    data.length !== asset.size ||
    crypto.createHash('sha256').update(data).digest('hex') !== asset.sha256 ||
    crypto.createHash('md5').update(data).digest('hex') !== asset.md5
  )
    throw new Error('La descarga del firmware no supera la comprobación de integridad.');
}
async function download(url: string, limit: number): Promise<Buffer> {
  // URLs are constructed solely from a fixed repository and validated release tags/names.
  // Never forward ERP cookies, tenant headers or device tokens to GitHub.
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Keirost-firmware-updater' },
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > limit)
    fail(503, 'FIRMWARE_UNAVAILABLE', 'No se puede descargar la versión publicada en GitHub.');
  const parts: Buffer[] = [];
  let size = 0;
  for await (const chunk of response.body as any) {
    size += chunk.length;
    if (size > limit) throw new Error('Descarga demasiado grande.');
    parts.push(Buffer.from(chunk));
  }
  return Buffer.concat(parts);
}
let latest: { at: number; release: FirmwareRelease } | undefined;
const releases = new Map<string, FirmwareRelease>();
const binaries = new Map<string, Buffer>();
export async function getFirmwareRelease(version?: string): Promise<FirmwareRelease> {
  if (version && !validFirmwareVersion(version)) fail(400, 'INVALID_INPUT', 'Versión inválida.');
  if (version && releases.has(version)) return releases.get(version)!;
  if (!version && latest && Date.now() - latest.at < 60000) return latest.release;
  const path = version ? `download/v${version}` : 'latest/download';
  const release = parseFirmwareRelease(
    JSON.parse(
      (
        await download(
          `https://github.com/${FIRMWARE_REPOSITORY}/releases/${path}/manifest.json`,
          8192,
        )
      ).toString('utf8'),
    ),
  );
  if (version && release.version !== version) throw new Error('La versión descargada no coincide.');
  if (releases.size >= 4) releases.delete(releases.keys().next().value!);
  releases.set(release.version, release);
  if (!version) latest = { at: Date.now(), release };
  return release;
}
export async function getFirmwareBinary(version: string, name: string) {
  const release = await getFirmwareRelease(version);
  const asset = release.assets.find((a) => a.name === name);
  if (!asset) fail(404, 'NOT_FOUND', 'Archivo de firmware no encontrado.');
  const key = `${version}/${name}/${asset.sha256}`;
  if (binaries.has(key)) return binaries.get(key)!;
  const data = await download(
    `https://github.com/${FIRMWARE_REPOSITORY}/releases/download/v${version}/${name}`,
    asset.size,
  );
  verifyFirmwareAsset(data, asset);
  if (binaries.size >= 6) binaries.delete(binaries.keys().next().value!);
  binaries.set(key, data);
  return data;
}
