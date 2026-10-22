import { useEffect, useRef, useState } from 'react';
import { Button } from '@openfactu/ui';
import { CreditCard } from 'lucide-react';
import {
  ReaderUsbSession,
  selectReaderPort,
  readCardUid,
  connectionFailureMessage,
  type ReaderSerialApi,
} from '../domain/timeclockUsb';

export function ReadCardButton({
  disabled,
  onRead,
  onReadingChange,
}: {
  disabled: boolean;
  onRead: (uid: string) => void;
  onReadingChange: (reading: boolean) => void;
}) {
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const operation = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current?.abort();
    };
  }, []);
  const serial = (navigator as Navigator & { serial?: ReaderSerialApi }).serial;
  const supported = window.isSecureContext && !!serial;
  const read = async () => {
    if (!serial || operation.current || disabled) return;
    const abort = new AbortController();
    operation.current = abort;
    setReading(true);
    onReadingChange(true);
    setError('');
    setMessage('Conectando con el lector…');
    let session: ReaderUsbSession | null = null;
    let stage: 'select' | 'open' | 'capture' = 'select';
    try {
      const port = await selectReaderPort(serial);
      if (abort.signal.aborted) return;
      stage = 'open';
      session = new ReaderUsbSession(port);
      await session.open();
      if (abort.signal.aborted) return;
      stage = 'capture';
      const uid = await readCardUid(session, abort.signal, () => {
        if (alive.current)
          setMessage(
            'Acerca una tarjeta al lector. Si ya está apoyada, retírala y vuelve a acercarla. Tienes 30 segundos.',
          );
      });
      if (alive.current && !abort.signal.aborted) {
        onRead(uid);
        setMessage('Tarjeta leída. Pulsa Guardar tarjeta para asignarla a este empleado.');
      }
    } catch (e) {
      if (alive.current && !abort.signal.aborted) {
        setMessage('');
        setError(
          stage === 'capture'
            ? e instanceof Error
              ? e.message
              : 'No se pudo leer la tarjeta.'
            : connectionFailureMessage(e, stage),
        );
      }
    } finally {
      await session?.close();
      operation.current = null;
      if (alive.current) {
        setReading(false);
        onReadingChange(false);
        if (abort.signal.aborted) setMessage('Lectura cancelada.');
      }
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || reading || !supported}
          onClick={() => void read()}
        >
          <CreditCard size={16} />
          {reading ? 'Leyendo tarjeta…' : 'Leer tarjeta'}
        </Button>
        {reading && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              operation.current?.abort();
              setMessage('Cancelando lectura…');
            }}
          >
            Cancelar lectura
          </Button>
        )}
      </div>
      <p className="text-xs text-fg-muted">
        {supported
          ? 'Conecta el lector por USB a este ordenador. Cierra su configuración USB y el monitor de Arduino. Esta lectura no identifica a nadie en el kiosco.'
          : 'Para leer por USB, abre esta pantalla en Chrome o Edge de escritorio mediante HTTPS. También puedes introducir el UID manualmente.'}
      </p>
      {message && (
        <p role="status" aria-live="polite" className="text-sm">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
