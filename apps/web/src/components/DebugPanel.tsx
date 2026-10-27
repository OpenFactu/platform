/**
 * Utilidades de desarrollo. Solo se renderiza si:
 *   1. El servidor está en modo debug (`/api/setup/status` devuelve `debugEnabled: true`).
 *   2. O el usuario añade `?debug=1` a la URL.
 *
 * Un botón fijo abre un `Drawer` de @openfactu/ui con las acciones:
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

export const DebugPanel: React.FC = () => {
  const [debugEnabled, setDebugEnabled] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scanCode, setScanCode] = useState('');
  const scanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const forceParam = new URLSearchParams(window.location.search).get('debug') === '1';
    coreApi
      .get<any>('/api/setup/status')
      .then((j) => setDebugEnabled(Boolean(j?.debugEnabled) || forceParam))
      .catch(() => setDebugEnabled(forceParam));
  }, []);

  // Atajo global Ctrl+Shift+B → abre el panel y enfoca el input de escaneo
  useEffect(() => {
    if (!debugEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'B' || e.key === 'b')) {
        e.preventDefault();
        setOpen(true);
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
    setMsg(`Código inyectado: ${code}`);
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
      setErr(e?.message || 'Error');
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
      <div className="fixed bottom-4 right-4 max-md:bottom-20 z-40">
        <Button
          type="button"
          variant="accent"
          size="sm"
          className="rounded-full shadow-lg"
          onClick={() => setOpen(true)}
          title="Panel de debug (Ctrl+Shift+B)"
        >
          <Bug size={14} /> Debug
        </Button>
      </div>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        side="right"
        size="sm"
        title="Debug"
        subtitle="Utilidades de desarrollo"
        initialFocusRef={scanInputRef}
      >
        <div className="space-y-5">
          {/* Simulador de escáner — inyecta un código como si lo hubiese leído
              un lector HID o la cámara. */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-fg-muted">
              <ScanLine size={13} /> Simular escáner
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
                placeholder="Código + Enter"
                containerClassName="flex-1 min-w-0"
              />
              <Button type="button" onClick={fireScan} disabled={!scanCode.trim()}>
                Disparar
              </Button>
            </div>
          </div>

          <Alert tone="warning">
            Acciones destructivas — solo úsalas en desarrollo. Pondrán la app en estado inicial.
          </Alert>

          <div className="space-y-2">
            <Button
              type="button"
              variant="danger"
              className="w-full justify-start gap-2"
              onClick={() => setConfirmReset(true)}
              disabled={!!busy}
            >
              <RotateCcw size={14} />
              {busy === 'reset' ? 'Reseteando…' : 'Reset setup completo'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-start gap-2"
              onClick={forceWizard}
              disabled={!!busy}
            >
              <Bug size={14} /> Forzar wizard (?force=1)
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-start gap-2"
              onClick={reseedGeo}
              disabled={!!busy}
            >
              <Globe size={14} />
              {busy === 'geo' ? 'Sembrando…' : 'Re-cargar países / geografía'}
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
        title="¿Resetear setup completamente?"
        message={
          <>
            Va a borrar todos los tenants y sus schemas, todos los usuarios globales y el archivo de
            configuración. Los países (Country/Region/…) se conservan.
          </>
        }
        confirmLabel="Resetear"
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
