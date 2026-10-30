import { apiClient } from '@/shared/http';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowLeft, Loader2, CheckCircle2, Send } from 'lucide-react';
import { KeirostLogo } from '../components/branding/KeirostLogo';
import { AuroraBackdrop } from '../components/login/AuroraBackdrop';
import { useI18n } from '@/i18n/I18nContext';

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
  const { t } = useI18n();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await apiClient.post('/api/auth/forgot-password', { email }, { auth: false });
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
        <AuroraBackdrop />
      </div>

      <div className="w-full max-w-md space-y-6 animate-in fade-in zoom-in-95 duration-500 bg-white/95 dark:bg-[#1A2535]/90 backdrop-blur-md border border-white/40 dark:border-white/10 rounded-[4px] p-6 md:p-8 shadow-2xl relative z-10">
        <div className="flex flex-col items-center mb-2">
          <KeirostLogo size={44} className="mb-4 text-fg-default" />
        </div>

        {sent ? (
          <div className="space-y-5 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#0D9488]/10 flex items-center justify-center text-[#0D9488]">
              <CheckCircle2 size={28} />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-fg-default tracking-tight">
                {t('app.forgot.checkEmail')}
              </h3>
              <p className="text-fg-muted font-medium text-sm leading-relaxed">
                {t('app.forgot.sentBefore')} <strong>{email}</strong> {t('app.forgot.sentAfter')}
              </p>
              <p className="text-fg-subtle text-xs pt-2">{t('app.forgot.notReceived')}</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full flex items-center justify-center gap-2 text-[#0D9488] hover:text-[#0A6E63] font-bold text-sm pt-2"
            >
              <ArrowLeft size={16} /> {t('app.forgot.backToLogin')}
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-fg-default tracking-tight">
                {t('app.forgot.title')}
              </h3>
              <p className="text-fg-muted font-medium text-sm">{t('app.forgot.subtitle')}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-fg-muted uppercase tracking-widest ml-1">
                  {t('app.forgot.email')}
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center text-fg-subtle group-focus-within:text-[#0D9488] transition-colors pointer-events-none">
                    <Mail size={18} />
                  </div>
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('app.forgot.emailPlaceholder')}
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
                  <>
                    {t('app.forgot.send')} <Send size={16} />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full flex items-center justify-center gap-2 text-fg-muted hover:text-[#0D9488] font-bold text-sm"
              >
                <ArrowLeft size={16} /> {t('app.forgot.backToLogin')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
