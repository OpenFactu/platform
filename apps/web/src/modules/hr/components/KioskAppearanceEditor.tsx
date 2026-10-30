import { useEffect, useRef, useState } from 'react';
import { Button, Card, Input, Alert } from '@openfactu/ui';
import { CreditCard, Image, Palette } from 'lucide-react';
import { kiosksApi } from '../api/kiosksApi';
import {
  DEFAULT_KIOSK_APPEARANCE,
  prepareKioskImage,
  type KioskAppearance,
} from '../domain/kioskAppearance';
import type { Kiosk } from '../domain/kiosk';
import { useI18n } from '@/i18n/I18nContext';

export function KioskAppearanceEditor({ kiosk, onClose }: { kiosk: Kiosk; onClose: () => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<KioskAppearance>({ ...DEFAULT_KIOSK_APPEARANCE });
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    void kiosksApi
      .appearance(kiosk.id)
      .then((value) => {
        if (alive.current) {
          setDraft(value);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (alive.current) setError(t('hrTime.appearance.loadFailed'));
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
    return () => {
      alive.current = false;
    };
  }, [kiosk.id, t]);
  const change = (patch: Partial<KioskAppearance>) => {
    setDraft((old) => ({ ...old, ...patch }));
    setSaved(false);
  };
  const image = async (file: File | undefined, key: 'backgroundImage' | 'logoImage') => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const value = await prepareKioskImage(file, key);
      if (alive.current) change({ [key]: value });
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : t('hrTime.appearance.imageFailed'));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <Card
      title={t('hrTime.appearance.title', { name: kiosk.name })}
      subtitle={t('hrTime.appearance.subtitle')}
    >
      {loading ? (
        <p role="status">{t('hrTime.appearance.loading')}</p>
      ) : loaded ? (
        <form
          className="grid gap-8 lg:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError('');
            try {
              const value = await kiosksApi.saveAppearance(kiosk.id, draft);
              if (alive.current) {
                setDraft(value);
                setSaved(true);
              }
            } catch {
              if (alive.current) setError(t('hrTime.appearance.saveFailed'));
            } finally {
              if (alive.current) setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy} className="space-y-5 min-w-0">
            <Input
              label={t('hrTime.appearance.welcome')}
              value={draft.welcomeMessage}
              maxLength={120}
              required
              onChange={(e) => change({ welcomeMessage: e.target.value })}
            />
            <label className="flex items-center justify-between gap-3 text-sm">
              {t('hrTime.appearance.bgColor')}
              <input
                aria-label={t('hrTime.appearance.bgColor')}
                type="color"
                value={draft.backgroundColor}
                onChange={(e) => change({ backgroundColor: e.target.value })}
                className="h-10 w-16 cursor-pointer rounded border border-border-subtle bg-transparent p-1"
              />
            </label>
            {(['backgroundImage', 'logoImage'] as const).map((key) => (
              <div key={key} className="space-y-2">
                <label className="block text-sm font-medium">
                  {key === 'backgroundImage'
                    ? t('hrTime.appearance.bgImage')
                    : t('hrTime.appearance.logo')}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="mt-2 block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-bg-muted file:px-3 file:py-2 file:text-fg"
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0];
                      e.currentTarget.value = '';
                      void image(file, key);
                    }}
                  />
                </label>
                {draft[key] && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => change({ [key]: '' })}
                  >
                    {key === 'backgroundImage'
                      ? t('hrTime.appearance.removeBgImage')
                      : t('hrTime.appearance.removeLogo')}
                  </Button>
                )}
              </div>
            ))}
            <p className="text-xs text-fg-muted">{t('hrTime.appearance.imageHint')}</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.soundEnabled}
                onChange={(e) => change({ soundEnabled: e.target.checked })}
              />
              {t('hrTime.appearance.sound')}
            </label>
            <p className="text-xs text-fg-muted">{t('hrTime.appearance.soundHint')}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!draft.welcomeMessage.trim()}>
                {busy ? t('hrTime.appearance.saving') : t('hrTime.appearance.save')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDraft({ ...DEFAULT_KIOSK_APPEARANCE });
                  setSaved(false);
                }}
              >
                {t('hrTime.appearance.reset')}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                {t('hr.common.close')}
              </Button>
            </div>
          </fieldset>
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Palette size={16} />
              {t('hrTime.appearance.preview')}
            </p>
            <div
              className="relative isolate overflow-hidden rounded-xl border border-border-subtle text-white"
              style={{ backgroundColor: draft.backgroundColor }}
            >
              {draft.backgroundImage && (
                <img
                  src={draft.backgroundImage}
                  alt=""
                  className="absolute inset-0 -z-20 h-full w-full object-cover"
                />
              )}
              {draft.backgroundImage && <div className="absolute inset-0 -z-10 bg-slate-950/45" />}
              <div className="flex min-h-16 items-center justify-between gap-3 border-b border-white/10 bg-slate-950/80 px-5 py-4">
                {draft.logoImage ? (
                  <img
                    src={draft.logoImage}
                    alt={t('hrTime.appearance.logoAlt')}
                    className="h-9 max-w-32 object-contain"
                  />
                ) : (
                  <span className="font-semibold">{t('hrTime.kioskMode.brand')}</span>
                )}
                <span className="text-lg tabular-nums">09:41</span>
              </div>
              <div className="px-5 py-12 sm:px-8">
                <div className="space-y-5 rounded-xl border border-white/10 bg-slate-950/90 p-6">
                  <CreditCard size={38} className="text-emerald-400" />
                  <p className="break-words text-2xl font-semibold">
                    {draft.welcomeMessage || t('hrTime.kioskMode.defaultWelcome')}
                  </p>
                  <p className="text-sm text-slate-300">{t('hrTime.kioskMode.identifyHint')}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-center text-xs">
                    <span className="rounded border border-slate-600 bg-slate-800 p-3">
                      {t('hrTime.kioskMode.useQr')}
                    </span>
                    <span className="rounded border border-slate-600 bg-slate-800 p-3">
                      {t('hrTime.kioskMode.usePin')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <p className="flex items-start gap-2 text-xs text-fg-muted">
              <Image size={14} className="shrink-0" />
              {t('hrTime.appearance.darkPanelHint')}
            </p>
          </div>
        </form>
      ) : null}
      {error && (
        <Alert tone="danger" role="alert" className="mt-4">
          {error}
        </Alert>
      )}
      {saved && (
        <p role="status" className="mt-4 text-sm text-success">
          {t('hrTime.appearance.saved')}
        </p>
      )}
      {!loaded && (
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('hr.common.close')}
        </Button>
      )}
    </Card>
  );
}
