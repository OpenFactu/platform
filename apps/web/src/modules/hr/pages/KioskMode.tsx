import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Delete,
  QrCode,
  Timer,
  UserRound,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useKioskIdentification } from '../hooks/useKioskIdentification';
import { TimeclockActions } from '../components/TimeclockActions';
import { KioskQrScanner } from '../components/KioskQrScanner';
import { WORK_STATE_LABEL } from '../domain/timeclock';
import type { KioskConfig } from '../api/timeclockTerminalApi';
import './KioskMode.css';
import { useKioskAppearance } from '../hooks/useKioskAppearance';
import { useKioskSound } from '../hooks/useKioskSound';
import { KioskCountdownBar } from '../components/KioskCountdownBar';
import { useI18n } from '@/i18n/I18nContext';
import { formatDate, formatTime } from '@/i18n/format';

function loadConfig(): KioskConfig {
  const query = new URLSearchParams(window.location.search);
  if (query.get('token') && query.get('tenant'))
    return { token: query.get('token')!, tenant: query.get('tenant')! };
  try {
    return JSON.parse(sessionStorage.getItem('timeclock-kiosk-v1') || '{}');
  } catch {
    return { token: '', tenant: '' };
  }
}
export function KioskMode() {
  const { t } = useI18n();
  const [config] = useState(loadConfig);
  const [now, setNow] = useState(new Date());
  const [mode, setMode] = useState<'home' | 'pin' | 'qr'>('home');
  const [pin, setPin] = useState('');
  const { identification, busy, feedback, identify, confirm, cancel } =
    useKioskIdentification(config);
  const appearance = useKioskAppearance(config);
  const sound = useKioskSound(appearance.soundEnabled, identification?.identificationId, feedback);
  const remaining = identification
    ? Math.max(
        0,
        Math.min(
          30,
          Math.ceil((new Date(identification.expiresAt).getTime() - now.getTime()) / 1000),
        ),
      )
    : 0;
  useEffect(() => {
    if (config.token && config.tenant) {
      try {
        sessionStorage.setItem('timeclock-kiosk-v1', JSON.stringify(config));
      } catch {
        /* private browser */
      }
      window.history.replaceState(null, '', window.location.pathname);
    }
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [config]);
  const identifyPin = async () => {
    await identify('pin', pin);
    setPin('');
    setMode('home');
  };
  const identifyQr = (value: string) => {
    setMode('home');
    void identify('qr', value);
  };
  const configured = !!config.token && !!config.tenant;
  const button =
    'min-h-14 rounded-lg border border-slate-600 bg-slate-800 px-5 py-3 font-semibold hover:bg-slate-700 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300';
  return (
    <main
      className="relative isolate min-h-dvh text-white flex flex-col"
      style={{ backgroundColor: appearance.backgroundColor }}
    >
      {appearance.backgroundImage && (
        <img
          src={appearance.backgroundImage}
          alt=""
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
      )}
      {appearance.backgroundImage && <div className="absolute inset-0 -z-10 bg-slate-950/45" />}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 bg-slate-950/90 px-5 py-5 sm:px-10">
        <div className="flex items-center gap-3">
          {appearance.logoImage ? (
            <img
              src={appearance.logoImage}
              alt={t('hrTime.kioskMode.companyLogo')}
              className="h-12 max-w-40 object-contain"
            />
          ) : (
            <Timer size={28} className="text-emerald-400" />
          )}
          <h1 className="!text-white text-xl font-semibold">{t('hrTime.kioskMode.brand')}</h1>
        </div>
        {configured && appearance.soundEnabled && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void sound.toggle()}
              aria-pressed={sound.enabled}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-600 bg-slate-900 px-4 text-sm text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
            >
              {sound.enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              {sound.unavailable
                ? t('hrTime.kioskMode.retrySound')
                : sound.enabled
                  ? t('hrTime.kioskMode.mute')
                  : t('hrTime.kioskMode.enableSound')}
            </button>
            <button
              type="button"
              onClick={() => void sound.testSound()}
              className="min-h-11 rounded-lg px-3 text-sm text-slate-300 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
            >
              {t('hrTime.kioskMode.testSound')}
            </button>
          </div>
        )}
        <div className="text-right">
          <div className="text-3xl sm:text-4xl tabular-nums font-semibold">
            {formatTime(now, { hour: '2-digit', minute: '2-digit' })}
          </div>
          <p className="text-sm text-slate-400">
            {formatDate(now, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </header>
      <section className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-lg space-y-7 rounded-2xl border border-white/10 bg-slate-950/95 p-6 sm:p-8">
          {!configured ? (
            <div role="alert">
              <h2 className="!text-white text-2xl font-semibold">
                {t('hrTime.kioskMode.notConfigured')}
              </h2>
              <p className="mt-3 text-slate-300">{t('hrTime.kioskMode.notConfiguredHint')}</p>
            </div>
          ) : (
            <>
              {feedback && (
                <div
                  role={feedback.ok ? 'status' : 'alert'}
                  aria-live="polite"
                  className={`rounded-lg border px-5 py-4 ${feedback.ok ? 'border-emerald-600 text-emerald-200' : 'border-amber-600 text-amber-100'}`}
                >
                  {feedback.ok && <CheckCircle2 className="mb-2" />}
                  {feedback.message}
                </div>
              )}
              {identification ? (
                <>
                  <div className="space-y-3">
                    <div
                      key={identification.identificationId}
                      className="kiosk-recognized flex items-center gap-3"
                    >
                      <span className="kiosk-recognized-icon flex h-12 w-12 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10">
                        <UserRound className="text-emerald-400" size={26} aria-hidden="true" />
                      </span>
                      <p role="status" className="text-sm font-medium text-emerald-300">
                        {t('hrTime.kioskMode.recognized')}
                      </p>
                    </div>
                    <h2 className="!text-white text-3xl font-semibold break-words">
                      {identification.employeeName}
                    </h2>
                    <p className="text-lg text-slate-300">
                      {t(WORK_STATE_LABEL[identification.state])}
                    </p>
                    <p className="text-sm text-slate-400">{t('hrTime.kioskMode.choose')}</p>
                    <div
                      role="timer"
                      aria-live="off"
                      aria-label={t('hrTime.kioskMode.timerAria', { n: remaining })}
                      className={remaining <= 5 ? 'text-amber-300' : 'text-slate-300'}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2">
                          <Timer size={16} aria-hidden="true" />
                          {t('hrTime.kioskMode.timeLeft')}
                        </span>
                        <span className="font-semibold tabular-nums">
                          00:{String(remaining).padStart(2, '0')}
                        </span>
                      </div>
                      <KioskCountdownBar
                        key={identification.identificationId}
                        expiresAt={identification.expiresAt}
                        remaining={remaining}
                      />
                    </div>
                  </div>
                  <TimeclockActions
                    allowedActions={identification.allowedActions}
                    busy={busy || remaining <= 0}
                    onPunch={(kind) => {
                      setMode('home');
                      setPin('');
                      void confirm(kind);
                    }}
                    kiosk
                  />
                  <button
                    type="button"
                    className={button + ' w-full'}
                    disabled={busy}
                    onClick={() => {
                      setMode('home');
                      setPin('');
                      void cancel();
                    }}
                  >
                    {t('hrTime.kioskMode.cancelBack')}
                  </button>
                </>
              ) : mode === 'qr' ? (
                <>
                  <div className="space-y-2">
                    <h2 className="!text-white text-2xl font-semibold">
                      {t('hrTime.kioskMode.scanQr')}
                    </h2>
                    <p className="text-sm text-slate-400">{t('hrTime.kioskMode.scanQrHint')}</p>
                  </div>
                  <KioskQrScanner
                    onScan={identifyQr}
                    onClose={() => setMode('home')}
                    onUsePin={() => setMode('pin')}
                  />
                </>
              ) : mode === 'pin' ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void identifyPin();
                  }}
                  className="space-y-5"
                >
                  <label htmlFor="kiosk-pin" className="block text-2xl font-semibold">
                    {t('hrTime.kioskMode.enterPin')}
                  </label>
                  <input
                    id="kiosk-pin"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus
                    value={pin}
                    maxLength={8}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    className="w-full min-h-16 rounded-lg border border-slate-600 bg-slate-900 px-4 text-center text-3xl tracking-widest focus:outline-emerald-400"
                    disabled={busy}
                  />
                  <div className="grid grid-cols-3 gap-3">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'delete'].map(
                      (key) => (
                        <button
                          type="button"
                          disabled={busy}
                          key={key}
                          aria-label={
                            key === 'delete'
                              ? t('hrTime.kioskMode.deleteDigit')
                              : key === 'C'
                                ? t('hrTime.kioskMode.clearPin')
                                : key
                          }
                          className={button + ' text-2xl'}
                          onClick={() =>
                            setPin((p) =>
                              key === 'C'
                                ? ''
                                : key === 'delete'
                                  ? p.slice(0, -1)
                                  : (p + key).slice(0, 8),
                            )
                          }
                        >
                          {key === 'delete' ? <Delete className="mx-auto" /> : key}
                        </button>
                      ),
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={busy || pin.length < 4}
                    className="w-full min-h-14 rounded-lg bg-emerald-400 text-slate-950 font-semibold disabled:opacity-40"
                  >
                    {busy ? t('hrTime.kioskMode.checking') : t('hrTime.kioskMode.continue')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={button + ' w-full'}
                    onClick={() => {
                      setPin('');
                      setMode('home');
                    }}
                  >
                    {t('hrTime.qr.back')}
                  </button>
                </form>
              ) : (
                <>
                  <div
                    className="kiosk-card-signal"
                    data-state={feedback ? 'paused' : busy ? 'checking' : 'waiting'}
                    aria-hidden="true"
                  >
                    <span className="kiosk-card-halo" />
                    <div className="kiosk-card-face">
                      <CreditCard size={52} strokeWidth={1.5} />
                      <span className="kiosk-card-scan" />
                    </div>
                  </div>
                  <div>
                    <h2 className="!text-white text-3xl sm:text-4xl font-semibold">
                      {appearance.welcomeMessage}
                    </h2>
                    <p className="mt-4 text-lg text-slate-300">
                      {t('hrTime.kioskMode.identifyHint')}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      className={button + ' flex items-center justify-center gap-2'}
                      onClick={() => setMode('qr')}
                    >
                      <QrCode size={22} />
                      {t('hrTime.kioskMode.useQr')}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className={button}
                      onClick={() => setMode('pin')}
                    >
                      {t('hrTime.kioskMode.usePin')}
                    </button>
                  </div>
                  {busy && (
                    <p role="status" className="text-slate-300">
                      {t('hrTime.kioskMode.checkingId')}
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </section>
      <footer className="bg-slate-950/90 px-5 py-4 text-center text-xs text-slate-400">
        {t('hrTime.kioskMode.footer')}
      </footer>
    </main>
  );
}
export default KioskMode;
