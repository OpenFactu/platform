/**
 * Vuelta del acceso único (`/login/sso?ticket=`). Pública: canjea el ticket y entra, o pide el
 * segundo paso si la cuenta lo tiene.
 */
import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Spinner } from '@openfactu/ui';
import { useAuth } from '../context/AuthContext';
import { KeirostLogo } from '../components/branding/KeirostLogo';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useI18n } from '@/i18n/I18nContext';
import { MfaStepContainer } from './login/LoginMfaStep';
import { readQueryParam, safeReturnPath, ssoErrorKey } from './login/ssoModel';
import { useSsoTicket } from './login/useSsoTicket';
import type { LoginResult } from './login/loginApi';

export const LoginSso: React.FC = () => {
  const { t } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  // Ruta de vuelta: solo relativa y del propio origen.
  const [returnTo] = useState(() => safeReturnPath(readQueryParam('return')) ?? '/');

  const onSession = useCallback(
    (data: LoginResult) => {
      if (!data.token) return;
      login(data.token, data.user as unknown as Parameters<typeof login>[1]);
      navigate(returnTo);
    },
    [login, navigate, returnTo],
  );
  const state = useSsoTicket(onSession);
  // Recarga completa: vuelve al login con el estado limpio.
  const toLogin = () => window.location.assign('/login');

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
        <div className="w-full max-w-md min-w-0 space-y-5 rounded-[var(--k-radius-lg)] border border-border-default bg-bg-card p-6 sm:p-8">
          {state.kind === 'checking' && (
            <div className="flex items-center gap-3 text-sm text-fg-muted" role="status">
              <Spinner size="sm" label={t('auth.sso.checking')} />
              {t('auth.sso.checking')}
            </div>
          )}

          {state.kind === 'error' && (
            <>
              <Alert tone="danger" role="alert">
                {t(ssoErrorKey(state.code))}
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
        </div>
      </main>
    </div>
  );
};
