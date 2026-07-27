import { apiClient, ApiError } from '@/shared/http';
import React, { useEffect, useState } from 'react';
import { Timer, LogIn, LogOut, Coffee, RotateCcw, Delete, Check, AlertCircle } from 'lucide-react';

/**
 * KioskMode — pantalla pública sin chrome del ERP. Se accede vía
 * `/kiosk?token=<KIOSK_TOKEN>&tenant=<TENANT_ID>`. Los empleados
 * introducen su PIN personal en el numpad y pulsan el tipo de fichaje.
 *
 * El kiosko se autentica con `x-kiosk-token` en cada llamada; no requiere
 * login del ERP. Esta ruta queda fuera del MainLayout (definida en
 * App.tsx).
 *
 * Excepción deliberada al barrido de @openfactu/ui: los `<button>` de esta
 * pantalla son las teclas de un terminal táctil, no controles de formulario.
 * Cada uno define su propio alto (h-16/h-20), su rejilla y su respuesta al
 * toque (`active:scale-95`) sobre una superficie oscura fija que no usa los
 * tokens del tema del tenant; `Button` no aporta nada aquí y habría que
 * anularle todos los estilos.
 */
export const KioskMode: React.FC = () => {
  const [pin, setPin] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string; sub?: string } | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setToken(params.get('token') || '');
    setTenantId(params.get('tenant') || '');
  }, []);

  // Oculta scrollbars globales mientras el kiosko esté activo (la página es de altura
  // fija, no debe haber barras verdes laterales).
  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.documentElement.classList.add('scrollbar-hide');
    document.body.classList.add('scrollbar-hide');
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
      document.documentElement.classList.remove('scrollbar-hide');
      document.body.classList.remove('scrollbar-hide');
    };
  }, []);

  // Reloj que se actualiza cada segundo.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const press = (d: string) => {
    if (pin.length >= 8) return;
    setPin((p) => p + d);
    setFeedback(null);
  };
  const back = () => setPin((p) => p.slice(0, -1));
  const clear = () => setPin('');

  const punch = async (kind: 'in' | 'out' | 'break_start' | 'break_end') => {
    if (!pin) {
      setFeedback({ ok: false, msg: 'Introduce tu PIN' });
      return;
    }
    if (pin.length < 4) {
      setFeedback({ ok: false, msg: 'El PIN debe tener al menos 4 dígitos' });
      return;
    }
    if (!token) {
      setFeedback({
        ok: false,
        msg: 'Kiosko no configurado',
        sub: 'Falta el parámetro ?token= en la URL',
      });
      return;
    }
    setBusy(true);
    try {
      // El kiosko no tiene sesión: se autentica con su token propio + tenant.
      let d: any;
      let punchOk = true;
      try {
        d = await apiClient.post(
          '/api/hr/timeclock/kiosk/punch',
          { pin, kind },
          {
            auth: false,
            headers: { 'x-kiosk-token': token, 'x-tenant-id': tenantId },
          },
        );
      } catch (e) {
        if (e instanceof ApiError) {
          punchOk = false;
          d = e.body ?? { error: e.message };
        } else {
          throw e;
        }
      }
      if (!punchOk) {
        setFeedback({ ok: false, msg: d.error || 'Error' });
        setPin('');
        return;
      }
      const labels: Record<string, string> = {
        in: 'Entrada registrada',
        out: 'Salida registrada',
        break_start: 'Pausa iniciada',
        break_end: 'Vuelta de pausa',
      };
      setFeedback({
        ok: true,
        msg: labels[kind] || 'Fichaje registrado',
        sub: d.employeeName,
      });
      setPin('');
    } finally {
      setBusy(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const timeStr = now.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const dateStr = now
    .toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    .replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="fixed inset-0 overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex flex-col">
      {/* Header con reloj */}
      <div className="flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3">
          <Timer className="text-emerald-400" size={32} />
          <div>
            <div className="text-xl font-black tracking-tight">Fichaje</div>
            <div className="text-xs text-slate-400 capitalize">{dateStr}</div>
          </div>
        </div>
        <div className="text-5xl font-mono font-black tabular-nums tracking-tight text-emerald-400">
          {timeStr}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-8">
        <div className="w-full max-w-2xl">
          {/* PIN display */}
          <div className="text-center mb-6">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-3">
              Introduce tu PIN
            </div>
            <div className="flex justify-center gap-3">
              {Array.from({ length: 8 }).map((_, i) => {
                const filled = i < pin.length;
                return (
                  <div
                    key={i}
                    className={
                      'w-10 h-12 md:w-12 md:h-14 rounded-lg border-2 flex items-center justify-center text-2xl font-black transition-all ' +
                      (filled
                        ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300'
                        : i === pin.length
                          ? 'border-emerald-400/40 bg-slate-800/50'
                          : 'border-slate-700 bg-slate-800/30')
                    }
                  >
                    {filled ? '•' : ''}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-3 max-w-md mx-auto mb-6">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
              <button
                key={d}
                onClick={() => press(String(d))}
                className="h-16 md:h-20 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-700/80 active:scale-95 text-3xl font-black transition shadow-lg"
              >
                {d}
              </button>
            ))}
            <button
              onClick={clear}
              className="h-16 md:h-20 rounded-lg bg-slate-800 hover:bg-rose-600/80 text-rose-300 hover:text-white text-base font-bold transition shadow-lg"
              title="Limpiar"
            >
              C
            </button>
            <button
              onClick={() => press('0')}
              className="h-16 md:h-20 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-3xl font-black transition shadow-lg"
            >
              0
            </button>
            <button
              onClick={back}
              className="h-16 md:h-20 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 transition shadow-lg flex items-center justify-center"
              title="Borrar"
            >
              <Delete size={26} />
            </button>
          </div>

          {/* Acciones de fichaje */}
          <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
            <button
              onClick={() => punch('in')}
              disabled={busy}
              className="h-20 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 transition shadow-xl flex flex-col items-center justify-center gap-1"
            >
              <LogIn size={24} />
              <span className="text-base font-black">Entrada</span>
            </button>
            <button
              onClick={() => punch('out')}
              disabled={busy}
              className="h-20 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 transition shadow-xl flex flex-col items-center justify-center gap-1"
            >
              <LogOut size={24} />
              <span className="text-base font-black">Salida</span>
            </button>
            <button
              onClick={() => punch('break_start')}
              disabled={busy}
              className="h-16 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-50 transition shadow-lg flex items-center justify-center gap-2 text-amber-300"
            >
              <Coffee size={20} /> <span className="font-bold">Pausa</span>
            </button>
            <button
              onClick={() => punch('break_end')}
              disabled={busy}
              className="h-16 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-50 transition shadow-lg flex items-center justify-center gap-2 text-amber-300"
            >
              <RotateCcw size={20} /> <span className="font-bold">Vuelvo</span>
            </button>
          </div>

          {/* Feedback */}
          {feedback && (
            <div
              className={
                'mt-6 max-w-md mx-auto px-5 py-4 rounded-lg border-2 flex items-center gap-3 ' +
                (feedback.ok
                  ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-rose-400/40 bg-rose-500/10 text-rose-200')
              }
            >
              {feedback.ok ? (
                <Check size={24} className="flex-shrink-0" />
              ) : (
                <AlertCircle size={24} className="flex-shrink-0" />
              )}
              <div>
                <div className="font-bold">{feedback.msg}</div>
                {feedback.sub && <div className="text-sm opacity-80">{feedback.sub}</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="text-center text-[10px] text-slate-600 pb-4">
        Keirost ERP · Kiosko de fichaje
      </div>
    </div>
  );
};

export default KioskMode;
