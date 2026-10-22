import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Progress } from '@openfactu/ui';
import type { Reader } from '../api/timeclockManagementApi';
import {
  firmwareApi,
  installReaderUsb,
  type FirmwareRelease,
  type ReaderFirmwareState,
} from '../domain/readerFirmware';
import type { ReaderSerialApi } from '../domain/timeclockUsb';
export function ReaderFirmwareUpdate({ reader, onClose }: { reader: Reader; onClose: () => void }) {
  const [release, setRelease] = useState<FirmwareRelease | null>(null);
  const [state, setState] = useState<ReaderFirmwareState>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [percent, setPercent] = useState(0);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [stateError, setStateError] = useState('');
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const mounted = useRef(true);
  const running = useRef(false);
  const stateRequest = useRef(0);
  const serial = (navigator as Navigator & { serial?: ReaderSerialApi }).serial;
  const refreshState = useCallback(() => {
    const request = ++stateRequest.current;
    return firmwareApi
      .state(reader.id)
      .then((value) => {
        if (mounted.current && request === stateRequest.current) {
          setState(value);
          setCheckedAt(Date.now());
          setStateLoaded(true);
          setStateError('');
        }
      })
      .catch(() => {
        if (mounted.current && request === stateRequest.current)
          setStateError('No se pudo consultar el estado del lector. Pulsa «Comprobar de nuevo».');
      });
  }, [reader.id]);
  useEffect(() => {
    mounted.current = true;
    void firmwareApi
      .latest()
      .then((value) => {
        if (mounted.current) setRelease(value);
      })
      .catch(() => {
        if (mounted.current)
          setError('No se pudo consultar GitHub. Comprueba la conexión y vuelve a abrir.');
      });
    void refreshState();
    const timer = setInterval(() => void refreshState(), 5000);
    const onFocus = () => void refreshState();
    window.addEventListener('focus', onFocus);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshState]);
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);
  const run = async (work: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    setPercent(0);
    try {
      await work();
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'No se pudo actualizar.');
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const status = state.update?.status;
  const lastContact = state.lastReportedAt ? Date.parse(state.lastReportedAt) : NaN;
  const contactMissing =
    stateLoaded && (!Number.isFinite(lastContact) || checkedAt - lastContact > 180000);
  const upToDate = !!(
    release &&
    state.currentVersion &&
    state.currentVersion.localeCompare(release.version, undefined, { numeric: true }) >= 0
  );
  const wifiUnavailable = stateError
    ? 'No se puede comprobar la actualización por Wi-Fi hasta recuperar el estado del lector.'
    : !stateLoaded
      ? 'Consultando la versión instalada…'
      : !reader.isActive
        ? 'Activa el lector para actualizarlo por Wi-Fi.'
        : !state.currentVersion
          ? 'Esperando que el lector comunique su versión por Wi-Fi. Déjalo encendido y conectado; puede tardar hasta un minuto. Si sigue sin aparecer, revisa su conexión con Keirost. Las versiones 0.2.x necesitan primero una actualización por USB.'
          : status === 'pending'
            ? 'Hay una actualización pendiente de confirmación.'
            : upToDate
              ? 'Ya tienes la última versión disponible. La actualización por Wi-Fi se habilitará cuando se publique una versión nueva.'
              : !release
                ? 'Esperando la versión publicada.'
                : '';
  return (
    <Card title={`Actualizar ${reader.name}`} subtitle="Versiones oficiales de OpenFactu/keirots">
      <div className="space-y-4">
        <p>
          Versión del lector:{' '}
          <strong>
            {state.currentVersion ||
              (stateError ? 'No disponible' : stateLoaded ? 'Esperando al lector' : 'Consultando…')}
          </strong>
        </p>
        <p>
          Versión publicada: <strong>{release?.version || 'Consultando…'}</strong>
        </p>
        <p className="text-sm text-fg-muted">
          Se conserva la configuración Wi-Fi, el certificado y el token. Durante la instalación el
          lector no estará disponible para fichar.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={
              busy || !release || !serial || !window.isSecureContext || status === 'pending'
            }
            onClick={() =>
              void run(async () => {
                await installReaderUsb(release!, serial!, (text, value) => {
                  if (mounted.current) {
                    setMessage(text);
                    setPercent(value);
                  }
                });
                await refreshState();
              })
            }
          >
            Actualizar por USB
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !!wifiUnavailable}
            aria-describedby="reader-wifi-update-status"
            onClick={() =>
              void run(async () => {
                setState(await firmwareApi.request(reader.id, release!.version));
              })
            }
          >
            {upToDate ? 'Wi-Fi: actualizado' : 'Actualizar por Wi-Fi'}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void refreshState()}>
            Comprobar de nuevo
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cerrar
          </Button>
        </div>
        <p id="reader-wifi-update-status" role="status" className="text-sm text-fg-muted">
          {wifiUnavailable || 'Actualización disponible por Wi-Fi.'}
        </p>
        {state.lastReportedAt && (
          <p className="text-xs text-fg-muted">
            Último contacto del lector: {new Date(state.lastReportedAt).toLocaleString('es-ES')}.
          </p>
        )}
        {contactMissing && !stateError && (
          <p role="status" className="text-warning">
            Sin contacto reciente con el lector. Comprueba que tiene alimentación y Wi-Fi, y que
            puede acceder a Keirost. Si ejecutas Keirost en este ordenador, debe permanecer
            encendido y sin suspensión.
          </p>
        )}
        {stateError && (
          <p role="alert" className="text-danger">
            {stateError}
          </p>
        )}
        <p className="text-sm text-fg-muted">
          USB: conecta el lector y cierra el monitor Arduino. Necesitas Chrome o Edge de escritorio.
          Para habilitar Wi-Fi en versiones 0.2.x, actualiza primero por USB.
        </p>
        {busy && <Progress label="Progreso de actualización" value={percent} showValue />}
        {message && <p role="status">{message}</p>}
        {status === 'pending' && (
          <div className="space-y-2">
            <p role="status">
              Versión {state.update!.version} pendiente de confirmación del lector.
            </p>
            <p className="text-sm text-fg-muted">
              {contactMissing
                ? 'La solicitud está guardada, pero falta la confirmación del lector. La espera no significa que esté descargando o instalando.'
                : 'El lector consulta las actualizaciones cada minuto. Mantén su alimentación y la conexión con Keirost hasta que confirme la nueva versión.'}
            </p>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setState(await firmwareApi.cancel(reader.id));
                })
              }
            >
              Cancelar actualización pendiente
            </Button>
            <p className="text-xs text-fg-muted">
              Cancelar no interrumpe una instalación que ya haya comenzado.
            </p>
          </div>
        )}
        {status === 'installed' && (
          <p role="status" className="text-success">
            El lector ha confirmado la versión {state.update!.version}.
          </p>
        )}
        {status === 'failed' && (
          <p role="alert" className="text-danger">
            El lector no pudo instalar la versión. Conserva la anterior; comprueba la conexión y
            vuelve a intentarlo.
          </p>
        )}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </div>
    </Card>
  );
}
