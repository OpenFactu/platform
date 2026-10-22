// USB setup stays in the browser: credentials are never sent to a logging service.
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
      return 'Usa la dirección HTTPS de Keirost, sin rutas ni credenciales.';
    if (
      ['localhost', '[::1]', '0.0.0.0', '[::]', 'localhost.'].includes(url.hostname) ||
      url.hostname.startsWith('127.') ||
      url.hostname.endsWith('.localhost')
    )
      return 'El lector necesita una dirección de Keirost accesible desde su Wi-Fi; localhost apunta al propio lector.';
    if (config.serverUrl.length > 256) return 'La dirección del servidor es demasiado larga.';
    if (!/^[a-z0-9.-]+$/i.test(url.hostname) || !url.hostname.includes('.'))
      return 'Usa un dominio o una dirección IPv4 accesible desde el lector.';
  } catch {
    return 'Introduce la dirección HTTPS de Keirost.';
  }
  const bytes = (value: string) => new TextEncoder().encode(value).length;
  if (!config.ssid || bytes(config.ssid) > 32)
    return 'Introduce el nombre de la red Wi-Fi (máximo 32 bytes).';
  if (!config.password && !config.openNetwork)
    return 'Introduce de nuevo la contraseña Wi-Fi o indica que la red no tiene contraseña.';
  if (config.password && (bytes(config.password) < 8 || bytes(config.password) > 63))
    return 'La contraseña Wi-Fi debe tener entre 8 y 63 bytes.';
  if (
    bytes(config.caCert) > 4096 ||
    (config.caCert && !config.caCert.includes('-----BEGIN CERTIFICATE-----'))
  )
    return 'El certificado de la instalación debe estar en formato PEM (máximo 4 KB).';
  return '';
}
const deviceErrors: Record<string, string> = {
  BOOT_REQUIRED: 'Mantén pulsado BOOT en el ESP32 al guardar. No pulses EN.',
  INVALID_CONFIG: 'El lector ha rechazado la configuración. Revisa la red y la dirección HTTPS.',
  STORAGE_ERROR: 'El lector no pudo guardar la configuración. Vuelve a intentarlo.',
  CAPTURE_BUSY:
    'El lector ya está leyendo una tarjeta. Cancela la lectura anterior o espera 30 segundos.',
  CAPTURE_INVALID: 'La sesión de lectura no es válida. Vuelve a pulsar Leer tarjeta.',
};
export type UsbConnectStage = 'select' | 'open' | 'handshake' | 'firmware';
export function connectionFailureMessage(error: unknown, stage: UsbConnectStage): string {
  const name = error instanceof Error ? error.name : '';
  if (stage === 'select')
    return name === 'NotFoundError'
      ? 'No se ha seleccionado un puerto. Marca la fila CP2102 (COM8) y pulsa Conectar.'
      : 'Chrome no ha permitido seleccionar el USB. Comprueba el permiso de puerto serie de esta página.';
  if (stage === 'open')
    return 'Chrome ha encontrado el lector, pero no puede abrir el puerto USB. Cierra el monitor serie de Visual Studio y cualquier otra pestaña conectada al lector.';
  if (stage === 'firmware')
    return 'El lector responde, pero necesita el firmware Keirost 0.2 para configurarse desde esta pantalla.';
  return 'El puerto USB está abierto, pero el lector no responde al saludo. Espera a que arranque y vuelve a conectar.';
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
      if (!this.port.readable || !this.port.writable)
        throw new Error('No se pudo abrir el lector.');
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
                      new Error(
                        deviceErrors[reply.code || ''] || 'El lector ha rechazado la operación.',
                      ),
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
      this.pending?.reject(new Error('El lector se ha desconectado. Conéctalo de nuevo.'));
      this.pending = null;
    }
  }
  async request(
    command: 'hello' | 'status' | 'configure' | 'capture_start' | 'capture_poll' | 'capture_cancel',
    data: Record<string, unknown> = {},
  ): Promise<ReaderUsbReply> {
    if (!this.writer || !this.opened) throw new Error('Conecta el lector por USB.');
    if (this.pending) throw new Error('Espera a que termine la operación anterior.');
    const id = crypto.randomUUID();
    const bytes = new TextEncoder().encode(
      JSON.stringify({ ...data, protocol: 'keirost-usb-v1', id, command }) + '\n',
    );
    if (bytes.length > 8192) throw new Error('La configuración es demasiado grande.');
    let timer: ReturnType<typeof setTimeout>;
    const response = new Promise<ReaderUsbReply>((resolve, reject) => {
      this.pending = { id, resolve, reject };
      timer = setTimeout(
        () =>
          reject(
            new Error(
              'El lector no responde. Comprueba que tiene el firmware de conexión de Keirost y cierra el monitor de Arduino.',
            ),
          ),
        this.timeoutMs,
      );
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
          if (this.pending?.id === id) this.pending.reject(new Error('Se ha desconectado el USB.'));
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
    this.pending?.reject(new Error('Se ha desconectado el USB.'));
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
    if (signal.aborted) throw new Error('Lectura cancelada.');
  };
  checkCancelled();
  const hello = await session.request('hello');
  checkCancelled();
  if (hello.cardCapture !== true)
    throw new Error(
      'Hay que actualizar el programa del lector a Keirost 0.2.1 o posterior para leer tarjetas aquí.',
    );
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
          throw new Error('El lector ha devuelto una tarjeta no válida. Vuelve a intentarlo.');
        return reply.uid;
      }
      if (reply.captureState === 'expired') break;
      if (reply.captureState !== 'waiting')
        throw new Error('El lector ha devuelto una respuesta no válida. Vuelve a intentarlo.');
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
    throw new Error('No se ha leído ninguna tarjeta en 30 segundos. Vuelve a intentarlo.');
  } finally {
    // Also cancel when start was accepted but its reply was lost.
    await session.request('capture_cancel', { captureId }).catch(() => {});
  }
}
