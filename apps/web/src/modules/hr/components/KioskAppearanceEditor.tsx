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

export function KioskAppearanceEditor({ kiosk, onClose }: { kiosk: Kiosk; onClose: () => void }) {
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
        if (alive.current) setError('No se pudo cargar la configuración. Cierra y vuelve a abrir.');
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
    return () => {
      alive.current = false;
    };
  }, [kiosk.id]);
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
      if (alive.current) setError(e instanceof Error ? e.message : 'No se pudo leer la imagen.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <Card
      title={`Personalizar ${kiosk.name}`}
      subtitle="El aspecto se guarda para este kiosco en todas sus pantallas."
    >
      {loading ? (
        <p role="status">Cargando aspecto…</p>
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
              if (alive.current)
                setError('No se pudo guardar. Revisa los campos e inténtalo de nuevo.');
            } finally {
              if (alive.current) setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy} className="space-y-5 min-w-0">
            <Input
              label="Mensaje de bienvenida"
              value={draft.welcomeMessage}
              maxLength={120}
              required
              onChange={(e) => change({ welcomeMessage: e.target.value })}
            />
            <label className="flex items-center justify-between gap-3 text-sm">
              Color de fondo
              <input
                aria-label="Color de fondo"
                type="color"
                value={draft.backgroundColor}
                onChange={(e) => change({ backgroundColor: e.target.value })}
                className="h-10 w-16 cursor-pointer rounded border border-border-subtle bg-transparent p-1"
              />
            </label>
            {(['backgroundImage', 'logoImage'] as const).map((key) => (
              <div key={key} className="space-y-2">
                <label className="block text-sm font-medium">
                  {key === 'backgroundImage' ? 'Imagen de fondo' : 'Logo'}
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
                    Quitar {key === 'backgroundImage' ? 'imagen de fondo' : 'logo'}
                  </Button>
                )}
              </div>
            ))}
            <p className="text-xs text-fg-muted">
              JPG, PNG o WebP, hasta 5 MB. Las imágenes se adaptan automáticamente y se guardan en
              Keirost.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.soundEnabled}
                onChange={(e) => change({ soundEnabled: e.target.checked })}
              />
              Permitir avisos sonoros
            </label>
            <p className="text-xs text-fg-muted">
              En la pantalla del kiosco, pulsa «Activar sonido» una vez para permitir los avisos.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!draft.welcomeMessage.trim()}>
                {busy ? 'Guardando…' : 'Guardar aspecto'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDraft({ ...DEFAULT_KIOSK_APPEARANCE });
                  setSaved(false);
                }}
              >
                Restablecer diseño
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cerrar
              </Button>
            </div>
          </fieldset>
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Palette size={16} />
              Vista previa
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
                    alt="Logo del kiosco"
                    className="h-9 max-w-32 object-contain"
                  />
                ) : (
                  <span className="font-semibold">Fichaje</span>
                )}
                <span className="text-lg tabular-nums">09:41</span>
              </div>
              <div className="px-5 py-12 sm:px-8">
                <div className="space-y-5 rounded-xl border border-white/10 bg-slate-950/90 p-6">
                  <CreditCard size={38} className="text-emerald-400" />
                  <p className="break-words text-2xl font-semibold">
                    {draft.welcomeMessage || 'Acerca tu tarjeta'}
                  </p>
                  <p className="text-sm text-slate-300">
                    Identifícate para registrar tu entrada, salida o pausa.
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <span className="rounded border border-slate-600 bg-slate-800 p-3">
                      Usar mi QR
                    </span>
                    <span className="rounded border border-slate-600 bg-slate-800 p-3">
                      Usar mi PIN
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <p className="flex items-start gap-2 text-xs text-fg-muted">
              <Image size={14} className="shrink-0" />
              El panel oscuro mantiene los textos legibles sobre cualquier fondo.
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
          Aspecto guardado. El kiosco lo recibirá en un minuto; recarga su pantalla para verlo
          ahora.
        </p>
      )}
      {!loaded && (
        <Button type="button" variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      )}
    </Card>
  );
}
