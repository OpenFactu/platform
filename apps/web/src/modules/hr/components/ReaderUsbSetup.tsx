import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Input, Alert, Textarea } from '@openfactu/ui';
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
import { useI18n } from '@/i18n/I18nContext';

// Estado que informa el lector → clave de i18n (se traduce al pintar).
const states: Record<string, string> = {
  unconfigured: 'hrTime.usbSetup.states.unconfigured',
  release_boot: 'hrTime.usbSetup.states.releaseBoot',
  wifi_connecting: 'hrTime.usbSetup.states.wifiConnecting',
  syncing_clock: 'hrTime.usbSetup.states.syncingClock',
  ready: 'hrTime.usbSetup.states.ready',
  awaiting_confirmation: 'hrTime.usbSetup.states.awaitingConfirmation',
  sending: 'hrTime.usbSetup.states.sending',
  retrying: 'hrTime.usbSetup.states.retrying',
  server_unavailable: 'hrTime.usbSetup.states.serverUnavailable',
  unauthorized: 'hrTime.usbSetup.states.unauthorized',
  wrong_mode: 'hrTime.usbSetup.states.wrongMode',
  unknown_card: 'hrTime.usbSetup.states.unknownCard',
  kiosk_busy_or_conflict: 'hrTime.usbSetup.states.kioskBusyOrConflict',
  reading_rejected: 'hrTime.usbSetup.states.readingRejected',
  reading_expired: 'hrTime.usbSetup.states.readingExpired',
  rate_limited: 'hrTime.usbSetup.states.rateLimited',
  invalid_response: 'hrTime.usbSetup.states.invalidResponse',
  startup_error: 'hrTime.usbSetup.states.startupError',
  updating_firmware: 'hrTime.usbSetup.states.updatingFirmware',
  firmware_update_failed: 'hrTime.usbSetup.states.firmwareUpdateFailed',
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
  const { t } = useI18n();
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
          setError(t('hrTime.usbSetup.statusFailed'));
        }
      } finally {
        busyRef.current = false;
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [connected, saved, onConnected, t]);

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
      if (!check.bootHeld) throw new Error(t('hrTime.usbSetup.holdBootError'));
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
        setError(e instanceof Error ? e.message : t('hrTime.usbSetup.configureFailed'));
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <section
      aria-label={t('hrTime.usbSetup.aria', { name: reader.name })}
      className="rounded-xl border border-border-subtle bg-bg-surface p-5 space-y-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-lg">
            {t('hrTime.usbSetup.title', { name: reader.name })}
          </h3>
          <p className="text-sm text-fg-muted">{t('hrTime.usbSetup.subtitle')}</p>
        </div>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          {t('hr.common.close')}
        </Button>
      </div>
      {!supported ? (
        <Alert tone="warning" role="alert">
          {t('hrTime.usbSetup.unsupported')}
        </Alert>
      ) : !connected ? (
        <div className="space-y-3">
          <p className="text-sm">{t('hrTime.usbSetup.connectHint')}</p>
          <Button type="button" onClick={() => void connect()} disabled={busy}>
            <Usb size={16} />
            {busy ? t('hrTime.usbSetup.connecting') : t('hrTime.usbSetup.connect')}
          </Button>
        </div>
      ) : (
        <form onSubmit={(e) => void save(e)} className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 size={16} />
            {t('hrTime.usbSetup.connected')}
          </div>
          {!saved && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label={t('hrTime.usbSetup.ssid')}
                  value={setup.ssid}
                  autoComplete="off"
                  required
                  disabled={busy}
                  onChange={(e) => setSetup({ ...setup, ssid: e.target.value })}
                />
                <Input
                  label={t('hrTime.usbSetup.password')}
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
                        showPassword
                          ? t('hrTime.usbSetup.hideWifiPassword')
                          : t('hrTime.usbSetup.showWifiPassword')
                      }
                      title={
                        showPassword
                          ? t('hrTime.usbSetup.hidePassword')
                          : t('hrTime.usbSetup.showPassword')
                      }
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
              <Checkbox
                checked={!!setup.openNetwork}
                disabled={busy}
                label={t('hrTime.usbSetup.openNetwork')}
                onChange={(v) => {
                  setSetup({ ...setup, openNetwork: v, password: '' });
                  setShowPassword(false);
                }}
              />
              <p className="text-xs text-fg-muted">{t('hrTime.usbSetup.wifiHint')}</p>
              <Input
                label={t('hrTime.usbSetup.serverUrl')}
                type="url"
                placeholder={t('hrTime.usbSetup.serverUrlPlaceholder')}
                value={setup.serverUrl}
                required
                disabled={busy}
                onChange={(e) => setSetup({ ...setup, serverUrl: e.target.value })}
              />
              <p className="text-xs text-fg-muted">{t('hrTime.usbSetup.serverUrlHint')}</p>
              <details>
                <summary className="cursor-pointer text-sm">
                  {t('hrTime.usbSetup.privateCert')}
                </summary>
                <label className="block text-sm mt-3">
                  {t('hrTime.usbSetup.rootCert')}
                  <Textarea
                    className="mt-1 text-xs"
                    rows={4}
                    value={setup.caCert}
                    disabled={busy}
                    onChange={(e) => setSetup({ ...setup, caCert: e.target.value })}
                    placeholder="-----BEGIN CERTIFICATE-----"
                  />
                </label>
                <p className="text-xs text-fg-muted">{t('hrTime.usbSetup.rootCertHint')}</p>
              </details>
              {!initialToken && (
                <p className="text-sm text-fg-muted">{t('hrTime.usbSetup.tokenRenewHint')}</p>
              )}
              <p className="text-sm">
                {t('hrTime.usbSetup.holdBootBefore')} <strong>BOOT</strong>{' '}
                {t('hrTime.usbSetup.holdBootAfter')}
              </p>
              <Button type="submit" disabled={busy}>
                <Wifi size={16} />
                {busy ? t('hrTime.usbSetup.saving') : t('hrTime.usbSetup.save')}
              </Button>
            </>
          )}
          {saved && (
            <div className="space-y-3">
              <p className="text-sm">{t('hrTime.usbSetup.saved')}</p>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setSaved(false);
                  setError(t('hrTime.usbSetup.reenterPassword'));
                  notified.current = false;
                }}
              >
                {t('hrTime.usbSetup.fix')}
              </Button>
            </div>
          )}
        </form>
      )}
      {state && (
        <p role="status" aria-live="polite" className="text-sm">
          {states[state] ? t(states[state]) : t('hrTime.usbSetup.checking')}
        </p>
      )}
      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
    </section>
  );
}
