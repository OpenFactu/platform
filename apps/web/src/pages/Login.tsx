/**
 * Inicio de sesión.
 *
 * Dos zonas: el formulario (siempre) y, en pantallas anchas, un panel de marca
 * con el campo isométrico animado. Todo con controles de @openfactu/ui y
 * tokens del tema, para que respete el branding guardado de la última empresa
 * (ThemeContext lo aplica antes de iniciar sesión desde la caché local).
 *
 * Flujo: usuario/email → al salir del campo se piden sus empresas y su foto →
 * contraseña → si la cuenta tiene 2FA, el servidor lo pide y se muestra el
 * paso del código.
 */
import { apiClient, ApiError } from '@/shared/http';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Avatar, Badge, Button, Input, PasswordInput, Select } from '@openfactu/ui';
import { ArrowLeft, ArrowRight, Building, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { KeirostLogo } from '../components/branding/KeirostLogo';
import { IsoField } from '../components/login/IsoField';

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

  const { login } = useAuth();
  const navigate = useNavigate();

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
      setError('Elige la empresa a la que quieres entrar');
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

      login(data.token, data.user);
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError && err.status !== 0) {
        setError(
          ((err.body as any)?.error as string) ||
            (twoFactorRequired
              ? 'Código 2FA inválido'
              : 'Credenciales incorrectas o empresa no válida'),
        );
      } else {
        setError('No se pudo establecer conexión con el servidor');
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
          <KeirostLogo size={32} variant="dark" />
          <span className="font-display text-base font-bold tracking-tight text-fg-default">
            Keirost
          </span>
        </header>

        <div className="flex-1 flex items-center px-6 py-10 sm:px-10">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-sm mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500"
          >
            <div className="space-y-1.5">
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-fg-default">
                {twoFactorRequired ? 'Verificación en dos pasos' : 'Inicia sesión'}
              </h1>
              <p className="text-sm text-fg-muted">
                {twoFactorRequired
                  ? 'Introduce el código de tu app de autenticación o uno de respaldo.'
                  : 'Accede con tu usuario o tu email de trabajo.'}
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
                  label="Código de verificación"
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
                  <ArrowLeft size={14} /> Volver
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <Input
                  label="Usuario o email"
                  required
                  autoComplete="username"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={(e) => fetchTenantsForUser(e.target.value)}
                  placeholder="admin o tu@empresa.com"
                  prefix={
                    loginAvatarUrl ? (
                      <Avatar src={loginAvatarUrl} name={email} size="xs" />
                    ) : (
                      <Mail size={16} />
                    )
                  }
                />

                {tenants.length > 1 && (
                  <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                    <Select
                      label="Empresa"
                      required
                      value={selectedTenant}
                      onChange={setSelectedTenant}
                      placeholder="Elige una empresa"
                      options={tenants.map((t) => ({ value: t.id, label: t.name }))}
                    />
                  </div>
                )}
                {tenantName && (
                  <Badge variant="neutral" className="gap-1.5">
                    <Building size={12} /> {tenantName}
                  </Badge>
                )}

                <div className="space-y-1.5">
                  <PasswordInput
                    label="Contraseña"
                    required
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
                      ¿Has olvidado tu contraseña?
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full gap-2"
              isLoading={isSubmitting}
              disabled={isSubmitting}
            >
              {twoFactorRequired ? 'Verificar' : 'Entrar'}
              {!isSubmitting && <ArrowRight size={16} />}
            </Button>
          </form>
        </div>

        <footer className="flex items-center justify-between gap-4 px-6 pb-6 sm:px-10 sm:pb-8 text-xs text-fg-subtle">
          <span>ERP de código abierto</span>
          <a
            href="https://docs.keirost.es"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-accent transition-colors"
          >
            Documentación
          </a>
        </footer>
      </main>

      {/* ── Panel de marca (solo pantallas anchas) ── */}
      <aside
        className="hidden lg:flex relative flex-1 overflow-hidden bg-primary text-primary-fg"
        aria-hidden="true"
      >
        <div className="absolute inset-0 opacity-60">
          <IsoField />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/40 to-transparent" />
        <div className="relative mt-auto p-12 xl:p-16 max-w-xl space-y-4">
          <h2 className="font-display text-4xl xl:text-5xl font-bold leading-[1.1] tracking-tight">
            Compras, ventas, stock y personas, en un solo sitio.
          </h2>
          <p className="text-base opacity-75 leading-relaxed">
            Cada empresa en su propio espacio, con sus datos aislados y su propia marca.
          </p>
        </div>
      </aside>
    </div>
  );
};
