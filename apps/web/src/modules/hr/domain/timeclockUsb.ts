// USB setup stays in the browser: credentials are never sent to a logging service.
import { t } from '@/i18n/i18n';
export interface ReaderSerialPort {
  getInfo?(): { usbVendorId?: number; usbProductId?: number };
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  setSignals(signals: { dataTerminalReady: boolean; requestToSend: boolean }): Promise<void>;
  close(): Promise<void>;
}
export interface ReaderSerialApi {
  getPorts?(): Promise<ReaderSerialPort[]>;
  requestPort(options?: {
    filters: { usbVendorId: number; usbProductId: number }[];
  }): Promise<ReaderSerialPort>;
}
export async function selectReaderPort(serial: ReaderSerialApi): Promise<ReaderSerialPort> {
  const permitted = ((await serial.getPorts?.()) || []).filter((port) => {
    const info = port.getInfo?.();
    return info?.usbVendorId === 0x10c4 && info.usbProductId === 0xea60;
  });
  return permitted.length === 1
    ? permitted[0]
    : serial.requestPort({
        filters: [{ usbVendorId: 0x10c4, usbProductId: 0xea60 }],
      });
}
export interface ReaderUsbReply {
  protocol: string;
  id: string;
  ok: boolean;
  code?: string;
  firmware?: string;
  configured?: boolean;
  state?: string;
  wifi?: boolean;
  bootHeld?: boolean;
  cardCapture?: boolean;
  captureState?: 'waiting' | 'captured' | 'expired';
  uid?: string;
}
export interface ReaderSetup {
  serverUrl: string;
  ssid: string;
  password: string;
  caCert: string;
  openNetwork?: boolean;
}
export function validateReaderSetup(config: ReaderSetup): string {
  try {
    const url = new URL(config.serverUrl);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      return t('hrTime.usb.urlPlain');
    if (
      ['localhost', '[::1]', '0.0.0.0', '[::]', 'localhost.'].includes(url.hostname) ||
      url.hostname.startsWith('127.') ||
      url.hostname.endsWith('.localhost')
    )
      return t('hrTime.usb.urlLocalhost');
    if (config.serverUrl.length > 256) return t('hrTime.usb.urlTooLong');
    if (!/^[a-z0-9.-]+$/i.test(url.hostname) || !url.hostname.includes('.'))
      return t('hrTime.usb.urlHost');
  } catch {
    return t('hrTime.usb.urlRequired');
  }
  const bytes = (value: string) => new TextEncoder().encode(value).length;
  if (!config.ssid || bytes(config.ssid) > 32) return t('hrTime.usb.ssidRequired');
  if (!config.password && !config.openNetwork) return t('hrTime.usb.passwordRequired');
  if (config.password && (bytes(config.password) < 8 || bytes(config.password) > 63))
    return t('hrTime.usb.passwordLength');
  if (
    bytes(config.caCert) > 4096 ||
    (config.caCert && !config.caCert.includes('-----BEGIN CERTIFICATE-----'))
  )
    return t('hrTime.usb.certFormat');
  return '';
}
// Claves de i18n; se traducen al lanzar el error.
const deviceErrors: Record<string, string> = {
  BOOT_REQUIRED: 'hrTime.usb.device.bootRequired',
  INVALID_CONFIG: 'hrTime.usb.device.invalidConfig',
  STORAGE_ERROR: 'hrTime.usb.device.storageError',
  CAPTURE_BUSY: 'hrTime.usb.device.captureBusy',
  CAPTURE_INVALID: 'hrTime.usb.device.captureInvalid',
};
export type UsbConnectStage = 'select' | 'open' | 'handshake' | 'firmware';
export function connectionFailureMessage(error: unknown, stage: UsbConnectStage): string {
  const name = error instanceof Error ? error.name : '';
  if (stage === 'select')
    return name === 'NotFoundError'
      ? t('hrTime.usb.connect.noPort')
      : t('hrTime.usb.connect.selectDenied');
  if (stage === 'open') return t('hrTime.usb.connect.openFailed');
  if (stage === 'firmware') return t('hrTime.usb.connect.firmwareRequired');
  return t('hrTime.usb.connect.noHandshake');
}
export class ReaderUsbSession {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private pump: Promise<void> | null = null;
  private pending: {
    id: string;
    resolve: (r: ReaderUsbReply) => void;
    reject: (e: Error) => void;
  } | null = null;
  private opened = false;
  constructor(
    private port: ReaderSerialPort,
    private timeoutMs = 8000,
  ) {}
  async open() {
    await this.port.open({ baudRate: 115200 });
    this.opened = true;
    try {
      await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
      if (!this.port.readable || !this.port.writable) throw new Error(t('hrTime.usb.openFailed'));
      this.reader = this.port.readable.getReader();
      this.writer = this.port.writable.getWriter();
      this.pump = this.read();
    } catch (error) {
      await this.close();
      throw error;
    }
  }
  private async read() {
    const decoder = new TextDecoder();
    let line = '';
    let discard = false;
    try {
      while (this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        for (const ch of decoder.decode(value, { stream: true })) {
          if (ch === '\n') {
            if (!discard) {
              try {
                const reply = JSON.parse(line) as ReaderUsbReply;
                if (
                  reply.protocol === 'keirost-usb-v1' &&
                  reply.id === this.pending?.id &&
                  typeof reply.ok === 'boolean'
                ) {
                  const pending = this.pending;
                  this.pending = null;
                  if (reply.ok) pending?.resolve(reply);
                  else
                    pending?.reject(
                      new Error(t(deviceErrors[reply.code || ''] || 'hrTime.usb.device.rejected')),
                    );
                }
              } catch {
                /* Boot messages and diagnostic text are not protocol responses. */
              }
            }
            line = '';
            discard = false;
          } else if (!discard) {
            line += ch;
            if (line.length > 4096) {
              discard = true;
              line = '';
            }
          }
        }
      }
    } catch {
      /* Report a fixed message below; never echo serial data. */
    } finally {
      this.pending?.reject(new Error(t('hrTime.usb.disconnected')));
      this.pending = null;
    }
  }
  async request(
    command: 'hello' | 'status' | 'configure' | 'capture_start' | 'capture_poll' | 'capture_cancel',
    data: Record<string, unknown> = {},
  ): Promise<ReaderUsbReply> {
    if (!this.writer || !this.opened) throw new Error(t('hrTime.usb.connectFirst'));
    if (this.pending) throw new Error(t('hrTime.usb.busy'));
    const id = crypto.randomUUID();
    const bytes = new TextEncoder().encode(
      JSON.stringify({ ...data, protocol: 'keirost-usb-v1', id, command }) + '\n',
    );
    if (bytes.length > 8192) throw new Error(t('hrTime.usb.configTooLarge'));
    let timer: ReturnType<typeof setTimeout>;
    const response = new Promise<ReaderUsbReply>((resolve, reject) => {
      this.pending = { id, resolve, reject };
      timer = setTimeout(() => reject(new Error(t('hrTime.usb.timeout'))), this.timeoutMs);
    });
    let retry: ReturnType<typeof setTimeout> | undefined;
    const send = () => {
      if (this.pending?.id !== id || !this.writer) return;
      const outgoing = bytes.slice();
      void this.writer
        .write(outgoing)
        .then(() => {
          // Opening a serial port can reset the ESP32. Only the read-only hello
          // is repeated during boot, within the original request deadline.
          if (command === 'hello' && this.pending?.id === id) retry = setTimeout(send, 750);
        })
        .catch(() => {
          if (this.pending?.id === id)
            this.pending.reject(new Error(t('hrTime.usb.usbDisconnected')));
        })
        .finally(() => outgoing.fill(0));
    };
    try {
      send();
      return await response;
    } finally {
      clearTimeout(timer!);
      clearTimeout(retry);
      this.pending = null;
      bytes.fill(0);
    }
  }
  async close() {
    this.pending?.reject(new Error(t('hrTime.usb.usbDisconnected')));
    this.pending = null;
    if (this.reader) {
      await this.reader.cancel().catch(() => {});
      await this.pump;
      this.reader.releaseLock();
      this.reader = null;
    }
    this.writer?.releaseLock();
    this.writer = null;
    if (this.opened) await this.port.close().catch(() => {});
    this.opened = false;
  }
}

// The UID remains in this form until the operator explicitly saves the card.
// A cancelled/expired capture never supplies a UID to another employee.
export async function readCardUid(
  session: ReaderUsbSession,
  signal: AbortSignal,
  onWaiting: () => void,
): Promise<string> {
  const checkCancelled = () => {
    if (signal.aborted) throw new Error(t('hrTime.usb.readCancelled'));
  };
  checkCancelled();
  const hello = await session.request('hello');
  checkCancelled();
  if (hello.cardCapture !== true) throw new Error(t('hrTime.usb.updateForCapture'));
  const captureId = crypto.randomUUID();
  try {
    await session.request('capture_start', { captureId });
    checkCancelled();
    onWaiting();
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      checkCancelled();
      const reply = await session.request('capture_poll', { captureId });
      checkCancelled();
      if (reply.captureState === 'captured') {
        if (
          typeof reply.uid !== 'string' ||
          !/^(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/.test(reply.uid)
        )
          throw new Error(t('hrTime.usb.invalidCard'));
        return reply.uid;
      }
      if (reply.captureState === 'expired') break;
      if (reply.captureState !== 'waiting') throw new Error(t('hrTime.usb.invalidReply'));
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', finish);
          resolve();
        };
        const timer = setTimeout(finish, 250);
        signal.addEventListener('abort', finish, { once: true });
        if (signal.aborted) finish();
      });
    }
    throw new Error(t('hrTime.usb.noCard'));
  } finally {
    // Also cancel when start was accepted but its reply was lost.
    await session.request('capture_cancel', { captureId }).catch(() => {});
  }
}
