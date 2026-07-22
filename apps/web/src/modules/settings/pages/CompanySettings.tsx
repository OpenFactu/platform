import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Loader, useToast } from '@openfactu/ui';
import {
  Building,
  Save,
  Palette,
  Globe,
  SlidersHorizontal,
  FileText,
  HardDrive,
  Upload,
  Mail,
  Coins,
  Link,
  Sparkles,
  DatabaseBackup,
} from 'lucide-react';
import { StorageSettingsTab } from '../components/StorageSettingsTab';
import { DataTransferTab } from '../components/DataTransferTab';
import { BackupsTab } from '../components/BackupsTab';
import { FiscalSettingsTab } from '../components/FiscalSettingsTab';
import { EmailSettingsTab } from '../components/EmailSettingsTab';
import { AiSettingsTab } from '../components/AiSettingsTab';
import { useAuth } from '@/context/AuthContext';
import { useTheme, THEME_PRESETS } from '@/context/ThemeContext';
import { KeirostLogo } from '@/components/branding/KeirostLogo';
import { formatCurrency, formatDate } from '@openfactu/common';
import { CountrySelect } from '@/components/geo/CountrySelect';
import { RegionSelect } from '@/components/geo/RegionSelect';
import { SubRegionSelect } from '@/components/geo/SubRegionSelect';
import { LocalitySelect } from '@/components/geo/LocalitySelect';
import { TaxIdInput } from '@/components/geo/TaxIdInput';
import { PostalCodeInput } from '@/components/geo/PostalCodeInput';
import { PhoneInput } from '@/components/geo/PhoneInput';

interface CompanyConfig {
  name: string;
  taxId: string;
  address: string;
  city: string;
  zipCode: string;
  country: string;
  regionId: string;
  subRegionId: string;
  localityId: string;
  email: string;
  phone: string;
  website: string;
  logoUrl: string;
  currency: string;
  fiscalYearStart: string;
}

const EMPTY: CompanyConfig = {
  name: '',
  taxId: '',
  address: '',
  city: '',
  zipCode: '',
  country: 'ES',
  regionId: '',
  subRegionId: '',
  localityId: '',
  email: '',
  phone: '',
  website: '',
  logoUrl: '',
  currency: 'EUR',
  fiscalYearStart: '01-01',
};

type TabId =
  | 'fiscal'
  | 'branding'
  | 'format'
  | 'flags'
  | 'storage'
  | 'data'
  | 'backups'
  | 'email'
  | 'catalogs'
  | 'app'
  | 'ai';

export const CompanySettings: React.FC = () => {
  const { token, user } = useAuth();
  const {
    branding,
    format,
    flags,
    update: updateTheme,
    reload: reloadTheme,
    applyPreset,
    activePresetId,
  } = useTheme();
  const toast = useToast();
  // Soporta deep-link al tab vía `?tab=storage|data|...` para enlazar directamente
  // a una pestaña concreta de Empresa desde otras partes de la app.
  const initialTab: TabId = (() => {
    if (typeof window === 'undefined') return 'fiscal';
    const t = new URLSearchParams(window.location.search).get('tab');
    const allowed: TabId[] = [
      'fiscal',
      'branding',
      'format',
      'flags',
      'storage',
      'data',
      'backups',
      'email',
      'catalogs',
      'app',
      'ai',
    ];
    return allowed.includes(t as TabId) ? (t as TabId) : 'fiscal';
  })();
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [fiscal, setFiscal] = useState<CompanyConfig>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Local drafts for branding/format/flags so the user can edit before saving
  const [brandingDraft, setBrandingDraft] = useState(branding);
  const [formatDraft, setFormatDraft] = useState(format);
  const [flagsDraft, setFlagsDraft] = useState(flags);

  // App config (publicBaseUrl)
  const [appConfig, setAppConfig] = useState({ publicBaseUrl: '' });

  useEffect(() => setBrandingDraft(branding), [branding]);
  useEffect(() => setFormatDraft(format), [format]);
  useEffect(() => setFlagsDraft(flags), [flags]);

  useEffect(() => {
    if (!user?.tenantId || !token) return;
    const headers = { Authorization: `Bearer ${token}`, 'x-tenant-id': user.tenantId || '' };
    coreApi.get('/api/config/app')
      .catch(() => (null))
      .then((d) => {
        if (d) setAppConfig({ publicBaseUrl: d.publicBaseUrl ?? '' });
      })
      .catch(() => {});
  }, [user?.tenantId, token]);

  const fetchFiscal = async () => {
    setLoading(true);
    try {
      const res = await coreApi.raw('GET', '/api/company');
      if (!res.ok) throw new Error('http');
      const cfg = res.data;
      setFiscal({ ...EMPTY, ...cfg });
    } catch {
      toast.error('Error al cargar la configuración de empresa');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) fetchFiscal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const saveFiscal = async () => {
    setSaving(true);
    try {
      const res = await coreApi.raw('PUT', '/api/company', fiscal);
      if (!res.ok) throw new Error('http');
      const updated = res.data;
      setFiscal({ ...EMPTY, ...updated });
      toast.success('Datos de empresa guardados');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const saveBranding = async () => {
    setSaving(true);
    try {
      await updateTheme('branding', brandingDraft);
      toast.success('Branding guardado');
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const saveFormat = async () => {
    setSaving(true);
    try {
      await updateTheme('format', formatDraft);
      toast.success('Formato guardado');
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const saveFlags = async () => {
    setSaving(true);
    try {
      await updateTheme('flags', flagsDraft);
      toast.success('Comportamiento guardado');
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const saveAppConfig = async () => {
    setSaving(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-tenant-id': user?.tenantId || '',
      };
      const res = await coreApi.raw('PUT', '/api/config/app', appConfig);
      if (!res.ok) throw new Error('http');
      toast.success('URL pública guardada');
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const setF = <K extends keyof CompanyConfig>(k: K, v: CompanyConfig[K]) =>
    setFiscal((prev) => ({ ...prev, [k]: v }));

  if (loading)
    return (
      <div className="p-12 flex items-center justify-center">
        <Loader />
      </div>
    );

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: 'fiscal', label: 'Datos fiscales', icon: FileText },
    { id: 'branding', label: 'Branding', icon: Palette },
    { id: 'format', label: 'Formato', icon: Globe },
    { id: 'flags', label: 'Comportamiento', icon: SlidersHorizontal },
    { id: 'catalogs', label: 'Fiscal / Pagos', icon: Coins },
    { id: 'app', label: 'Acceso', icon: Link },
    { id: 'storage', label: 'Almacenamiento', icon: HardDrive },
    { id: 'email', label: 'Correo', icon: Mail },
    { id: 'ai', label: 'IA', icon: Sparkles },
    { id: 'data', label: 'Importar/Exportar', icon: Upload },
    { id: 'backups', label: 'Backups', icon: DatabaseBackup },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-accent/10 text-accent border border-accent/20 rounded-sm">
          <Building size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-slate-100 font-display">
            Configuración de Empresa
          </h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            Datos fiscales, branding, formato y comportamiento.
          </p>
        </div>
      </div>

      {/* Tabs — scroll horizontal cuando no caben, sin wrap */}
      <div className="border-b border-line dark:border-ink-700 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors shrink-0 ${
                activeTab === t.id
                  ? 'text-accent border-accent'
                  : 'text-ink-500 dark:text-ink-400 border-transparent hover:text-accent dark:hover:text-accent'
              }`}
            >
              <t.icon size={13} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'fiscal' && (
        <div className="space-y-6">
          <Card>
            <div className="p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                País e identificación
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CountrySelect
                  label="País"
                  value={fiscal.country}
                  onChange={(code) => {
                    setFiscal((prev) => ({
                      ...prev,
                      country: code,
                      regionId: '',
                      subRegionId: '',
                      localityId: '',
                      city: '',
                    }));
                  }}
                />
                <Input
                  label="Nombre de la empresa"
                  value={fiscal.name}
                  onChange={(e) => setF('name', e.target.value)}
                />
                <div className="md:col-span-2">
                  <TaxIdInput
                    countryCode={fiscal.country}
                    value={fiscal.taxId}
                    onChange={(v) => setF('taxId', v)}
                  />
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Domicilio
              </h2>
              <Input
                label="Dirección"
                value={fiscal.address}
                onChange={(e) => setF('address', e.target.value)}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RegionSelect
                  countryCode={fiscal.country}
                  value={fiscal.regionId}
                  onChange={(id) =>
                    setFiscal((prev) => ({
                      ...prev,
                      regionId: id,
                      subRegionId: '',
                      localityId: '',
                      city: '',
                    }))
                  }
                />
                <SubRegionSelect
                  countryCode={fiscal.country}
                  regionId={fiscal.regionId || null}
                  value={fiscal.subRegionId}
                  onChange={(id) =>
                    setFiscal((prev) => ({ ...prev, subRegionId: id, localityId: '', city: '' }))
                  }
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <LocalitySelect
                  subRegionId={fiscal.subRegionId}
                  value={fiscal.localityId}
                  valueName={fiscal.city}
                  onChange={(loc) =>
                    setFiscal((prev) => ({
                      ...prev,
                      localityId: loc?.id || '',
                      city: loc?.name || '',
                    }))
                  }
                />
                <PostalCodeInput
                  countryCode={fiscal.country}
                  value={fiscal.zipCode}
                  onChange={(v) => setF('zipCode', v)}
                />
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Contacto
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Email"
                  type="email"
                  value={fiscal.email}
                  onChange={(e) => setF('email', e.target.value)}
                />
                <PhoneInput
                  countryCode={fiscal.country}
                  value={fiscal.phone}
                  onChange={(v) => setF('phone', v)}
                />
                <Input
                  label="Web"
                  value={fiscal.website}
                  onChange={(e) => setF('website', e.target.value)}
                />
                <Input
                  label="URL del logo (datos fiscales)"
                  value={fiscal.logoUrl}
                  onChange={(e) => setF('logoUrl', e.target.value)}
                />
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Preferencias
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-slate-700 dark:text-slate-300">
                    Moneda
                  </label>
                  <select
                    className="w-full rounded-[2px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[13px] px-3 py-2"
                    value={fiscal.currency}
                    onChange={(e) => setF('currency', e.target.value)}
                  >
                    <option value="EUR">€ EUR</option>
                    <option value="USD">$ USD</option>
                    <option value="GBP">£ GBP</option>
                  </select>
                </div>
                <Input
                  label="Inicio del año fiscal (MM-DD)"
                  value={fiscal.fiscalYearStart}
                  onChange={(e) => setF('fiscalYearStart', e.target.value)}
                  placeholder="01-01"
                />
              </div>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button onClick={saveFiscal} disabled={saving}>
              <Save size={16} className="mr-2" />
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'branding' && (
        <div className="space-y-6">
          <Card>
            <div className="p-6 space-y-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="font-mono text-[10px] tracking-[1.5px] uppercase text-[var(--k-ink-400)]">
                    Presets de tema
                  </h2>
                  <p className="text-[12px] text-[var(--k-ink-500)] mt-1">
                    Elige un tema de marca prediseñado. También puedes ajustar los colores
                    manualmente abajo.
                  </p>
                </div>
                {activePresetId === 'custom' && (
                  <span className="font-mono text-[10px] tracking-[1px] uppercase text-[var(--k-teal-600)] bg-[var(--k-teal-50)] border border-[var(--k-teal-100)] rounded-[2px] px-2 py-1">
                    Personalizado
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {THEME_PRESETS.map((preset) => {
                  const selected = activePresetId === preset.id;
                  const isDark = preset.themeMode === 'dark';
                  const logoVariant =
                    preset.id === 'keirost-teal'
                      ? 'accent'
                      : preset.id === 'keirost-slate'
                        ? 'mono'
                        : isDark
                          ? 'dark'
                          : 'outline';
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset.id)}
                      className={
                        'group relative flex flex-col items-start gap-3 p-4 rounded-[4px] border transition-colors text-left ' +
                        (selected
                          ? 'border-[var(--k-teal-500)] ring-1 ring-[var(--k-teal-500)]'
                          : 'border-[var(--k-line)] hover:border-[var(--k-ink-400)]')
                      }
                      style={{ background: isDark ? preset.colorPrimary : '#ffffff' }}
                    >
                      <div className="flex items-center gap-3">
                        <KeirostLogo size={36} variant={logoVariant as any} />
                        <div className="flex gap-1">
                          <span
                            className="w-3 h-3 rounded-[2px] border border-black/10"
                            style={{ background: preset.colorPrimary }}
                          />
                          <span
                            className="w-3 h-3 rounded-[2px] border border-black/10"
                            style={{ background: preset.colorAccent }}
                          />
                        </div>
                      </div>
                      <div>
                        <div
                          className="font-display font-semibold text-[14px]"
                          style={{ color: isDark ? '#fff' : '#0A1628' }}
                        >
                          {preset.label}
                        </div>
                        <div
                          className="text-[11px] mt-0.5 leading-snug"
                          style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B' }}
                        >
                          {preset.description}
                        </div>
                      </div>
                      {selected && (
                        <span className="absolute top-2 right-2 font-mono text-[9px] tracking-[1px] uppercase text-[var(--k-teal-600)] bg-[var(--k-teal-50)] border border-[var(--k-teal-100)] rounded-[2px] px-1.5 py-0.5">
                          Activo
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6 space-y-4">
              <h2 className="font-mono text-[10px] tracking-[1.5px] uppercase text-[var(--k-ink-400)]">
                Colores
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                    Color primario
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      className="h-9 w-12 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                      value={brandingDraft.colorPrimary}
                      onChange={(e) =>
                        setBrandingDraft({ ...brandingDraft, colorPrimary: e.target.value })
                      }
                    />
                    <Input
                      value={brandingDraft.colorPrimary}
                      onChange={(e) =>
                        setBrandingDraft({ ...brandingDraft, colorPrimary: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                    Color acento
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      className="h-9 w-12 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                      value={brandingDraft.colorAccent}
                      onChange={(e) =>
                        setBrandingDraft({ ...brandingDraft, colorAccent: e.target.value })
                      }
                    />
                    <Input
                      value={brandingDraft.colorAccent}
                      onChange={(e) =>
                        setBrandingDraft({ ...brandingDraft, colorAccent: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Marca
              </h2>
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                  Nombre de la aplicación
                </label>
                <Input
                  value={brandingDraft.appName}
                  onChange={(e) => setBrandingDraft({ ...brandingDraft, appName: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                  URL del logo
                </label>
                <Input
                  value={brandingDraft.logoUrl}
                  onChange={(e) => setBrandingDraft({ ...brandingDraft, logoUrl: e.target.value })}
                  placeholder="https://..."
                />
                {brandingDraft.logoUrl && (
                  <div className="mt-3 flex items-center gap-3">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Vista previa:
                    </span>
                    <img
                      src={brandingDraft.logoUrl}
                      alt="logo"
                      className="h-12 w-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Apariencia
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                    Familia tipográfica
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    value={brandingDraft.fontFamily}
                    onChange={(e) =>
                      setBrandingDraft({ ...brandingDraft, fontFamily: e.target.value as any })
                    }
                  >
                    <option value="sans">Sans-serif (Helvetica)</option>
                    <option value="serif">Serif (Georgia)</option>
                    <option value="mono">Monospace</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                    Modo
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    value={brandingDraft.themeMode}
                    onChange={(e) =>
                      setBrandingDraft({ ...brandingDraft, themeMode: e.target.value as any })
                    }
                  >
                    <option value="light">Claro</option>
                    <option value="dark">Oscuro</option>
                  </select>
                </div>
              </div>
            </div>
          </Card>

          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setBrandingDraft(branding)}
              disabled={saving}
            >
              Descartar
            </Button>
            <Button onClick={saveBranding} disabled={saving}>
              <Save size={16} className="mr-2" />
              {saving ? 'Guardando...' : 'Guardar branding'}
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'format' && (
        <div className="space-y-6">
          <Card>
            <div className="p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Regionalización
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                    Locale
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    value={formatDraft.locale}
                    onChange={(e) => setFormatDraft({ ...formatDraft, locale: e.target.value })}
                  >
                    <option value="es-ES">Español (España)</option>
                    <option value="es-MX">Español (México)</option>
                    <option value="pt-PT">Português (Portugal)</option>
                    <option value="pt-BR">Português (Brasil)</option>
                    <option value="en-GB">English (UK)</option>
                    <option value="en-US">English (US)</option>
                    <option value="fr-FR">Français</option>
                    <option value="it-IT">Italiano</option>
                    <option value="de-DE">Deutsch</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                    Formato de fecha
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    value={formatDraft.dateFormat}
                    onChange={(e) => setFormatDraft({ ...formatDraft, dateFormat: e.target.value })}
                  >
                    <option value="dd/MM/yyyy">dd/MM/yyyy</option>
                    <option value="dd-MM-yyyy">dd-MM-yyyy</option>
                    <option value="yyyy-MM-dd">yyyy-MM-dd</option>
                    <option value="MM/dd/yyyy">MM/dd/yyyy</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                    Decimales importes
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={6}
                    value={formatDraft.decimalPrecision}
                    onChange={(e) =>
                      setFormatDraft({
                        ...formatDraft,
                        decimalPrecision: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                    Decimales cantidades
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={6}
                    value={formatDraft.quantityPrecision}
                    onChange={(e) =>
                      setFormatDraft({
                        ...formatDraft,
                        quantityPrecision: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <p className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wide mb-2">
                  Vista previa
                </p>
                <div className="space-y-1 text-sm text-slate-800 dark:text-slate-200">
                  <p>
                    <span className="text-slate-500 dark:text-slate-400">Importe:</span>{' '}
                    <span className="font-bold">
                      {formatCurrency(1234.56, formatDraft, fiscal.currency || 'EUR')}
                    </span>
                  </p>
                  <p>
                    <span className="text-slate-500 dark:text-slate-400">Fecha:</span>{' '}
                    <span className="font-bold">{formatDate(new Date(), formatDraft)}</span>
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setFormatDraft(format)} disabled={saving}>
              Descartar
            </Button>
            <Button onClick={saveFormat} disabled={saving}>
              <Save size={16} className="mr-2" />
              {saving ? 'Guardando...' : 'Guardar formato'}
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'flags' && (
        <div className="space-y-6">
          <Card>
            <div className="p-6 space-y-1">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-4">
                Flags de comportamiento
              </h2>
              <FlagRow
                label="Permitir stock negativo"
                hint="Si está activo, los albaranes de venta pueden reducir el stock por debajo de cero."
                checked={flagsDraft.allowNegativeStock}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, allowNegativeStock: v })}
              />
              <FlagRow
                label="Auto-confirmar lotes"
                hint="Al vender un artículo con lotes, el sistema asigna automáticamente FIFO si no se eligen manualmente."
                checked={flagsDraft.autoConfirmBatches}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, autoConfirmBatches: v })}
              />
              <FlagRow
                label="Marca de agua BORRADOR en documentos abiertos"
                hint="Añade la marca BORRADOR a los PDFs de documentos en estado abierto."
                checked={flagsDraft.watermarkDraft}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, watermarkDraft: v })}
              />
              <FlagRow
                label="Marca de agua PAGADA en facturas cobradas"
                hint="Añade la marca PAGADA (en verde) a los PDFs de facturas con el cobro completo."
                checked={flagsDraft.watermarkPaid}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, watermarkPaid: v })}
              />
              <FlagRow
                label="Confirmar antes de cancelar"
                hint="Pide confirmación al usuario antes de cancelar un documento desde la interfaz."
                checked={flagsDraft.confirmBeforeCancel}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, confirmBeforeCancel: v })}
              />
              <FlagRow
                label="Forzar zonas de almacén"
                hint="Exige especificar una zona (warehouseZone) en las líneas de documentos."
                checked={flagsDraft.enforceWarehouseZones}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, enforceWarehouseZones: v })}
              />
              <FlagRow
                label="Gestión de logística"
                hint="Activa el módulo de envíos, rutas y seguimiento en tiempo real (mapa + timeline por albarán)."
                checked={!!flagsDraft.logisticsEnabled}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, logisticsEnabled: v })}
              />
              <FlagRow
                label="Chat de Keiro en seguimiento público"
                hint="Añade un chat de IA a la página pública de seguimiento (/track/:token) para que el cliente pregunte por su envío o reporte una incidencia — sin login, así que actívalo solo si quieres exponer esa superficie públicamente."
                checked={!!(flagsDraft as any).trackingChatEnabled}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, trackingChatEnabled: v } as any)}
              />
              <FlagRow
                label="Modo sólo logística"
                hint="Oculta Ventas, Compras, Contabilidad, RRHH y Analítica. Solo quedan Inicio, Inventario, Interlocutores y Logística. Útil para clientes que sólo contratan el módulo de reparto."
                checked={!!flagsDraft.logisticsOnly}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, logisticsOnly: v })}
              />
              <FlagRow
                label="RRHH · Turnos y plantillas"
                hint="Activa el módulo de plantillas de turno y patrones de rotación cíclica."
                checked={!!(flagsDraft as any).hrShiftsEnabled}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, hrShiftsEnabled: v } as any)}
              />
              <FlagRow
                label="RRHH · Planificación"
                hint="Cuadrante mensual de turnos asignados con vista calendario."
                checked={!!(flagsDraft as any).hrPlanningEnabled}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, hrPlanningEnabled: v } as any)}
              />
              <FlagRow
                label="RRHH · Fichajes"
                hint="Permite a los empleados fichar entrada/salida desde la web o desde kioskos compartidos."
                checked={!!(flagsDraft as any).hrTimeclockEnabled}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, hrTimeclockEnabled: v } as any)}
              />
              <FlagRow
                label="RRHH · Incidencias y sustituciones"
                hint="Tipos de incidencia configurables y flujo de sustitución asistida cuando aplican."
                checked={!!(flagsDraft as any).hrIncidentsEnabled}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, hrIncidentsEnabled: v } as any)}
              />
              <FlagRow
                label="RRHH avanzado+ (rendimientos, costes, evaluaciones, comisiones, tareas)"
                hint="Activa convenios colectivos, evaluaciones de desempeño, objetivos SMART, comisiones comerciales, dashboard de rendimiento, coste laboral, tareas y Gantt."
                checked={!!(flagsDraft as any).hrAdvancedEnabled}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, hrAdvancedEnabled: v } as any)}
              />
              <div className="flex items-center justify-between py-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex-1 pr-4">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Ubicación del almacén en documentos
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Elige si el almacén se captura una vez en la cabecera del documento o por línea
                    (junto con la ubicación/zona).
                  </div>
                </div>
                <select
                  value={flagsDraft.warehouseLocation}
                  onChange={(e) =>
                    setFlagsDraft({
                      ...flagsDraft,
                      warehouseLocation: e.target.value as 'header' | 'line',
                    })
                  }
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                >
                  <option value="header">En la cabecera</option>
                  <option value="line">En cada línea</option>
                </select>
              </div>
            </div>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setFlagsDraft(flags)} disabled={saving}>
              Descartar
            </Button>
            <Button onClick={saveFlags} disabled={saving}>
              <Save size={16} className="mr-2" />
              {saving ? 'Guardando...' : 'Guardar comportamiento'}
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'app' && (
        <div className="space-y-6">
          <Card>
            <div className="p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                URL pública
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Esta URL se usa en los emails de seguimiento de envíos, webhooks y enlaces
                compartidos con clientes. Debe ser accesible desde internet.
              </p>
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                  URL base
                </label>
                <Input
                  value={appConfig.publicBaseUrl}
                  onChange={(e) => setAppConfig({ ...appConfig, publicBaseUrl: e.target.value })}
                  placeholder="https://miempresa.com"
                />
              </div>
            </div>
          </Card>

          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setAppConfig({ publicBaseUrl: appConfig.publicBaseUrl })}
              disabled={saving}
            >
              Descartar
            </Button>
            <Button onClick={saveAppConfig} disabled={saving}>
              <Save size={16} className="mr-2" />
              {saving ? 'Guardando...' : 'Guardar URL'}
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'storage' && <StorageSettingsTab />}

      {activeTab === 'catalogs' && <FiscalSettingsTab />}

      {activeTab === 'email' && <EmailSettingsTab />}

      {activeTab === 'ai' && <AiSettingsTab />}

      {activeTab === 'data' && <DataTransferTab />}

      {activeTab === 'backups' && <BackupsTab />}
    </div>
  );
};

const FlagRow: React.FC<{
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, hint, checked, onChange }) => (
  <label className="flex items-start gap-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0 cursor-pointer">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-1 h-4 w-4 accent-primary cursor-pointer"
    />
    <div className="flex-1">
      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{label}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  </label>
);
