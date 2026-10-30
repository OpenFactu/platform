import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CameraOff,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  ScanLine,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { t as translate } from '@/i18n/i18n';

function cameraError(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return translate('hrTime.qr.errors.notAllowed');
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return translate('hrTime.qr.errors.notFound');
  if (name === 'NotReadableError' || name === 'AbortError')
    return translate('hrTime.qr.errors.notReadable');
  return translate('hrTime.qr.errors.generic');
}

export function KioskQrScanner({
  onScan,
  onClose,
  onUsePin,
}: {
  onScan: (value: string) => void;
  onClose: () => void;
  onUsePin: () => void;
}) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const callback = useRef(onScan);
  const [status, setStatus] = useState<'starting' | 'ready' | 'error'>('starting');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [activeDevice, setActiveDevice] = useState('');
  const resetStatus = () => {
    setStatus('starting');
    setError('');
    setNotice('');
    setWaiting(false);
  };
  useEffect(() => {
    callback.current = onScan;
  }, [onScan]);
  useEffect(() => {
    let disposed = false;
    let controls: { stop: () => void } | undefined;
    let stream: MediaStream | undefined;
    let noticeTimer: ReturnType<typeof setTimeout> | undefined;
    const element = video.current;
    const waitingTimer = setTimeout(() => {
      if (!disposed) setWaiting(true);
    }, 8000);
    const stop = () => {
      controls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
    };
    const start = async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          setError(translate('hrTime.qr.errors.insecure'));
          setStatus('error');
          return;
        }
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        if (disposed || !element) return;
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (disposed) {
          stop();
          return;
        }
        const track = stream.getVideoTracks()[0];
        track?.addEventListener('ended', () => {
          if (!disposed) {
            setError(translate('hrTime.qr.errors.disconnected'));
            setStatus('error');
            stop();
          }
        });
        setActiveDevice(track?.getSettings().deviceId || '');
        void navigator.mediaDevices
          .enumerateDevices()
          .then((devices) => {
            if (!disposed) setCameras(devices.filter((device) => device.kind === 'videoinput'));
          })
          .catch(() => {
            /* Camera selection is optional. */
          });
        controls = await new BrowserQRCodeReader().decodeFromStream(
          stream,
          element,
          (result, _error, reader) => {
            if (disposed || !result) return;
            const text = result.getText();
            if (!/^ofc:timeclock:v1:[A-Za-z0-9_-]{43}$/.test(text)) {
              setNotice(translate('hrTime.qr.notTimeclockQr'));
              clearTimeout(noticeTimer);
              noticeTimer = setTimeout(() => {
                if (!disposed) setNotice('');
              }, 3500);
              return;
            }
            disposed = true;
            reader.stop();
            stop();
            callback.current(text);
          },
        );
        if (disposed) stop();
        else {
          clearTimeout(waitingTimer);
          setStatus('ready');
        }
      } catch (e) {
        stop();
        if (!disposed) {
          setError(cameraError(e));
          setStatus('error');
        }
      }
    };
    void start();
    return () => {
      disposed = true;
      clearTimeout(waitingTimer);
      clearTimeout(noticeTimer);
      stop();
    };
  }, [attempt, deviceId]);
  const button =
    'min-h-12 px-4 py-3 inline-flex items-center justify-center gap-2 border border-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300';
  return (
    <div className="space-y-5">
      <div className="relative aspect-[4/3] sm:aspect-video overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          aria-label={t('hrTime.qr.videoAria')}
          className={`absolute inset-0 w-full h-full object-cover ${status === 'ready' ? '' : 'invisible'}`}
        />
        {status === 'ready' ? (
          <>
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              aria-hidden="true"
            >
              <div className="relative h-[66%] aspect-square rounded-lg shadow-[0_0_0_100vmax_rgba(2,6,23,0.5)]">
                <span className="absolute -top-px -left-px w-8 h-8 border-t-[3px] border-l-[3px] border-emerald-300 rounded-tl-lg" />
                <span className="absolute -top-px -right-px w-8 h-8 border-t-[3px] border-r-[3px] border-emerald-300 rounded-tr-lg" />
                <span className="absolute -bottom-px -left-px w-8 h-8 border-b-[3px] border-l-[3px] border-emerald-300 rounded-bl-lg" />
                <span className="absolute -bottom-px -right-px w-8 h-8 border-b-[3px] border-r-[3px] border-emerald-300 rounded-br-lg" />
              </div>
            </div>
            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-slate-950/85 px-3 py-1.5 text-xs text-white">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {t('hrTime.qr.active')}
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center">
            {status === 'error' ? (
              <CameraOff size={32} className="text-slate-400" />
            ) : (
              <Camera size={32} className="text-emerald-300" />
            )}
            <p className="!text-white text-lg font-semibold">
              {status === 'error' ? t('hrTime.qr.unavailable') : t('hrTime.qr.opening')}
            </p>
            {status === 'starting' && (
              <>
                <LoaderCircle size={20} className="text-slate-400 motion-safe:animate-spin" />
                <p className="max-w-xs text-sm text-slate-400">
                  {waiting ? t('hrTime.qr.allowPrompt') : t('hrTime.qr.allowWhenAsked')}
                </p>
              </>
            )}
          </div>
        )}
      </div>
      <div
        role={status === 'error' ? 'alert' : 'status'}
        aria-live="polite"
        className="flex items-start gap-3 text-sm leading-relaxed"
      >
        {status === 'ready' && <ScanLine size={20} className="mt-0.5 shrink-0 text-emerald-300" />}
        <p className={error || notice ? 'text-amber-200' : 'text-slate-300'}>
          {error ||
            notice ||
            (status === 'ready' ? t('hrTime.qr.placeQr') : t('hrTime.qr.pinMeanwhile'))}
        </p>
      </div>
      {cameras.length > 1 && (
        <label className="block text-sm text-slate-300">
          {t('hrTime.qr.camera')}
          <select
            className="mt-2 block w-full min-h-12 rounded-lg border border-slate-600 bg-slate-900 px-3 text-white"
            value={deviceId || activeDevice}
            onChange={(e) => {
              resetStatus();
              setDeviceId(e.target.value);
            }}
          >
            {cameras.map((camera, index) => (
              <option key={camera.deviceId} value={camera.deviceId}>
                {camera.label || t('hrTime.qr.cameraN', { n: index + 1 })}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex flex-wrap gap-3">
        {status === 'error' && (
          <button
            type="button"
            className={button + ' bg-emerald-700 border-emerald-600'}
            onClick={() => {
              resetStatus();
              setAttempt((value) => value + 1);
            }}
          >
            <RefreshCw size={16} />
            {t('hrTime.qr.retry')}
          </button>
        )}
        <button type="button" className={button} onClick={onUsePin}>
          <KeyRound size={16} />
          {t('hrTime.qr.usePin')}
        </button>
        <button type="button" className={button + ' border-transparent'} onClick={onClose}>
          <ArrowLeft size={16} />
          {t('hrTime.qr.back')}
        </button>
      </div>
    </div>
  );
}
