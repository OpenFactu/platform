import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Progress, Alert } from '@openfactu/ui';
import type { Reader } from '../api/timeclockManagementApi';
import {
  firmwareApi,
  installReaderUsb,
  type FirmwareRelease,
  type ReaderFirmwareState,
} from '../domain/readerFirmware';
import type { ReaderSerialApi } from '../domain/timeclockUsb';
import { useI18n } from '@/i18n/I18nContext';
import { formatDateTime } from '@/i18n/format';
export function ReaderFirmwareUpdate({ reader, onClose }: { reader: Reader; onClose: () => void }) {
  const { t } = useI18n();
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
          setStateError(t('hrTime.firmwareUpdate.stateFailed'));
      });
  }, [reader.id, t]);
  useEffect(() => {
    mounted.current = true;
    void firmwareApi
      .latest()
      .then((value) => {
        if (mounted.current) setRelease(value);
      })
      .catch(() => {
        if (mounted.current) setError(t('hrTime.firmwareUpdate.githubFailed'));
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
  }, [refreshState, t]);
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
      if (mounted.current)
        setError(e instanceof Error ? e.message : t('hrTime.firmwareUpdate.updateFailed'));
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
    ? t('hrTime.firmwareUpdate.wifi.noState')
    : !stateLoaded
      ? t('hrTime.firmwareUpdate.wifi.loading')
      : !reader.isActive
        ? t('hrTime.firmwareUpdate.wifi.inactive')
        : !state.currentVersion
          ? t('hrTime.firmwareUpdate.wifi.noVersion')
          : status === 'pending'
            ? t('hrTime.firmwareUpdate.wifi.pending')
            : upToDate
              ? t('hrTime.firmwareUpdate.wifi.upToDate')
              : !release
                ? t('hrTime.firmwareUpdate.wifi.noRelease')
                : '';
  return (
    <Card
      title={t('hrTime.firmwareUpdate.title', { name: reader.name })}
      subtitle={t('hrTime.firmwareUpdate.subtitle')}
    >
      <div className="space-y-4">
        <p>
          {t('hrTime.firmwareUpdate.readerVersion')}{' '}
          <strong>
            {state.currentVersion ||
              (stateError
                ? t('hrTime.firmwareUpdate.notAvailable')
                : stateLoaded
                  ? t('hrTime.firmwareUpdate.waitingReader')
                  : t('hrTime.firmwareUpdate.querying'))}
          </strong>
        </p>
        <p>
          {t('hrTime.firmwareUpdate.publishedVersion')}{' '}
          <strong>{release?.version || t('hrTime.firmwareUpdate.querying')}</strong>
        </p>
        <p className="text-sm text-fg-muted">{t('hrTime.firmwareUpdate.keepsConfig')}</p>
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
            {t('hrTime.firmwareUpdate.updateUsb')}
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
            {upToDate
              ? t('hrTime.firmwareUpdate.wifiUpToDate')
              : t('hrTime.firmwareUpdate.updateWifi')}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void refreshState()}>
            {t('hrTime.firmwareUpdate.checkAgain')}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('hr.common.close')}
          </Button>
        </div>
        <p id="reader-wifi-update-status" role="status" className="text-sm text-fg-muted">
          {wifiUnavailable || t('hrTime.firmwareUpdate.wifiAvailable')}
        </p>
        {state.lastReportedAt && (
          <p className="text-xs text-fg-muted">
            {t('hrTime.firmwareUpdate.lastContact', {
              date: formatDateTime(state.lastReportedAt),
            })}
          </p>
        )}
        {contactMissing && !stateError && (
          <p role="status" className="text-warning">
            {t('hrTime.firmwareUpdate.noContact')}
          </p>
        )}
        {stateError && (
          <Alert tone="danger" role="alert">
            {stateError}
          </Alert>
        )}
        <p className="text-sm text-fg-muted">{t('hrTime.firmwareUpdate.usbHint')}</p>
        {busy && <Progress label={t('hrTime.firmwareUpdate.progress')} value={percent} showValue />}
        {message && <p role="status">{message}</p>}
        {status === 'pending' && (
          <div className="space-y-2">
            <p role="status">
              {t('hrTime.firmwareUpdate.pendingVersion', { version: state.update!.version })}
            </p>
            <p className="text-sm text-fg-muted">
              {contactMissing
                ? t('hrTime.firmwareUpdate.pendingNoContact')
                : t('hrTime.firmwareUpdate.pendingHint')}
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
              {t('hrTime.firmwareUpdate.cancelPending')}
            </Button>
            <p className="text-xs text-fg-muted">{t('hrTime.firmwareUpdate.cancelHint')}</p>
          </div>
        )}
        {status === 'installed' && (
          <p role="status" className="text-success">
            {t('hrTime.firmwareUpdate.installed', { version: state.update!.version })}
          </p>
        )}
        {status === 'failed' && (
          <Alert tone="danger" role="alert">
            {t('hrTime.firmwareUpdate.failed')}
          </Alert>
        )}
        {error && (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        )}
      </div>
    </Card>
  );
}
