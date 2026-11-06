/**
 * Inicio de sesión.
 *
 * Dos zonas: el formulario (siempre) y, en pantallas anchas, un panel de marca
 * con la aurora animada de `AuroraBackdrop`. Todo con controles de @openfactu/ui y
 * tokens del tema, para que respete el branding guardado de la última empresa
 * (ThemeContext lo aplica antes de iniciar sesión desde la caché local).
 *
 * Flujo: usuario/email → al salir del campo se piden sus empresas y su foto →
 * contraseña → si la cuenta tiene 2FA, el servidor lo pide y se muestra el
 * paso del código.
 */
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { apiClient, ApiError } from '@/shared/http';
import { login as loginRequest, type LoginResult } from './login/loginApi';
import { MfaStepContainer } from './login/LoginMfaStep';
import { LoginHandoffWait } from './login/LoginHandoffWait';
import { LoginSsoButtons } from './login/LoginSsoButtons';
import { readQueryParam, ssoErrorKey, stripQueryParams } from './login/ssoModel';
import { useSsoLogin } from './login/useSsoLogin';
import { EmailCodeContainer } from './login/LoginEmailCodeStep';
import { useLoginMethods } from './login/useLoginMethods';
import { usePasskeyLogin } from './login/usePasskeyLogin';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Avatar, Button, Input, PasswordInput, Select } from '@openfactu/ui';
import { ArrowRight, Building, KeyRound, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { KeirostLogo } from '../components/branding/KeirostLogo';
import { AuroraBackdrop } from '../components/login/AuroraBackdrop';
import { BrandShowcase } from '../components/login/BrandShowcase';
import { RememberedAccountPicker } from '../components/login/RememberedAccountPicker';
import {
  forgetAccount,
  loadRememberedAccounts,
  rememberAccount,
  type RememberedAccount,
} from '../components/login/rememberedAccounts';
import { useI18n } from '@/i18n/I18nContext';

const loginErrorMessage = (body: unknown): string | undefined =>
  typeof (body as { error?: unknown } | null)?.error === 'string'
    ? (body as { error: string }).error
    : undefined;

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [loginAvatarUrl, setLoginAvatarUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Reto del segundo paso: cuando existe, se pinta el formulario del código.
  const [mfa, setMfa] = useState<{
    challenge: string;
    methods: string[];
    passkeyElsewhere?: boolean;
    passkeyRpIds?: string[];
    user: { name?: string; email?: string; avatarImageUrl?: string | null };
  } | null>(null);
  const twoFactorRequired = !!mfa;
  // Código con el que el servidor devolvió de un proveedor de acceso único (`?ssoError=`).
  const [ssoErrorCode] = useState(() => readQueryParam('ssoError'));
  const [ssoErrorShown, setSsoErrorShown] = useState(true);
  useEffect(() => stripQueryParams('ssoError'), []);
  // Entrar con un código por correo: el usuario ya está escrito y se pasa a su paso.
  const [emailCodeFor, setEmailCodeFor] = useState<string | null>(null);

  // Acceso rápido: cuentas que ya entraron en este navegador. Elegir una
  // rellena usuario y empresa; la contraseña (y el 2FA) se siguen pidiendo.
  const [remembered, setRemembered] = useState<RememberedAccount[]>(loadRememberedAccounts);
  const [picked, setPicked] = useState<RememberedAccount | null>(null);
  const [otherAccount, setOtherAccount] = useState(false);
  const showPicker = remembered.length > 0 && !picked && !otherAccount && !twoFactorRequired;

  const pickAccount = (a: RememberedAccount) => {
    setPicked(a);
    setEmail(a.login);
    setTenants([{ id: a.tenantId, name: a.tenantName ?? '' }]);
    setSelectedTenant(a.tenantId);
    setLoginAvatarUrl(a.avatarUrl ?? null);
    setPassword('');
    setError(null);
  };
  const leavePickedAccount = () => {
    setPicked(null);
    setEmail('');
    setTenants([]);
    setSelectedTenant('');
    setLoginAvatarUrl(null);
    setPassword('');
    setError(null);
  };

  const { login } = useAuth();
  const methods = useLoginMethods(selectedTenant);
  const navigate = useNavigate();
  const { t } = useI18n();

  const fetchTenantsForUser = async (emailOrUsername: string) => {
    if (!emailOrUsername.trim()) {
      setTenants([]);
      setSelectedTenant('');
      setLoginAvatarUrl(null);
      return;
    }
    try {
      const data = await apiClient.get<any>(
        `/api/memberships/tenants-for-user?email=${encodeURIComponent(emailOrUsername)}`,
        { auth: false },
      );
      if (Array.isArray(data)) {
        setTenants(data);
        if (data.length === 1) setSelectedTenant(data[0].id);
        else setSelectedTenant('');
      }
    } catch {
      // Silencioso — no revelar si el usuario existe
    }
    // Foto de perfil (si la cuenta existe y tiene una) — mismo criterio de
    // "no revelar si el usuario existe": el endpoint siempre responde 200.
    try {
      const data = await apiClient.get<any>(
        `/api/auth/avatar-for-login?email=${encodeURIComponent(emailOrUsername)}`,
        { auth: false },
      );
      setLoginAvatarUrl(data?.avatarImageUrl || null);
    } catch {
      setLoginAvatarUrl(null);
    }
  };

  // Sesión conseguida (con o sin segundo paso): recordar la cuenta y entrar.
  const finishLogin = (data: LoginResult) => {
    // Recordar la cuenta para el acceso rápido (sin contraseña ni token).
    const tenantId = selectedTenant || data.user?.tenantId;
    // Con passkey no se escribió el usuario: se recuerda por el que devuelve el servidor.
    const accountLogin = email.trim() || data.user?.username || '';
    if (tenantId && accountLogin) {
      rememberAccount({
        login: accountLogin,
        name: data.user?.username || accountLogin,
        avatarUrl: data.user?.avatarImageUrl ?? loginAvatarUrl,
        tenantId,
        tenantName: tenants.find((t) => t.id === tenantId)?.name || data.user?.tenantName,
      });
    }
    if (!data.token) {
      setError(t('app.login.connectionError'));
      return;
    }
    login(data.token, data.user as unknown as Parameters<typeof login>[1]);
    navigate('/');
  };

  // Si la respuesta es un reto del segundo paso, lo abre y devuelve true.
  const openMfaIfNeeded = (data: LoginResult): boolean => {
    if (!data.challenge) return false;
    setMfa({
      challenge: data.challenge,
      methods: data.methods ?? ['totp'],
      passkeyElsewhere: data.passkeyElsewhere,
      passkeyRpIds: data.passkeyRpIds,
      user: data.user ?? { email },
    });
    return true;
  };

  const passkeyLogin = usePasskeyLogin((data) => {
    if (!openMfaIfNeeded(data)) finishLogin(data);
  });

  const sso = useSsoLogin({
    onDone: (data) => {
      if (!openMfaIfNeeded(data)) finishLogin(data);
    },
  });

  const startEmailCode = () => {
    if (!email.trim()) {
      setError(t('auth.email.needEmail'));
      return;
    }
    if (tenants.length > 1 && !selectedTenant) {
      setError(t('app.login.pickCompanyError'));
      return;
    }
    setError(null);
    setEmailCodeFor(email.trim());
  };

  const handleMfaExpired = useCallback(() => {
    setMfa(null);
    setEmailCodeFor(null);
    setPassword('');
    setError(t('auth.mfa.expired'));
  }, [t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tenants.length > 1 && !selectedTenant) {
      setError(t('app.login.pickCompanyError'));
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      const data = await loginRequest({ email, password, selectedTenantId: selectedTenant });

      // La contraseña es correcta pero el usuario tiene 2FA: pedimos el código.
      if (openMfaIfNeeded(data)) {
        setIsSubmitting(false);
        return;
      }

      finishLogin(data);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 0) {
        setError(loginErrorMessage(err.body) || t('app.login.invalidCredentials'));
      } else {
        setError(t('app.login.connectionError'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const tenantName = tenants.length === 1 ? tenants[0].name : null;

  return (
    <div className="min-h-dvh w-full flex bg-bg-app">
      {/* ── Formulario ── */}
      <main className="flex-1 lg:flex-none lg:w-[480px] flex flex-col bg-bg-card lg:border-r border-border-default">
        <header className="flex items-center gap-2.5 px-6 pt-6 sm:px-10 sm:pt-8">
          <KeirostLogo size={28} className="text-fg-default" />
          <span className="font-display text-base font-bold tracking-tight text-fg-default">
            Keirost
          </span>
          <LanguageSwitcher className="ml-auto" />
        </header>

        <div className="flex-1 flex items-center px-6 py-10 sm:px-10">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-sm mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500"
          >
            <div className="space-y-1.5">
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-fg-default">
                {twoFactorRequired
                  ? t('auth.mfa.title')
                  : emailCodeFor
                    ? t('auth.email.title')
                    : showPicker
                      ? t('app.login.pickAccountTitle')
                      : picked
                        ? t('app.login.hello', { name: picked.name })
                        : t('app.login.title')}
              </h1>
              {!twoFactorRequired && !emailCodeFor && (
                <p className="text-sm text-fg-muted">
                  {showPicker
                    ? t('app.login.pickAccountHint')
                    : picked
                      ? t('app.login.passwordHint')
                      : t('app.login.subtitle')}
                </p>
              )}
            </div>

            {error && (
              <Alert tone="danger" role="alert">
                {error}
              </Alert>
            )}

            {ssoErrorCode && ssoErrorShown && !error && (
              <Alert tone="danger" role="alert" onDismiss={() => setSsoErrorShown(false)}>
                {t(ssoErrorKey(ssoErrorCode))}
              </Alert>
            )}

            {sso.handoff ? (
              <>
                {sso.error && (
                  <Alert tone="danger" role="alert">
                    {sso.error}
                  </Alert>
                )}
                <LoginHandoffWait
                  confirmCode={sso.handoff.confirmCode}
                  description={t('auth.sso.desktopHint')}
                  onCancel={sso.cancel}
                />
              </>
            ) : mfa ? (
              <MfaStepContainer
                challenge={mfa.challenge}
                methods={mfa.methods}
                passkeyElsewhere={mfa.passkeyElsewhere}
                passkeyRpIds={mfa.passkeyRpIds}
                user={mfa.user}
                onDone={finishLogin}
                onExpired={handleMfaExpired}
                onNotYou={() => {
                  setMfa(null);
                  setEmailCodeFor(null);
                  setPassword('');
                  setError(null);
                }}
              />
            ) : emailCodeFor ? (
              <EmailCodeContainer
                email={emailCodeFor}
                tenantId={selectedTenant}
                onDone={(data) => {
                  if (!openMfaIfNeeded(data)) finishLogin(data);
                }}
                onBack={() => {
                  setEmailCodeFor(null);
                  setError(null);
                }}
              />
            ) : showPicker ? (
              <RememberedAccountPicker
                accounts={remembered}
                onPick={pickAccount}
                onForget={(a) => {
                  forgetAccount(a);
                  setRemembered(loadRememberedAccounts());
                }}
                onOtherAccount={() => setOtherAccount(true)}
              />
            ) : (
              <div className="space-y-4">
                {picked ? (
                  // Cuenta elegida: en lugar del campo, quién eres y en qué empresa.
                  <div className="flex items-center gap-3 rounded-[var(--k-radius-md)] border border-border-default bg-bg-muted p-3">
                    <Avatar src={picked.avatarUrl ?? undefined} name={picked.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-fg-default">
                        {picked.name}
                      </p>
                      <p className="truncate text-xs text-fg-muted">
                        {[picked.tenantName, picked.login].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <Button type="button" variant="link" size="sm" onClick={leavePickedAccount}>
                      {t('app.login.change')}
                    </Button>
                  </div>
                ) : (
                  <Input
                    label={t('app.login.userOrEmail')}
                    required
                    autoComplete="username"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={(e) => fetchTenantsForUser(e.target.value)}
                    placeholder={t('app.login.userPlaceholder')}
                    prefix={
                      loginAvatarUrl ? (
                        <Avatar src={loginAvatarUrl} name={email} size="xs" />
                      ) : (
                        <Mail size={16} />
                      )
                    }
                  />
                )}

                {tenants.length > 1 && (
                  <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                    <Select
                      label={t('app.login.company')}
                      required
                      value={selectedTenant}
                      onChange={setSelectedTenant}
                      placeholder={t('app.login.pickCompany')}
                      options={tenants.map((t) => ({ value: t.id, label: t.name }))}
                    />
                  </div>
                )}
                {tenantName && !picked && (
                  <div className="flex items-center gap-2.5 text-sm">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--k-radius-md)] bg-bg-muted text-fg-muted">
                      <Building size={16} />
                    </span>
                    <p className="min-w-0 truncate text-fg-muted">
                      {t('app.login.enteringCompany')}{' '}
                      <span className="font-medium text-fg-default">{tenantName}</span>
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <PasswordInput
                    label={t('app.login.password')}
                    required
                    autoFocus={!!picked}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => navigate('/forgot-password')}
                    >
                      {t('app.login.forgot')}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {!showPicker && !mfa && !emailCodeFor && !sso.handoff && (
              <Button
                type="submit"
                size="lg"
                className="w-full gap-2"
                isLoading={isSubmitting}
                disabled={isSubmitting}
              >
                {t('app.login.enter')}
                {!isSubmitting && <ArrowRight size={16} />}
              </Button>
            )}

            {!mfa && !emailCodeFor && !showPicker && !sso.handoff && methods.emailCode && (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="w-full gap-2"
                disabled={isSubmitting}
                onClick={startEmailCode}
              >
                <Mail size={16} />
                {t('auth.email.button')}
              </Button>
            )}

            {!mfa && !emailCodeFor && !sso.handoff && passkeyLogin.supported && (
              <div className="space-y-3">
                {passkeyLogin.error && (
                  <Alert tone="danger" role="alert">
                    {passkeyLogin.error}
                  </Alert>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="w-full gap-2"
                  isLoading={passkeyLogin.busy}
                  disabled={passkeyLogin.busy || isSubmitting}
                  onClick={() => void passkeyLogin.start(selectedTenant)}
                >
                  {!passkeyLogin.busy && <KeyRound size={16} />}
                  {t('auth.passkey.signIn')}
                </Button>
              </div>
            )}

            {!mfa && !emailCodeFor && !sso.handoff && (
              <LoginSsoButtons
                providers={methods.sso}
                busyId={sso.busyId}
                disabled={isSubmitting || passkeyLogin.busy}
                error={sso.error}
                onStart={(id) => void sso.start(id)}
              />
            )}
          </form>
        </div>

        <footer className="flex items-center justify-between gap-4 px-6 pb-6 sm:px-10 sm:pb-8 text-xs text-fg-subtle">
          {/* En móvil no hay panel de marca: lo mismo, en su propia página. */}
          <Button
            type="button"
            variant="link"
            size="sm"
            className="lg:hidden px-0 text-xs"
            onClick={() => navigate('/que-es-keirost')}
          >
            {t('app.login.whatIs')}
          </Button>
          <span className="max-lg:hidden">{t('app.about.bodyHighlight')}</span>
          <a
            href="https://docs.keirost.es"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-accent transition-colors"
          >
            {t('app.login.docs')}
          </a>
        </footer>
      </main>

      {/* ── Panel de marca (solo pantallas anchas) ── */}
      <aside className="hidden lg:flex relative flex-1 overflow-hidden bg-primary text-primary-fg">
        <AuroraBackdrop />
        <div className="relative mt-auto p-12 xl:p-16 max-w-xl">
          <BrandShowcase />
        </div>
      </aside>
    </div>
  );
};
