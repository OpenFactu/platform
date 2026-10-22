import { apiClient } from '@/shared/http';
import { ReaderUsbSession, selectReaderPort, type ReaderSerialApi } from './timeclockUsb';
export interface FirmwareAsset {
  name: string;
  address: number;
  size: number;
  sha256: string;
  md5: string;
}
export interface FirmwareRelease {
  version: string;
  board: string;
  assets: FirmwareAsset[];
}
export interface ReaderFirmwareState {
  currentVersion?: string;
  board?: string;
  lastReportedAt?: string;
  update?: {
    id: string;
    version: string;
    status: 'pending' | 'installed' | 'failed' | 'cancelled';
  };
}
const base = '/api/hr/timeclock-devices';
export const firmwareApi = {
  latest: () => apiClient.get<FirmwareRelease>(`${base}/firmware/latest`),
  state: (id: string) => apiClient.get<ReaderFirmwareState>(`${base}/${id}/firmware`),
  request: (id: string, version: string) =>
    apiClient.post<ReaderFirmwareState>(`${base}/${id}/firmware`, { version }),
  cancel: (id: string) => apiClient.post<ReaderFirmwareState>(`${base}/${id}/firmware/cancel`),
};
const hash = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
function binaryString(bytes: Uint8Array) {
  let result = '';
  for (let at = 0; at < bytes.length; at += 8192)
    result += String.fromCharCode(...bytes.subarray(at, at + 8192));
  return result;
}
export async function installReaderUsb(
  release: FirmwareRelease,
  serial: ReaderSerialApi,
  progress: (text: string, percent: number) => void,
) {
  const port = await selectReaderPort(serial);
  if (
    release.board !== 'esp32-devkit-v1-rc522' ||
    !/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(release.version)
  )
    throw new Error('Firmware incompatible con este lector.');
  progress('Descargando y comprobando la versión…', 0);
  const files = new Map<string, { asset: FirmwareAsset; bytes: Uint8Array }>();
  const layout = [
    ['firmware.bin', 65536, 1310720],
    ['boot_app0.bin', 57344, 8192],
    ['partitions.bin', 32768, 3072],
  ] as const;
  for (const [name, address, max] of layout) {
    const asset = release.assets.find((a) => a.name === name);
    if (
      !asset ||
      asset.address !== address ||
      !Number.isInteger(asset.size) ||
      asset.size < 1024 ||
      asset.size > max ||
      !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      !/^[a-f0-9]{32}$/.test(asset.md5)
    )
      throw new Error('La versión publicada no tiene el formato esperado.');
    const { blob } = await apiClient.getBlob(`${base}/firmware/${release.version}/${name}`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length !== asset.size || (await hash(bytes)) !== asset.sha256)
      throw new Error('La descarga está incompleta o dañada. Vuelve a intentarlo.');
    files.set(name, { asset, bytes });
  }
  const { ESPLoader, Transport } = await import('esptool-js');
  const transport = new Transport(port as ConstructorParameters<typeof Transport>[0], false);
  const loader = new ESPLoader({
    transport,
    baudrate: 115200,
    romBaudrate: 115200,
    debugLogging: false,
    enableTracing: false,
    terminal: { clean() {}, write() {}, writeLine() {} },
  });
  let flashed = false;
  try {
    progress('Conectando con el ESP32. Si tarda, mantén BOOT hasta que empiece a escribir.', 0);
    await loader.main();
    if (loader.chip?.CHIP_NAME !== 'ESP32')
      throw new Error('Este firmware solo admite ESP32 DevKit V1.');
    progress('Comprobando que la configuración se puede conservar…', 0);
    const partition = files.get('partitions.bin')!;
    const current = await loader.readFlash(0x8000, partition.asset.size);
    if ((await hash(current)) !== partition.asset.sha256)
      throw new Error(
        'La distribución de memoria de esta placa es diferente. No se ha escrito ni borrado nada.',
      );
    const names = ['firmware.bin', 'boot_app0.bin'];
    const total = names.reduce((sum, name) => sum + files.get(name)!.bytes.length, 0);
    let done = 0;
    for (const name of names) {
      const { asset, bytes } = files.get(name)!;
      await loader.writeFlash({
        fileArray: [{ data: binaryString(bytes), address: asset.address }],
        flashSize: 'keep',
        flashMode: 'keep',
        flashFreq: 'keep',
        eraseAll: false,
        compress: true,
        calculateMD5Hash: () => asset.md5,
        reportProgress: (_index, written, size) =>
          progress(
            'Instalando. No desconectes el cable USB.',
            Math.min(99, Math.round(((done + (bytes.length * written) / size) / total) * 100)),
          ),
      });
      done += bytes.length;
    }
    flashed = true;
    progress('Firmware escrito y verificado. Reiniciando…', 99);
    await loader.after('hard_reset');
  } finally {
    if (!flashed) await loader.after('hard_reset').catch(() => {});
    await transport.disconnect().catch(() => {});
  }
  const session = new ReaderUsbSession(port);
  try {
    await session.open();
    const reply = await session.request('hello');
    if (reply.firmware !== release.version)
      throw new Error(
        'La escritura terminó, pero no se ha confirmado el arranque de la nueva versión. Reinicia y comprueba el lector.',
      );
    progress(`Versión ${release.version} instalada y arrancada.`, 100);
  } finally {
    await session.close();
  }
}
