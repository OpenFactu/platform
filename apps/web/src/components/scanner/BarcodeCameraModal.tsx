import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, AlertTriangle } from 'lucide-react';
import { useScanner } from '../../context/ScannerContext';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Callback directo — si no se pasa, se despacha vía `ScannerContext`. */
  onScan?: (code: string) => void;
  /** Si true, NO cierra tras leer un código — permite escanear varios seguidos. */
  continuous?: boolean;
}

/**
 * Modal fullscreen con preview de cámara trasera y detección continua de
 * códigos de barras / QR usando `@zxing/browser` (carga perezosa).
 *
 * Al leer un código: vibra (si el dispositivo lo soporta), despacha al
 * handler activo del `ScannerContext` (o al `onScan` local) y se cierra.
 */
export const BarcodeCameraModal: React.FC<Props> = ({ open, onClose, onScan, continuous }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const { dispatch } = useScanner();

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let controls: { stop: () => void } | null = null;

    const start = async () => {
      setError(null);
      setLoading(true);
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (stopped) return;
        const reader = new BrowserMultiFormatReader();

        const video = videoRef.current;
        if (!video) return;

        let lastCode = '';
        let lastTs = 0;
        controls = await reader.decodeFromVideoDevice(undefined, video, (result, _err, ctrl) => {
          if (stopped) return;
          if (result) {
            const code = result.getText();
            const now = Date.now();
            // En modo continuo evitamos relecturas del mismo código en < 1.5s.
            if (continuous && code === lastCode && now - lastTs < 1500) return;
            lastCode = code;
            lastTs = now;
            if (navigator.vibrate) navigator.vibrate(60);
            if (onScan) onScan(code);
            else dispatch(code);
            if (continuous) {
              setLastScan(code);
              setScanCount((n) => n + 1);
              return; // no cierra
            }
            ctrl.stop();
            stopped = true;
            onClose();
          }
        });
        setLoading(false);
      } catch (e: any) {
        setError(
          e?.name === 'NotAllowedError'
            ? 'Permiso de cámara denegado. Concédelo en los ajustes del navegador.'
            : e?.message || 'No se pudo iniciar la cámara',
        );
        setLoading(false);
      }
    };

    start();

    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [open, onClose, onScan, dispatch]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100000] bg-black/90 flex flex-col">
      <div className="flex items-center justify-between p-4 text-white">
        <div className="flex items-center gap-2">
          <Camera size={18} className="text-accent" />
          <span className="font-bold text-sm">Escanear código</span>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xs hover:bg-white/10 transition-colors"
          aria-label="Cerrar"
        >
          <X size={22} />
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
        />
        {/* Marco de enfoque */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[80%] max-w-[400px] aspect-[4/3] border-2 border-accent/80 rounded-sm relative">
            <div className="absolute inset-x-0 top-1/2 h-px bg-accent animate-pulse" />
          </div>
        </div>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black/60 text-white px-4 py-2 rounded-sm text-sm font-mono">
              Iniciando cámara…
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-x-4 top-4 p-3 bg-rose-900/80 border border-rose-500/40 rounded-sm text-white text-sm flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <p className="text-center text-white/60 text-xs pb-6 px-4">
        {continuous
          ? `Escaneo continuo · ${scanCount} leído(s)${lastScan ? ` · último: ${lastScan}` : ''}`
          : 'Apunta al código. Detección automática · Formatos: EAN · Code-128 · QR'}
      </p>
    </div>
  );
};
