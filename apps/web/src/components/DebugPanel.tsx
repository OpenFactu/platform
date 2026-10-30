/**
 * Utilidades de desarrollo. Solo se renderiza si:
 *   1. El servidor está en modo debug (`/api/setup/status` devuelve `debugEnabled: true`).
 *   2. O el usuario añade `?debug=1` a la URL.
 *
 * Se abre solo con el atajo Ctrl+Shift+B (en Mac también Cmd+Shift+B): ya no
 * hay botón fijo, que tapaba la esquina de la pantalla. Es un `Drawer` de
 * @openfactu/ui con las acciones:
 *   - Simular escáner: inyecta un código como si lo hubiese leído un lector HID.
 *   - Reset setup: vacía tenants + config y vuelve al wizard.
 *   - Forzar setup: redirige con `?force=1` para mostrar el wizard sin tirar nada.
 *   - Re-seed geo: re-ejecuta seedGeo (países).
 *
 * No se muestra en producción salvo que se active explícitamente, para no
 * exponer botones destructivos a usuarios finales.
 */

import { coreApi, type RawResult } from '@/shared/api';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, ConfirmDialog, Drawer, Input } from '@openfactu/ui';
import { Bug, RotateCcw, Globe, ScanLine } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

export const DebugPanel: React.FC = () => {
  const [debugEnabled, setDebugEnabled] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scanCode, setScanCode] = useState('');
  const { t } = useI18n();
  const scanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const forceParam = new URLSearchParams(window.location.search).get('debug') === '1';
    coreApi
      .get<any>('/api/setup/status')
      .then((j) => setDebugEnabled(Boolean(j?.debugEnabled) || forceParam))
      .catch(() => setDebugEnabled(forceParam));
  }, []);

  // Atajo global Ctrl/Cmd+Shift+B → abre (o cierra) el panel y enfoca el input de escaneo
  useEffect(() => {
    if (!debugEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'B' || e.key === 'b')) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [debugEnabled]);

  const fireScan = () => {
    const code = scanCode.trim();
    if (!code) return;
    window.dispatchEvent(new CustomEvent('keirost:scan', { detail: code }));
    setScanCode('');
    setMsg(t('app.debug.injected', { code }));
    setErr(null);
  };

  if (!debugEnabled) return null;

  const call = async (label: string, action: () => Promise<RawResult>) => {
    setBusy(label);
    setMsg(null);
    setErr(null);
    try {
      const r = await action();
      const body = r.data ?? {};
      if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
      setMsg(body?.message || JSON.stringify(body));
    } catch (e: any) {
      setErr(e?.message || t('app.common.error'));
    } finally {
      setBusy(null);
    }
  };

  const resetSetup = () => call('reset', () => coreApi.raw('POST', '/api/setup/dev-reset', {}));

  const reseedGeo = () => call('geo', () => coreApi.raw('POST', '/api/geo/seed'));

  const forceWizard = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('force', '1');
    url.pathname = '/';
    window.location.href = url.toString();
  };

  return (
    <>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        side="right"
        size="sm"
        title="Debug"
        subtitle={t('app.debug.subtitle')}
        initialFocusRef={scanInputRef}
      >
        <div className="space-y-5">
          {/* Simulador de escáner — inyecta un código como si lo hubiese leído
              un lector HID o la cámara. */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-fg-muted">
              <ScanLine size={13} /> {t('app.debug.simulateScanner')}
              <span className="font-mono normal-case text-fg-subtle">Ctrl+Shift+B</span>
            </div>
            <div className="flex gap-2">
              <Input
                inputRef={scanInputRef}
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    fireScan();
                  }
                }}
                placeholder={t('app.debug.codePlaceholder')}
                containerClassName="flex-1 min-w-0"
              />
              <Button type="button" onClick={fireScan} disabled={!scanCode.trim()}>
                {t('app.debug.fire')}
              </Button>
            </div>
          </div>

          <Alert tone="warning">{t('app.debug.destructiveWarning')}</Alert>

          <div className="space-y-2">
            <Button
              type="button"
              variant="danger"
              className="w-full justify-start gap-2"
              onClick={() => setConfirmReset(true)}
              disabled={!!busy}
            >
              <RotateCcw size={14} />
              {busy === 'reset' ? t('app.debug.resetting') : t('app.debug.resetSetup')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-start gap-2"
              onClick={forceWizard}
              disabled={!!busy}
            >
              <Bug size={14} /> {t('app.debug.forceWizard')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-start gap-2"
              onClick={reseedGeo}
              disabled={!!busy}
            >
              <Globe size={14} />
              {busy === 'geo' ? t('app.debug.seeding') : t('app.debug.reseedGeo')}
            </Button>
          </div>

          {msg && (
            <Alert tone="success" role="status">
              {msg}
            </Alert>
          )}
          {err && (
            <Alert tone="danger" role="alert">
              {err}
            </Alert>
          )}
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmReset}
        tone="danger"
        title={t('app.debug.resetConfirmTitle')}
        message={t('app.debug.resetConfirmMessage')}
        confirmLabel={t('app.debug.resetConfirm')}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          setOpen(true);
          void resetSetup();
        }}
      />
    </>
  );
};
