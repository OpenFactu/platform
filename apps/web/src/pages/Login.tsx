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
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Avatar, Badge, Button, Input, PasswordInput, Select } from '@openfactu/ui';
import { ArrowLeft, ArrowRight, Building, Mail, ShieldCheck } from 'lucide-react';
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

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [loginAvatarUrl, setLoginAvatarUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [totpCode, setTotpCode] = useState('');

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tenants.length > 1 && !selectedTenant) {
      setError(t('app.login.pickCompanyError'));
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      const data = await apiClient.post<any>(
        '/api/auth/login',
        {
          email,
          password,
          selectedTenantId: selectedTenant,
          ...(twoFactorRequired ? { totpCode: totpCode.trim() } : {}),
        },
        { auth: false },
      );

      // La contraseña es correcta pero el usuario tiene 2FA: pedimos el código.
      if (data.twoFactorRequired) {
        setTwoFactorRequired(true);
        setIsSubmitting(false);
        return;
      }

      // Recordar la cuenta para el acceso rápido (sin contraseña ni token).
      const tenantId = selectedTenant || data.user?.tenantId;
      if (tenantId) {
        rememberAccount({
          login: email.trim(),
          name: data.user?.username || email.trim(),
          avatarUrl: data.user?.avatarImageUrl ?? loginAvatarUrl,
          tenantId,
          tenantName: tenants.find((t) => t.id === tenantId)?.name || data.user?.tenantName,
        });
      }
      login(data.token, data.user);
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError && err.status !== 0) {
        setError(
          ((err.body as any)?.error as string) ||
            (twoFactorRequired ? t('app.login.invalid2fa') : t('app.login.invalidCredentials')),
        );
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
                  ? t('app.login.twoFactorTitle')
                  : showPicker
                    ? t('app.login.pickAccountTitle')
                    : picked
                      ? t('app.login.hello', { name: picked.name })
                      : t('app.login.title')}
              </h1>
              <p className="text-sm text-fg-muted">
                {twoFactorRequired
                  ? t('app.login.twoFactorHint')
                  : showPicker
                    ? t('app.login.pickAccountHint')
                    : picked
                      ? t('app.login.passwordHint')
                      : t('app.login.subtitle')}
              </p>
            </div>

            {error && (
              <Alert tone="danger" role="alert">
                {error}
              </Alert>
            )}

            {twoFactorRequired ? (
              <div className="space-y-4">
                <Input
                  label={t('app.login.verificationCode')}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="123456"
                  prefix={<ShieldCheck size={16} />}
                  className="tracking-widest"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 -ml-2"
                  onClick={() => {
                    setTwoFactorRequired(false);
                    setTotpCode('');
                    setError(null);
                  }}
                >
                  <ArrowLeft size={14} /> {t('app.common.back')}
                </Button>
              </div>
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
                  <Badge variant="neutral" className="gap-1.5">
                    <Building size={12} /> {tenantName}
                  </Badge>
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

            {!showPicker && (
              <Button
                type="submit"
                size="lg"
                className="w-full gap-2"
                isLoading={isSubmitting}
                disabled={isSubmitting}
              >
                {twoFactorRequired ? t('app.login.verify') : t('app.login.enter')}
                {!isSubmitting && <ArrowRight size={16} />}
              </Button>
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
