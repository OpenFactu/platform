import { apiClient, ApiError } from '@/shared/http';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, Loader2, ArrowLeft, CheckCircle2, ShieldAlert } from 'lucide-react';
import { KeirostLogo } from '../components/branding/KeirostLogo';
import { IsoField } from '../components/login/IsoField';

/**
 * Página pública para fijar una nueva contraseña a partir del token recibido
 * por email (`/reset-password?token=...`). Llama a `POST /api/auth/reset-password`.
 */
export const ResetPassword: React.FC = () => {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token') || '';
    setToken(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post(
        '/api/auth/reset-password',
        { token, newPassword: password },
        {
          auth: false,
        },
      );
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 0) {
        setError(((err.body as any)?.error as string) || 'El enlace no es válido o ha caducado');
      } else {
        setError('No se pudo establecer conexión con el servidor');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0A1628] font-sans relative overflow-hidden px-4">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A1628] via-[#0A1628] to-[#08524A]" />
        <IsoField />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A1628]/80 via-transparent to-[#0A1628]/40" />
      </div>

      <div className="w-full max-w-md space-y-6 animate-in fade-in zoom-in-95 duration-500 bg-white/95 dark:bg-[#1A2535]/90 backdrop-blur-md border border-white/40 dark:border-white/10 rounded-[4px] p-6 md:p-8 shadow-2xl relative z-10">
        <div className="flex flex-col items-center mb-2">
          <KeirostLogo size={48} variant="dark" className="mb-4" />
        </div>

        {done ? (
          <div className="space-y-5 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#0D9488]/10 flex items-center justify-center text-[#0D9488]">
              <CheckCircle2 size={28} />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-fg-default tracking-tight">
                Contraseña actualizada
              </h3>
              <p className="text-fg-muted font-medium text-sm">
                Ya puedes iniciar sesión con tu nueva contraseña. Te redirigimos…
              </p>
            </div>
          </div>
        ) : !token ? (
          <div className="space-y-5 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500">
              <ShieldAlert size={28} />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-fg-default tracking-tight">
                Enlace no válido
              </h3>
              <p className="text-fg-muted font-medium text-sm">
                Falta el token de recuperación. Solicita un nuevo enlace desde la pantalla de
                acceso.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/forgot-password')}
              className="w-full bg-[#0D9488] hover:bg-[#0A6E63] text-white font-bold py-3.5 rounded-[4px] transition-all"
            >
              Solicitar nuevo enlace
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-fg-default tracking-tight">
                Nueva contraseña
              </h3>
              <p className="text-fg-muted font-medium text-sm">
                Elige una contraseña segura para tu cuenta.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-4 bg-rose-50 dark:bg-rose-500/5 border border-rose-100 dark:border-rose-500/30 rounded-[4px] text-rose-600 dark:text-rose-300 text-sm font-bold flex items-center gap-3">
                  <ShieldAlert size={18} />
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-black text-fg-muted uppercase tracking-widest ml-1">
                  Nueva contraseña
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center text-fg-subtle group-focus-within:text-[#0D9488] transition-colors pointer-events-none">
                    <Lock size={18} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-bg-card border border-[#E2E8F0] dark:border-[#2D3A4A] rounded-[4px] py-3.5 pl-12 pr-12 text-[#0A1628] dark:text-slate-100 text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0D9488]/20 focus:border-[#0D9488] transition-all font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-4 flex items-center text-fg-subtle hover:text-[#0D9488] transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-fg-muted uppercase tracking-widest ml-1">
                  Repetir contraseña
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center text-fg-subtle group-focus-within:text-[#0D9488] transition-colors pointer-events-none">
                    <Lock size={18} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-bg-card border border-[#E2E8F0] dark:border-[#2D3A4A] rounded-[4px] py-3.5 pl-12 pr-4 text-[#0A1628] dark:text-slate-100 text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0D9488]/20 focus:border-[#0D9488] transition-all font-medium"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#0D9488] hover:bg-[#0A6E63] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-[4px] active:scale-[0.98] transition-all flex items-center justify-center gap-2 tracking-tight shadow-lg shadow-[#0D9488]/20"
              >
                {isSubmitting ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  'Guardar contraseña'
                )}
              </button>

              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full flex items-center justify-center gap-2 text-fg-muted hover:text-[#0D9488] font-bold text-sm"
              >
                <ArrowLeft size={16} /> Volver a iniciar sesión
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
