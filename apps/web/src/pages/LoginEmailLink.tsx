/**
 * Enlace del correo de acceso (`/login/email?token=`). Pública: funciona sin sesión.
 * Sin handoff entra aquí; con handoff pide confirmar antes de dejar entrar al otro dispositivo.
 */
import React, { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Spinner } from '@openfactu/ui';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { KeirostLogo } from '../components/branding/KeirostLogo';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useI18n } from '@/i18n/I18nContext';
import { MfaStepContainer } from './login/LoginMfaStep';
import { deviceSummary, useEmailLink } from './login/useEmailLink';
import type { LoginResult } from './login/loginApi';

export const LoginEmailLink: React.FC = () => {
  const { t } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const onSession = useCallback(
    (data: LoginResult) => {
      if (!data.token) return;
      login(data.token, data.user as unknown as Parameters<typeof login>[1]);
      navigate('/');
    },
    [login, navigate],
  );
  const { state, approve, deny } = useEmailLink(token, onSession);
  const toLogin = () => navigate('/login');

  return (
    <div className="min-h-dvh w-full flex flex-col bg-bg-app">
      <header className="flex items-center gap-2.5 px-6 pt-6 sm:px-10 sm:pt-8">
        <KeirostLogo size={28} className="text-fg-default" />
        <span className="font-display text-base font-bold tracking-tight text-fg-default">
          Keirost
        </span>
        <LanguageSwitcher className="ml-auto" />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md space-y-5 rounded-[var(--k-radius-lg)] border border-border-default bg-bg-card p-6 sm:p-8">
          {state.kind === 'checking' && (
            <div className="flex items-center gap-3 text-sm text-fg-muted" role="status">
              <Spinner size="sm" label={t('auth.emailLink.checking')} />
              {t('auth.emailLink.checking')}
            </div>
          )}

          {state.kind === 'invalid' && (
            <>
              <Alert tone="danger" role="alert">
                {t('auth.emailLink.invalid')}
              </Alert>
              <Button type="button" className="w-full" onClick={toLogin}>
                {t('auth.emailLink.backToLogin')}
              </Button>
            </>
          )}

          {state.kind === 'mfa' && state.result.challenge && (
            <>
              <h1 className="font-display text-2xl font-bold tracking-tight text-fg-default">
                {t('auth.mfa.title')}
              </h1>
              <MfaStepContainer
                challenge={state.result.challenge}
                methods={state.result.methods ?? ['totp']}
                passkeyElsewhere={state.result.passkeyElsewhere}
                passkeyRpIds={state.result.passkeyRpIds}
                user={state.result.user ?? {}}
                onDone={onSession}
                onExpired={toLogin}
                onNotYou={toLogin}
              />
            </>
          )}

          {state.kind === 'approve' && (
            <>
              <div className="space-y-1.5">
                <h1 className="font-display text-2xl font-bold tracking-tight text-fg-default">
                  {t('auth.emailLink.approveTitle')}
                </h1>
                <p className="text-sm text-fg-muted">{t('auth.emailLink.approveHint')}</p>
              </div>

              <dl className="space-y-2 rounded-[var(--k-radius-md)] border border-border-default bg-bg-muted p-4 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-muted">{t('auth.emailLink.device')}</dt>
                  <dd className="text-right font-medium text-fg-default">
                    {state.info.clientKind === 'desktop'
                      ? t('auth.emailLink.desktopApp')
                      : (deviceSummary(state.info.userAgent) ?? t('auth.emailLink.unknownDevice'))}
                  </dd>
                </div>
                {state.info.ipHint && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-fg-muted">{t('auth.emailLink.ip')}</dt>
                    <dd className="text-right font-medium text-fg-default">{state.info.ipHint}</dd>
                  </div>
                )}
              </dl>

              <div className="rounded-[var(--k-radius-md)] border border-border-default p-4 text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                  {t('auth.emailLink.confirmCode')}
                </p>
                <p className="mt-1 break-all font-mono text-3xl font-bold tracking-widest text-fg-default sm:text-4xl">
                  {state.info.confirmCode}
                </p>
                <p className="mt-2 text-xs text-fg-subtle">{t('auth.emailLink.confirmHint')}</p>
              </div>

              {state.failed && (
                <Alert tone="danger" role="alert">
                  {t('auth.emailLink.approveFailed')}
                </Alert>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  size="lg"
                  className="w-full"
                  isLoading={state.approving}
                  disabled={state.approving}
                  onClick={() => void approve()}
                >
                  {t('auth.emailLink.approve')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="w-full"
                  disabled={state.approving}
                  onClick={deny}
                >
                  {t('auth.emailLink.deny')}
                </Button>
              </div>
            </>
          )}

          {state.kind === 'approved' && (
            <div className="space-y-3 text-center">
              <CheckCircle2 size={36} className="mx-auto text-success" />
              <h1 className="font-display text-2xl font-bold tracking-tight text-fg-default">
                {t('auth.emailLink.approved')}
              </h1>
              <p className="text-sm text-fg-muted">{t('auth.emailLink.approvedHint')}</p>
            </div>
          )}

          {state.kind === 'denied' && (
            <>
              <Alert tone="warning" role="status">
                {t('auth.emailLink.denied')}
              </Alert>
              <Button type="button" variant="secondary" className="w-full" onClick={toLogin}>
                {t('auth.emailLink.backToLogin')}
              </Button>
            </>
          )}
        </div>
      </main>
    </div>
  );
};
