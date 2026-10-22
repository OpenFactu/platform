import { useEffect, useRef, useState } from 'react';
import { Button, Input } from '@openfactu/ui';
import { CheckCircle2, Eye, EyeOff, Usb, Wifi } from 'lucide-react';
import { timeclockManagementApi as api, type Reader } from '../api/timeclockManagementApi';
import {
  ReaderUsbSession,
  selectReaderPort,
  validateReaderSetup,
  connectionFailureMessage,
  type UsbConnectStage,
  type ReaderSerialApi,
  type ReaderSetup,
} from '../domain/timeclockUsb';

const states: Record<string, string> = {
  unconfigured: 'Conectado por USB. Falta guardar la configuración.',
  release_boot: 'Configuración guardada. Suelta BOOT para que el lector arranque.',
  wifi_connecting: 'Conectando a la red Wi-Fi…',
  syncing_clock: 'Preparando la conexión segura…',
  ready: 'El lector ha conectado con Keirost y está listo.',
  awaiting_confirmation: 'Tarjeta enviada. Confirma la acción en la pantalla del kiosco.',
  sending: 'Enviando la identificación al kiosco…',
  retrying: 'La respuesta se ha perdido. El lector está reintentando la misma identificación.',
  server_unavailable:
    'No se puede conectar con Keirost. Revisa la dirección, el certificado y la conexión.',
  unauthorized:
    'Keirost ha rechazado el acceso. Revisa que el lector esté activo y vuelve a configurarlo.',
  wrong_mode: 'Este firmware necesita un lector vinculado a un kiosco activo.',
  unknown_card: 'La tarjeta no está asignada a un empleado activo.',
  kiosk_busy_or_conflict:
    'La pantalla está ocupada o ha cambiado la configuración. Revisa el kiosco.',
  reading_rejected: 'La plataforma ha rechazado esta identificación.',
  reading_expired:
    'La respuesta no llegó a tiempo. Revisa el kiosco antes de volver a identificarte.',
  rate_limited: 'La plataforma ha pedido esperar. El lector respetará ese plazo.',
  invalid_response:
    'La respuesta de Keirost no es compatible. Revisa la dirección y la versión del servidor.',
  startup_error: 'El lector no pudo iniciar la conexión. Reinícialo y vuelve a intentarlo.',
  updating_firmware: 'Instalando la actualización. No desconectes el lector.',
  firmware_update_failed:
    'No se pudo instalar la actualización. El lector conserva la versión anterior.',
};

export function ReaderUsbSetup({
  reader,
  tenantId,
  initialToken,
  onClose,
  onConnected,
}: {
  reader: Reader;
  tenantId: string;
  initialToken?: string;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [state, setState] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [setup, setSetup] = useState<ReaderSetup>({
    serverUrl:
      window.location.protocol === 'https:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
        ? window.location.origin
        : '',
    ssid: '',
    password: '',
    caCert: '',
    openNetwork: false,
  });
  const serial = (navigator as Navigator & { serial?: ReaderSerialApi }).serial;
  const supported = window.isSecureContext && !!serial;
  const session = useRef<ReaderUsbSession | null>(null);
  const alive = useRef(true);
  const currentToken = useRef(initialToken || '');
  const busyRef = useRef(false);
  const notified = useRef(false);
  useEffect(() => {
    alive.current = true;
    currentToken.current = initialToken || '';
    return () => {
      alive.current = false;
      currentToken.current = '';
      void session.current?.close();
      session.current = null;
    };
  }, [initialToken]);
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(async () => {
      if (busyRef.current || !session.current) return;
      busyRef.current = true;
      try {
        const reply = await session.current.request('status');
        if (!alive.current) return;
        setState(reply.state || '');
        if (saved && reply.state === 'ready' && !notified.current) {
          notified.current = true;
          onConnected();
        }
      } catch {
        const lost = session.current;
        session.current = null;
        await lost?.close();
        if (alive.current) {
          setConnected(false);
          setState('');
          setError(
            'No se pudo consultar el lector. Si has desconectado el cable, vuelve a conectarlo.',
          );
        }
      } finally {
        busyRef.current = false;
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [connected, saved, onConnected]);

  const connect = async () => {
    if (!serial || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    let opened: ReaderUsbSession | null = null;
    let stage: UsbConnectStage = 'select';
    try {
      const port = await selectReaderPort(serial);
      if (!alive.current) return;
      opened = new ReaderUsbSession(port);
      session.current = opened;
      stage = 'open';
      await opened.open();
      stage = 'handshake';
      const reply = await opened.request('hello');
      stage = 'firmware';
      if (!reply.firmware || !/^0\.(2|3)\.\d+$/.test(reply.firmware)) throw new Error('FIRMWARE');
      if (!alive.current) {
        await opened.close();
        return;
      }
      setConnected(true);
      setState(reply.state || 'unconfigured');
    } catch (error) {
      await opened?.close();
      session.current = null;
      if (alive.current) setError(connectionFailureMessage(error, stage));
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session.current || busyRef.current) return;
    const validation = validateReaderSetup(setup);
    if (validation) {
      setError(validation);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      // Do not rotate a server token until the correct firmware is reachable.
      const check = await session.current.request('hello');
      if (!check.bootHeld) throw new Error('Mantén pulsado BOOT mientras guardas. No pulses EN.');
      if (!alive.current) return;
      if (!currentToken.current) currentToken.current = (await api.rotateReader(reader.id)).token;
      if (!alive.current) return;
      await session.current.request('configure', {
        ...setup,
        serverUrl: new URL(setup.serverUrl).origin,
        tenantId,
        deviceToken: currentToken.current,
      });
      if (!alive.current) return;
      setSaved(true);
      setState('release_boot');
      setShowPassword(false);
      setSetup((old) => ({ ...old, password: '' }));
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : 'No se pudo configurar el lector.');
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <section
      aria-label={`Configurar ${reader.name} por USB`}
      className="rounded-xl border border-border-subtle bg-bg-surface p-5 space-y-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-lg">Configurar {reader.name}</h3>
          <p className="text-sm text-fg-muted">
            Conecta el lector a este ordenador. Después funcionará por Wi-Fi.
          </p>
        </div>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          Cerrar
        </Button>
      </div>
      {!supported ? (
        <p role="alert" className="text-sm">
          Abre Keirost en Chrome o Edge de escritorio mediante HTTPS (o localhost en desarrollo)
          para configurar el lector por USB.
        </p>
      ) : !connected ? (
        <div className="space-y-3">
          <p className="text-sm">
            Cierra el monitor de Arduino si está abierto y selecciona el ESP32 conectado por USB.
          </p>
          <Button type="button" onClick={() => void connect()} disabled={busy}>
            <Usb size={16} />
            {busy ? 'Conectando…' : 'Conectar lector por USB'}
          </Button>
        </div>
      ) : (
        <form onSubmit={(e) => void save(e)} className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 size={16} />
            Lector conectado por USB
          </div>
          {!saved && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Nombre de la red Wi-Fi"
                  value={setup.ssid}
                  autoComplete="off"
                  required
                  disabled={busy}
                  onChange={(e) => setSetup({ ...setup, ssid: e.target.value })}
                />
                <Input
                  label="Contraseña Wi-Fi"
                  type={showPassword ? 'text' : 'password'}
                  value={setup.password}
                  autoComplete="new-password"
                  required={!setup.openNetwork}
                  disabled={busy || setup.openNetwork}
                  onChange={(e) => setSetup({ ...setup, password: e.target.value })}
                  rightIcon={
                    <button
                      type="button"
                      aria-label={
                        showPassword ? 'Ocultar contraseña Wi-Fi' : 'Mostrar contraseña Wi-Fi'
                      }
                      title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      disabled={busy || setup.openNetwork}
                      onClick={() => setShowPassword((visible) => !visible)}
                      className="flex items-center justify-center rounded p-1 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
                    >
                      {showPassword ? (
                        <EyeOff size={18} aria-hidden="true" />
                      ) : (
                        <Eye size={18} aria-hidden="true" />
                      )}
                    </button>
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!setup.openNetwork}
                  disabled={busy}
                  onChange={(e) => {
                    setSetup({ ...setup, openNetwork: e.target.checked, password: '' });
                    setShowPassword(false);
                  }}
                />
                La red no tiene contraseña
              </label>
              <p className="text-xs text-fg-muted">
                Usa una red de 2,4 GHz. La contraseña se envía al lector por USB y no se guarda en
                Keirost.
              </p>
              <Input
                label="Dirección de Keirost"
                type="url"
                placeholder="https://tu-keirost.example"
                value={setup.serverUrl}
                required
                disabled={busy}
                onChange={(e) => setSetup({ ...setup, serverUrl: e.target.value })}
              />
              <p className="text-xs text-fg-muted">
                Debe ser accesible desde el Wi-Fi del lector. La empresa y el acceso del dispositivo
                se configuran automáticamente.
              </p>
              <details>
                <summary className="cursor-pointer text-sm">
                  Certificado de una instalación privada
                </summary>
                <label className="block text-sm mt-3">
                  Certificado raíz de confianza (opcional)
                  <textarea
                    className="mt-1 w-full rounded-lg border border-border-subtle bg-transparent p-3 text-xs"
                    rows={4}
                    value={setup.caCert}
                    disabled={busy}
                    onChange={(e) => setSetup({ ...setup, caCert: e.target.value })}
                    placeholder="-----BEGIN CERTIFICATE-----"
                  />
                </label>
                <p className="text-xs text-fg-muted">
                  Déjalo vacío si Keirost usa un certificado público válido. No introduzcas una
                  clave privada.
                </p>
              </details>
              {!initialToken && (
                <p className="text-sm text-fg-muted">
                  Al guardar se renovará el acceso de este lector; su configuración anterior dejará
                  de funcionar.
                </p>
              )}
              <p className="text-sm">
                Mantén pulsado <strong>BOOT</strong> en la placa mientras guardas. Suéltalo cuando
                aparezca «Configuración guardada».
              </p>
              <Button type="submit" disabled={busy}>
                <Wifi size={16} />
                {busy ? 'Guardando…' : 'Guardar en el lector'}
              </Button>
            </>
          )}
          {saved && (
            <div className="space-y-3">
              <p className="text-sm">
                Configuración guardada. Suelta BOOT y espera a que el lector conecte con Keirost.
              </p>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setSaved(false);
                  setError('Introduce de nuevo la contraseña Wi-Fi para guardar la corrección.');
                  notified.current = false;
                }}
              >
                Corregir configuración
              </Button>
            </div>
          )}
        </form>
      )}
      {state && (
        <p role="status" aria-live="polite" className="text-sm">
          {states[state] || 'Comprobando el lector…'}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
