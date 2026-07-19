import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowLeft, Loader2, CheckCircle2, Send } from 'lucide-react';
import { KeirostLogo } from '../components/branding/KeirostLogo';
import { IsoField } from '../components/login/IsoField';

/**
 * Página pública de recuperación de contraseña. Pide el email y llama a
 * `POST /api/auth/forgot-password`. Por privacidad, la respuesta es siempre la
 * misma (no revela si el email existe).
 */
export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Silencioso — mostramos siempre la misma confirmación.
    } finally {
      setIsSubmitting(false);
      setSent(true);
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

        {sent ? (
          <div className="space-y-5 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#0D9488]/10 flex items-center justify-center text-[#0D9488]">
              <CheckCircle2 size={28} />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                Revisa tu correo
              </h3>
              <p className="text-slate-500 dark:text-slate-300 font-medium text-sm leading-relaxed">
                Si el email <strong>{email}</strong> corresponde a una cuenta, te hemos enviado un
                enlace para restablecer tu contraseña. Caduca en 1 hora.
              </p>
              <p className="text-slate-400 dark:text-slate-500 text-xs pt-2">
                ¿No lo recibes? Comprueba spam o pide a tu administrador que te lo restablezca.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full flex items-center justify-center gap-2 text-[#0D9488] hover:text-[#0A6E63] font-bold text-sm pt-2"
            >
              <ArrowLeft size={16} /> Volver a iniciar sesión
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                Recuperar contraseña
              </h3>
              <p className="text-slate-500 dark:text-slate-300 font-medium text-sm">
                Introduce tu email y te enviaremos un enlace para crear una nueva contraseña.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest ml-1">
                  Email
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center text-slate-400 dark:text-slate-500 group-focus-within:text-[#0D9488] transition-colors pointer-events-none">
                    <Mail size={18} />
                  </div>
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@empresa.com"
                    className="w-full bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-[#2D3A4A] rounded-[4px] py-3.5 pl-12 pr-4 text-[#0A1628] dark:text-slate-100 text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0D9488]/20 focus:border-[#0D9488] transition-all font-medium"
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
                  <>
                    Enviar enlace <Send size={16} />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 hover:text-[#0D9488] font-bold text-sm"
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
