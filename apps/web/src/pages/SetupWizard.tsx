import { apiClient, ApiError } from '@/shared/http';
import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  Database,
  User,
  Building,
  Settings,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  LayoutGrid,
} from 'lucide-react';
import { Loader, useToast, usePopup } from '@openfactu/ui';
import { KeirostLogo } from '../components/branding/KeirostLogo';
import { CORE_MODULES } from '@/modules';
import { ModuleCard } from '@/modules/plugins/components/ModuleCard';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DbConfig {
  host: string;
  port: string;
  user: string;
  password: string;
}

interface AdminConfig {
  email: string;
  username: string;
  password: string;
}

interface CompanyConfig {
  name: string;
  nif: string;
  address: string;
  city: string;
  zip: string;
  country: string;
  email: string;
  phone: string;
  website: string;
  currency: string;
  fiscalYearStart: string;
  publicBaseUrl: string;
}

interface SetupFormData {
  db: DbConfig;
  admin: AdminConfig;
  company: CompanyConfig;
  modules: Record<string, boolean>;
}

// ── Shared Components ───────────────────────────────────────────────────────

const INPUT_CLS =
  'w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 outline-none';

const BTN_PRIMARY_CLS =
  'flex-1 bg-[#0D9488] text-white p-3 rounded-sm font-bold hover:bg-[#0A6E63] transition flex items-center justify-center gap-2 group disabled:opacity-50';

const BTN_SECONDARY_CLS =
  'flex-[0.4] bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-slate-300 p-3 rounded-lg font-bold hover:bg-gray-100 dark:hover:bg-slate-700 transition flex items-center justify-center gap-2 border border-gray-100 dark:border-slate-700';

function PasswordInput({
  value,
  onChange,
  placeholder,
  show,
  onToggle,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        className={`${INPUT_CLS} pr-10 transition-all`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#0D9488] dark:hover:text-[#0D9488] transition-colors"
        onClick={onToggle}
      >
        {show ? <EyeOff size={20} /> : <Eye size={20} />}
      </button>
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  const steps = [
    { id: 1, icon: Database },
    { id: 2, icon: User },
    { id: 3, icon: Building },
    { id: 4, icon: Settings },
    { id: 5, icon: LayoutGrid },
  ];
  return (
    <div className="flex justify-center mt-4 gap-4">
      {steps.map((s) => (
        <div key={s.id} className="flex flex-col items-center">
          <div
            className={`h-10 w-10 rounded-full flex items-center justify-center transition-all ${
              step >= s.id
                ? 'bg-[#0D9488] text-white shadow-lg'
                : 'bg-gray-100 dark:bg-[#1A2535] text-gray-400 dark:text-slate-500'
            }`}
          >
            <s.icon size={20} />
          </div>
        </div>
      ))}
    </div>
  );
}

function WizardHeader() {
  return (
    <div className="mb-8 text-center">
      <div className="flex items-center justify-center gap-3">
        <KeirostLogo size={44} variant="outline" />
        <h1
          className="text-3xl font-bold tracking-tight text-[#0A1628] dark:text-slate-100"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Keirost <span style={{ color: '#0D9488' }}>ERP</span>
        </h1>
      </div>
      <p className="text-gray-500 dark:text-slate-400 mt-3">Asistente de configuración inicial</p>
    </div>
  );
}

// ─── Step Components ─────────────────────────────────────────────────────────

function Step1Database({
  data,
  onChange,
  onNext,
}: {
  data: DbConfig;
  onChange: (partial: Partial<DbConfig>) => void;
  onNext: () => void;
}) {
  const toast = useToast();
  const popup = usePopup();
  const [showPass, setShowPass] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleNext = async () => {
    if (!data.host || !data.port || !data.user || !data.password) {
      toast.error('Completa todos los campos de la base de datos.');
      return;
    }

    const port = parseInt(data.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      toast.error('El puerto debe ser un número válido (1-65535).');
      return;
    }

    setChecking(true);
    try {
      const json = await apiClient.post<any>(
        '/api/setup/check-db',
        { host: data.host, port, user: data.user, password: data.password },
        { auth: false },
      );

      if (json.connected) {
        if (json.hasExistingSetup) {
          const skip = await new Promise<boolean>((resolve) => {
            popup.show({
              title: 'Configuración existente detectada',
              tone: 'warning',
              render: (close) => (
                <div>
                  <p className="text-sm text-[var(--k-ink-700)] dark:text-slate-200">
                    Esta base de datos ya tiene una configuración de Keirost ERP. ¿Quieres saltarte
                    el setup e ir directamente al login?
                  </p>
                  <div className="flex gap-2 justify-end mt-4">
                    <button
                      onClick={() => {
                        close();
                        resolve(false);
                      }}
                      className="px-4 py-2 rounded-sm border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-sm font-medium"
                    >
                      Continuar setup
                    </button>
                    <button
                      onClick={() => {
                        close();
                        resolve(true);
                      }}
                      className="px-4 py-2 rounded-sm bg-[#0D9488] text-white hover:bg-[#0A6E63] transition text-sm font-medium"
                    >
                      Ir al login
                    </button>
                  </div>
                </div>
              ),
            });
          });
          if (skip) {
            window.location.href = '/login';
            return;
          }
          toast.warning('Continuando con el setup...');
        } else if (json.databaseExists) {
          toast.info(json.message);
        } else {
          toast.success(json.message);
        }
        onNext();
      } else {
        toast.error(json.message);
      }
    } catch {
      toast.error('Error de red al verificar la conexión.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
      <h2 className="text-xl font-bold">1. Base de Datos</h2>
      <p className="text-sm text-gray-600 dark:text-slate-400">
        Configura la conexión principal de PostgreSQL.
      </p>
      <input
        className={INPUT_CLS}
        placeholder="Host (ej: localhost)"
        value={data.host}
        onChange={(e) => onChange({ host: e.target.value })}
      />
      <input
        className={INPUT_CLS}
        placeholder="Puerto (ej: 5432)"
        value={data.port}
        onChange={(e) => onChange({ port: e.target.value })}
      />
      <input
        className={INPUT_CLS}
        placeholder="Usuario (ej: openfactu)"
        value={data.user}
        onChange={(e) => onChange({ user: e.target.value })}
      />
      <PasswordInput
        value={data.password}
        onChange={(v) => onChange({ password: v })}
        placeholder="Contraseña DB"
        show={showPass}
        onToggle={() => setShowPass(!showPass)}
      />
      <button
        onClick={handleNext}
        disabled={checking}
        className={`w-full ${BTN_PRIMARY_CLS} disabled:opacity-50`}
      >
        {checking ? (
          <Loader size="sm" variant="white" className="mr-0" />
        ) : (
          <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
        )}
        <span>{checking ? 'Verificando conexión...' : 'Siguiente'}</span>
      </button>
    </div>
  );
}

function Step2Admin({
  data,
  onChange,
  onPrev,
  onNext,
}: {
  data: AdminConfig;
  onChange: (partial: Partial<AdminConfig>) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [showPass, setShowPass] = useState(false);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
      <h2 className="text-xl font-bold">2. Administrador</h2>
      <p className="text-sm text-gray-600 dark:text-slate-400">
        Crea la cuenta de superusuario global.
      </p>
      <input
        type="email"
        className={INPUT_CLS}
        placeholder="Email"
        value={data.email}
        onChange={(e) => onChange({ email: e.target.value })}
      />
      <input
        type="text"
        className={INPUT_CLS}
        placeholder="Nombre de Usuario (ej: angel)"
        value={data.username}
        onChange={(e) => onChange({ username: e.target.value })}
      />
      <PasswordInput
        value={data.password}
        onChange={(v) => onChange({ password: v })}
        placeholder="Contraseña"
        show={showPass}
        onToggle={() => setShowPass(!showPass)}
      />
      <div className="flex gap-2">
        <button onClick={onPrev} className={BTN_SECONDARY_CLS}>
          <ChevronLeft size={20} /> Atrás
        </button>
        <button onClick={onNext} className={BTN_PRIMARY_CLS}>
          Siguiente{' '}
          <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
}

function Step3Company({
  data,
  onChange,
  onPrev,
  onNext,
}: {
  data: Pick<CompanyConfig, 'name' | 'nif'>;
  onChange: (partial: Partial<Pick<CompanyConfig, 'name' | 'nif'>>) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
      <h2 className="text-xl font-bold">3. Primera Empresa</h2>
      <p className="text-sm text-gray-600 dark:text-slate-400">
        Datos fiscales de tu empresa principal.
      </p>
      <input
        className={INPUT_CLS}
        placeholder="Nombre de la Empresa"
        value={data.name}
        onChange={(e) => onChange({ name: e.target.value })}
      />
      <input
        className={INPUT_CLS}
        placeholder="NIF / CIF"
        value={data.nif}
        onChange={(e) => onChange({ nif: e.target.value })}
      />
      <div className="flex gap-3 mt-6">
        <button onClick={onPrev} className={BTN_SECONDARY_CLS}>
          <ChevronLeft size={18} /> Atrás
        </button>
        <button onClick={onNext} disabled={!data.name || !data.nif} className={BTN_PRIMARY_CLS}>
          Siguiente{' '}
          <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
}

function Step4CompanyDetails({
  data,
  onChange,
  onPrev,
  onNext,
}: {
  data: Omit<CompanyConfig, 'name' | 'nif'>;
  onChange: (partial: Partial<Omit<CompanyConfig, 'name' | 'nif'>>) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-right-4">
      <h2 className="text-xl font-bold">4. Configuración de Empresa</h2>
      <p className="text-sm text-gray-600 dark:text-slate-400">
        Datos de contacto, domicilio y preferencias. Podrás editarlos después en Ajustes.
      </p>
      <input
        className={INPUT_CLS}
        placeholder="Dirección"
        value={data.address}
        onChange={(e) => onChange({ address: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          className={INPUT_CLS}
          placeholder="Ciudad"
          value={data.city}
          onChange={(e) => onChange({ city: e.target.value })}
        />
        <input
          className={INPUT_CLS}
          placeholder="Código Postal"
          value={data.zip}
          onChange={(e) => onChange({ zip: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select
          className={INPUT_CLS}
          value={data.country}
          onChange={(e) => onChange({ country: e.target.value })}
        >
          <option value="ES">España</option>
          <option value="PT">Portugal</option>
          <option value="FR">Francia</option>
          <option value="IT">Italia</option>
          <option value="DE">Alemania</option>
          <option value="GB">Reino Unido</option>
          <option value="US">Estados Unidos</option>
        </select>
        <select
          className={INPUT_CLS}
          value={data.currency}
          onChange={(e) => onChange({ currency: e.target.value })}
        >
          <option value="EUR">€ EUR</option>
          <option value="USD">$ USD</option>
          <option value="GBP">£ GBP</option>
        </select>
      </div>
      <input
        type="email"
        className={INPUT_CLS}
        placeholder="Email de contacto"
        value={data.email}
        onChange={(e) => onChange({ email: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          className={INPUT_CLS}
          placeholder="Teléfono"
          value={data.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
        />
        <input
          className={INPUT_CLS}
          placeholder="Web"
          value={data.website}
          onChange={(e) => onChange({ website: e.target.value })}
        />
      </div>
      <div>
        <label className="text-xs text-gray-500 dark:text-slate-400 block mb-1">
          Inicio del año fiscal (MM-DD)
        </label>
        <input
          className={INPUT_CLS}
          placeholder="01-01"
          value={data.fiscalYearStart}
          onChange={(e) => onChange({ fiscalYearStart: e.target.value })}
        />
      </div>
      <div>
        <label className="text-xs text-gray-500 dark:text-slate-400 block mb-1">
          URL pública de la aplicación
        </label>
        <input
          className={INPUT_CLS}
          placeholder="https://app.tuempresa.com"
          value={data.publicBaseUrl}
          onChange={(e) => onChange({ publicBaseUrl: e.target.value })}
        />
        <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">
          Dominio desde el que tus clientes abrirán los enlaces de seguimiento (emails). Podrás
          cambiarlo luego en Ajustes.
        </p>
      </div>
      <div className="flex gap-3 mt-6">
        <button onClick={onPrev} className={BTN_SECONDARY_CLS}>
          <ChevronLeft size={18} /> Atrás
        </button>
        <button
          onClick={onNext}
          className="flex-1 bg-[#0D9488] text-white p-3 rounded-sm font-bold hover:bg-[#0A6E63] transition flex items-center justify-center gap-2 whitespace-nowrap shadow-md hover:shadow-lg"
        >
          Siguiente{' '}
          <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
}

function Step5Modules({
  data,
  onChange,
  onPrev,
  onSubmit,
  loading,
}: {
  data: Record<string, boolean>;
  onChange: (key: string, value: boolean) => void;
  onPrev: () => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const activatable = CORE_MODULES.filter((m) => Boolean(m.featureFlag));
  const byCategory = activatable.reduce<Record<string, typeof activatable>>((acc, m) => {
    const cat = m.category || 'General';
    (acc[cat] = acc[cat] || []).push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
      <h2 className="text-xl font-bold">5. Módulos</h2>
      <p className="text-sm text-gray-600 dark:text-slate-400">
        Elige qué módulos activar. Podrás cambiarlo después en Apps.
      </p>
      <div className="max-h-96 overflow-y-auto space-y-4 pr-1">
        {Object.entries(byCategory).map(([category, mods]) => (
          <div key={category}>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              {category}
            </h3>
            <div className="space-y-2">
              {mods.map((m) => (
                <ModuleCard
                  key={m.id}
                  module={m}
                  enabled={data[m.featureFlag as string] ?? true}
                  onToggle={() =>
                    onChange(m.featureFlag as string, !(data[m.featureFlag as string] ?? true))
                  }
                  isToggling={false}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-6">
        <button onClick={onPrev} className={BTN_SECONDARY_CLS}>
          <ChevronLeft size={18} /> Atrás
        </button>
        <button
          onClick={onSubmit}
          disabled={loading}
          className="flex-1 bg-[#0D9488] text-white p-3 rounded-sm font-bold hover:bg-[#0A6E63] transition flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap shadow-md hover:shadow-lg"
        >
          {loading ? (
            <Loader size="sm" variant="white" className="mr-0" />
          ) : (
            <CheckCircle2 size={18} />
          )}
          <span>{loading ? 'Inicializando...' : 'Finalizar'}</span>
        </button>
      </div>
    </div>
  );
}

// ─── Main Wizard ─────────────────────────────────────────────────────────────

export const SetupWizard: React.FC = () => {
  const [step, setStep] = useState(1);
  const toast = useToast();
  const popup = usePopup();
  const isDocker = window.location.port === '8080';

  const [formData, setFormData] = useState<SetupFormData>({
    db: {
      host: isDocker ? 'db' : '127.0.0.1',
      port: isDocker ? '5432' : '5439',
      user: 'openfactu',
      password: 'openfactu_pass',
    },
    admin: { email: '', username: '', password: '' },
    modules: Object.fromEntries(
      CORE_MODULES.filter((m) => m.featureFlag).map((m) => [m.featureFlag as string, true]),
    ),
    company: {
      name: '',
      nif: '',
      address: '',
      city: '',
      zip: '',
      country: 'ES',
      email: '',
      phone: '',
      website: '',
      currency: 'EUR',
      fiscalYearStart: '01-01',
      publicBaseUrl: typeof window !== 'undefined' ? window.location.origin : '',
    },
  });

  const [loading, setLoading] = useState(false);

  const updateDb = (partial: Partial<DbConfig>) =>
    setFormData((prev) => ({ ...prev, db: { ...prev.db, ...partial } }));
  const updateAdmin = (partial: Partial<AdminConfig>) =>
    setFormData((prev) => ({ ...prev, admin: { ...prev.admin, ...partial } }));
  const updateCompany = (partial: Partial<CompanyConfig>) =>
    setFormData((prev) => ({ ...prev, company: { ...prev.company, ...partial } }));
  const updateModule = (key: string, value: boolean) =>
    setFormData((prev) => ({ ...prev, modules: { ...prev.modules, [key]: value } }));

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await apiClient.post(
        '/api/setup/init',
        {
          dbConfig: {
            host: formData.db.host,
            port: parseInt(formData.db.port),
            user: formData.db.user,
            password: formData.db.password,
          },
          admin: formData.admin,
          modules: Object.fromEntries(
            Object.entries(formData.modules).filter(([, v]) => v === false),
          ),
          company: {
            name: formData.company.name,
            nif: formData.company.nif,
            address: formData.company.address,
            city: formData.company.city,
            zipCode: formData.company.zip,
            country: formData.company.country,
            email: formData.company.email,
            phone: formData.company.phone,
            website: formData.company.website,
            currency: formData.company.currency,
            fiscalYearStart: formData.company.fiscalYearStart,
            publicBaseUrl: formData.company.publicBaseUrl,
          },
        },
        { auth: false },
      );
      window.location.href = '/';
    } catch (err) {
      if (err instanceof ApiError && err.status !== 0) {
        toast.error(
          ((err.body as any)?.error as string) || 'Fallo en la configuración. Revisa los logs.',
        );
      } else {
        toast.error('Error de red al intentar configurar el sistema.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0A1628] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-[#1A2535] rounded-sm p-8 shadow-xl border border-[#E2E8F0] dark:border-[#2D3A4A]">
        <WizardHeader />
        <StepIndicator step={step} />

        {step === 1 && (
          <Step1Database data={formData.db} onChange={updateDb} onNext={() => setStep(2)} />
        )}
        {step === 2 && (
          <Step2Admin
            data={formData.admin}
            onChange={updateAdmin}
            onPrev={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <Step3Company
            data={formData.company}
            onChange={updateCompany}
            onPrev={() => setStep(2)}
            onNext={() => setStep(4)}
          />
        )}
        {step === 4 && (
          <Step4CompanyDetails
            data={formData.company}
            onChange={updateCompany}
            onPrev={() => setStep(3)}
            onNext={() => setStep(5)}
          />
        )}
        {step === 5 && (
          <Step5Modules
            data={formData.modules}
            onChange={updateModule}
            onPrev={() => setStep(4)}
            onSubmit={handleSubmit}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
};
