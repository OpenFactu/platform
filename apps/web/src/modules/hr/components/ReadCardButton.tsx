import { useEffect, useRef, useState } from 'react';
import { Button, Alert } from '@openfactu/ui';
import { CreditCard } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
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
  const { t } = useI18n();
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
    setMessage(t('hrTime.readCard.connecting'));
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
        if (alive.current) setMessage(t('hrTime.readCard.waiting'));
      });
      if (alive.current && !abort.signal.aborted) {
        onRead(uid);
        setMessage(t('hrTime.readCard.read'));
      }
    } catch (e) {
      if (alive.current && !abort.signal.aborted) {
        setMessage('');
        setError(
          stage === 'capture'
            ? e instanceof Error
              ? e.message
              : t('hrTime.readCard.readFailed')
            : connectionFailureMessage(e, stage),
        );
      }
    } finally {
      await session?.close();
      operation.current = null;
      if (alive.current) {
        setReading(false);
        onReadingChange(false);
        if (abort.signal.aborted) setMessage(t('hrTime.usb.readCancelled'));
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
          {reading ? t('hrTime.readCard.reading') : t('hrTime.readCard.readButton')}
        </Button>
        {reading && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              operation.current?.abort();
              setMessage(t('hrTime.readCard.cancelling'));
            }}
          >
            {t('hrTime.readCard.cancel')}
          </Button>
        )}
      </div>
      <p className="text-xs text-fg-muted">
        {supported ? t('hrTime.readCard.hintSupported') : t('hrTime.readCard.hintUnsupported')}
      </p>
      {message && (
        <p role="status" aria-live="polite" className="text-sm">
          {message}
        </p>
      )}
      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
    </div>
  );
}
