import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  Building,
  ChevronDown,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Globe,
  Check,
} from 'lucide-react';
import { KeirostLogo } from '../components/branding/KeirostLogo';
import { IsoField } from '../components/login/IsoField';
import { LiveFeed } from '../components/login/LiveFeed';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [loginAvatarUrl, setLoginAvatarUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tenantOpen, setTenantOpen] = useState(false);
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const tenantWrapperRef = useRef<HTMLDivElement>(null);

  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (tenantWrapperRef.current && !tenantWrapperRef.current.contains(e.target as Node)) {
        setTenantOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const fetchTenantsForUser = async (emailOrUsername: string) => {
    if (!emailOrUsername.trim()) {
      setTenants([]);
      setSelectedTenant('');
      setLoginAvatarUrl(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/memberships/tenants-for-user?email=${encodeURIComponent(emailOrUsername)}`,
      );
      const data = await res.json();
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
      const res = await fetch(
        `/api/auth/avatar-for-login?email=${encodeURIComponent(emailOrUsername)}`,
      );
      const data = await res.json();
      setLoginAvatarUrl(data?.avatarImageUrl || null);
    } catch {
      setLoginAvatarUrl(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          selectedTenantId: selectedTenant,
          ...(twoFactorRequired ? { totpCode: totpCode.trim() } : {}),
        }),
      });

      const data = await res.json();

      // La contraseña es correcta pero el usuario tiene 2FA: pedimos el código.
      if (res.ok && data.twoFactorRequired) {
        setTwoFactorRequired(true);
        setIsSubmitting(false);
        return;
      }

      if (res.ok) {
        login(data.token, data.user);
        navigate('/');
      } else {
        setError(
          data.error ||
            (twoFactorRequired
              ? 'Código 2FA inválido'
              : 'Credenciales incorrectas o empresa no válida'),
        );
      }
    } catch (err) {
      setError('No se pudo establecer conexión con el servidor');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-[#0A1628] font-sans relative md:overflow-hidden">
      {/* Fondo isométrico animado global — siempre visible */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A1628] via-[#0A1628] to-[#08524A]" />
        <IsoField />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A1628]/80 via-transparent to-[#0A1628]/40" />
      </div>

      {/* SECTION IZQUIERDA: Brand & Visual (solo en pantallas anchas) */}
      <div className="hidden md:flex md:w-2/5 relative overflow-hidden z-10">
        {/* Content Overlay */}
        <div className="relative z-10 w-full flex flex-col p-12 justify-between">
          <div className="flex items-center gap-3">
            <KeirostLogo size={48} variant="accent" />
            <span
              className="text-2xl font-bold text-white tracking-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Keirost <span className="k-shimmer-text">ERP</span>
            </span>
          </div>

          <div className="space-y-8 animate-in fade-in slide-in-from-left-8 duration-700">
            <div className="space-y-4">
              <h2
                className="text-5xl font-bold text-white leading-[1.1] tracking-tighter"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Gestión centralizada <br />
                <span className="k-shimmer-text">para empresas</span> inteligentes.
              </h2>
              <p className="text-lg text-slate-300 max-w-sm leading-relaxed font-medium">
                Optimiza tus compras, ventas y logística en una única plataforma Open Source de alto
                rendimiento.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 pt-4">
              <div className="flex items-start gap-4 group">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 border border-blue-500/20 group-hover:bg-blue-500 group-hover:text-white transition-all">
                  <Zap size={20} />
                </div>
                <div>
                  <h4 className="text-white font-bold text-sm">Rendimiento Real</h4>
                  <p className="text-slate-300 text-xs mt-1">
                    Lógica compartida y reactividad instantánea en todas tus operaciones.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 group">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 border border-emerald-500/20 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h4 className="text-white font-bold text-sm">Seguridad Multi-inquilino</h4>
                  <p className="text-slate-300 text-xs mt-1">
                    Aislamiento total de datos en esquemas dedicados de base de datos.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-10">
            <div className="flex items-center gap-2 text-[10px] font-mono tracking-[2px] uppercase text-white/50">
              <span className="w-8 h-px bg-white/30" />
              Actividad del sistema
            </div>
            <LiveFeed />
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-widest pt-4 border-t border-white/10">
              <span>v0.1.0-alpha</span>
              <div className="flex gap-4">
                <span className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer">
                  <Globe size={10} /> ES
                </span>
                <a
                  href="https://docs.keirost.es"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Documentación
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION DERECHA: Login Form */}
      <div className="flex-1 flex flex-col items-center justify-center md:justify-center px-4 py-8 md:p-8 relative z-10 min-h-screen md:min-h-0">
        <div className="w-full max-w-md space-y-6 md:space-y-8 animate-in fade-in zoom-in-95 duration-500 bg-white/95 dark:bg-[#1A2535]/90 backdrop-blur-md border border-white/40 dark:border-white/10 rounded-[4px] p-6 md:p-8 shadow-2xl my-auto">
          <div className="lg:hidden flex flex-col items-center mb-8">
            <KeirostLogo size={56} variant="dark" className="mb-4" />
            <h1
              className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Keirost <span className="text-teal-600">ERP</span>
            </h1>
          </div>

          <div className="space-y-2">
            <h3 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              Iniciar Sesión
            </h3>
            <p className="text-slate-500 dark:text-slate-300 font-medium">
              Introduce tus credenciales para acceder al ERP.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-rose-50 dark:bg-rose-500/5 border border-rose-100 dark:border-rose-500/30 rounded-[4px] text-rose-600 dark:text-rose-300 text-sm font-bold flex items-center gap-3 animate-in shake duration-300">
                <ShieldCheck size={18} />
                {error}
              </div>
            )}

            <div className={`space-y-5 ${twoFactorRequired ? 'hidden' : ''}`}>
              {/* Input Email / Username — primero */}
              <div className="space-y-1.5 focus-within:translate-y-[-2px] transition-transform">
                <label className="text-xs font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest ml-1">
                  Usuario / Email
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center text-slate-400 dark:text-slate-500 group-focus-within:text-[#0D9488] dark:group-focus-within:text-[#0D9488] transition-colors pointer-events-none">
                    {loginAvatarUrl ? (
                      <img
                        src={loginAvatarUrl}
                        alt=""
                        className="w-5 h-5 rounded-full object-cover"
                      />
                    ) : (
                      <Mail size={18} />
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={(e) => fetchTenantsForUser(e.target.value)}
                    placeholder="admin o usuario@empresa.com"
                    className="w-full bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-[#2D3A4A] rounded-[4px] py-3.5 pl-12 pr-4 text-[#0A1628] dark:text-slate-100 text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0D9488]/20 focus:border-[#0D9488] transition-all font-medium"
                  />
                </div>
              </div>

              {/* Selector de Empresa — aparece después de introducir el usuario */}
              {tenants.length > 1 && (
                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="text-xs font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest ml-1">
                    Empresa
                  </label>
                  <div ref={tenantWrapperRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setTenantOpen((o) => !o)}
                      aria-haspopup="listbox"
                      aria-expanded={tenantOpen}
                      className="w-full flex items-center bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-[#2D3A4A] rounded-[4px] py-3.5 pl-12 pr-10 text-left text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#0D9488]/20 focus:border-[#0D9488] transition-all hover:border-[#94A3B8]"
                    >
                      <div className="absolute inset-y-0 left-4 flex items-center text-slate-400 dark:text-slate-500">
                        <Building className="w-4 h-4" />
                      </div>
                      <span
                        className={
                          selectedTenant
                            ? 'text-slate-900 dark:text-slate-100 truncate'
                            : 'text-slate-400 dark:text-slate-500'
                        }
                      >
                        {selectedTenant
                          ? tenants.find((t) => t.id === selectedTenant)?.name
                          : 'Seleccionar empresa...'}
                      </span>
                      <div className="absolute inset-y-0 right-4 flex items-center text-slate-400 dark:text-slate-500">
                        <ChevronDown
                          size={18}
                          className={`transition-transform ${tenantOpen ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </button>

                    {tenantOpen && (
                      <div
                        role="listbox"
                        className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-[#1A2535] border border-[#E2E8F0] dark:border-[#2D3A4A] rounded-[4px] shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
                      >
                        <ul className="max-h-64 overflow-auto py-1">
                          {tenants.map((t) => {
                            const isActive = t.id === selectedTenant;
                            return (
                              <li key={t.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedTenant(t.id);
                                    setTenantOpen(false);
                                  }}
                                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium transition-colors ${
                                    isActive
                                      ? 'bg-[#0D9488]/10 text-[#0D9488]'
                                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  <Building
                                    size={14}
                                    className={
                                      isActive
                                        ? 'text-[#0D9488]'
                                        : 'text-slate-400 dark:text-slate-500'
                                    }
                                  />
                                  <span className="flex-1 truncate">{t.name}</span>
                                  {isActive && <Check size={14} className="text-[#0D9488]" />}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {tenants.length === 1 && (
                <div className="flex items-center gap-2 px-4 py-3 bg-[#0D9488]/10 border border-[#0D9488]/30 rounded-[4px] animate-in fade-in duration-300">
                  <Building size={14} className="text-[#0D9488] shrink-0" />
                  <span className="text-sm font-bold text-[#0D9488]">{tenants[0].name}</span>
                </div>
              )}

              {/* Input Password */}
              <div className="space-y-1.5 focus-within:translate-y-[-2px] transition-transform">
                <div className="flex justify-between items-center ml-1">
                  <label className="text-xs font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest">
                    Contraseña
                  </label>
                  <button
                    type="button"
                    onClick={() => navigate('/forgot-password')}
                    className="text-[11px] font-bold text-[#0D9488] hover:text-[#0A6E63] hover:underline transition"
                  >
                    ¿Olvidó su contraseña?
                  </button>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center text-slate-400 dark:text-slate-500 group-focus-within:text-[#0D9488] dark:group-focus-within:text-[#0D9488] transition-colors pointer-events-none">
                    <Lock size={18} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-[#2D3A4A] rounded-[4px] py-3.5 pl-12 pr-12 text-[#0A1628] dark:text-slate-100 text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0D9488]/20 focus:border-[#0D9488] transition-all font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-4 flex items-center text-slate-400 dark:text-slate-500 hover:text-[#0D9488] dark:hover:text-[#0D9488] transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Paso 2FA — se muestra cuando la contraseña es correcta y el usuario tiene 2FA */}
            {twoFactorRequired && (
              <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="text-xs font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest ml-1">
                  Código de verificación
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center text-slate-400 dark:text-slate-500 group-focus-within:text-[#0D9488] transition-colors pointer-events-none">
                    <ShieldCheck size={18} />
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    placeholder="123456 o código de respaldo"
                    className="w-full bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-[#2D3A4A] rounded-[4px] py-3.5 pl-12 pr-4 text-[#0A1628] dark:text-slate-100 text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0D9488]/20 focus:border-[#0D9488] transition-all font-medium tracking-widest"
                  />
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 ml-1 pt-1">
                  Introduce el código de tu app de autenticación.
                </p>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#0D9488] hover:bg-[#0A6E63] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-[4px] active:scale-[0.98] transition-all flex items-center justify-center gap-2 group tracking-tight shadow-lg shadow-[#0D9488]/20"
              >
                {isSubmitting ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    {twoFactorRequired ? 'Verificar código' : 'Entrar al Sistema'}
                    <ArrowRight
                      size={18}
                      className="group-hover:translate-x-1 transition-transform"
                    />
                  </>
                )}
              </button>
            </div>

            <div className="text-center pt-4">
              <p className="text-slate-500 dark:text-slate-300 text-xs font-bold">
                ¿Dudas con tu acceso?{' '}
                <button
                  type="button"
                  className="text-[#0D9488] hover:text-[#0A6E63] hover:underline"
                >
                  Contactar soporte
                </button>
              </p>
            </div>
          </form>

          {/* Trusted Badges */}
          <div className="pt-12 flex items-center justify-center gap-8 opacity-40 grayscale hover:grayscale-0 transition-all">
            <div className="flex items-center gap-2 text-[10px] font-black text-slate-900 dark:text-slate-100 tracking-tighter">
              <CheckCircle2 size={16} />
              <span>SECURED DB</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-black text-slate-900 dark:text-slate-100 tracking-tighter">
              <Zap size={16} />
              <span>TURBO CORE</span>
            </div>
          </div>
        </div>

        <p className="absolute bottom-8 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] pointer-events-none">
          Open Source ERP Platform &bull; 2026
        </p>
      </div>
    </div>
  );
};
