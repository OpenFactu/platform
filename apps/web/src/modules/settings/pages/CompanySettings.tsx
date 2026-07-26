import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Input,
  Checkbox,
  ColorInput,
  NumberInput,
  Select,
  Tabs,
  Loader,
  useToast,
} from '@openfactu/ui';
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
import {
  useTheme,
  THEME_PRESETS,
  FONT_OPTIONS,
  fontOptionFor,
  googleFontsUrl,
} from '@/context/ThemeContext';
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

const CURRENCY_OPTIONS = [
  { value: 'EUR', label: '€ EUR' },
  { value: 'USD', label: '$ USD' },
  { value: 'GBP', label: '£ GBP' },
];

const THEME_MODE_OPTIONS = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
];

const LOCALE_OPTIONS = [
  { value: 'es-ES', label: 'Español (España)' },
  { value: 'es-MX', label: 'Español (México)' },
  { value: 'pt-PT', label: 'Português (Portugal)' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'it-IT', label: 'Italiano' },
  { value: 'de-DE', label: 'Deutsch' },
];

const DATE_FORMAT_OPTIONS = ['dd/MM/yyyy', 'dd-MM-yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy'].map((v) => ({
  value: v,
  label: v,
}));

const WAREHOUSE_LOCATION_OPTIONS = [
  { value: 'header', label: 'En la cabecera' },
  { value: 'line', label: 'En cada línea' },
];

/** Paletas de acceso rápido para los ColorInput: los colores de los presets de marca. */
const PRESET_PRIMARY_COLORS = Array.from(new Set(THEME_PRESETS.map((p) => p.colorPrimary)));
const PRESET_ACCENT_COLORS = Array.from(new Set(THEME_PRESETS.map((p) => p.colorAccent)));

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

/**
 * Vista previa de la fuente seleccionada en el borrador de branding. Inyecta el
 * stylesheet de Google Fonts de la opción (deduplicado por href) para que se
 * vea sin necesidad de guardar; ThemeContext gestiona la fuente ya aplicada.
 */
const FontPreview: React.FC<{ fontId: string }> = ({ fontId }) => {
  const font = fontOptionFor(fontId);
  useEffect(() => {
    const url = googleFontsUrl(font);
    if (!url) return;
    const existing = Array.from(
      document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
    );
    if (existing.some((l) => l.href === url)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.setAttribute('data-font-preview', '');
    document.head.appendChild(link);
  }, [font]);
  return (
    <p
      className="mt-2 text-sm text-slate-600 dark:text-slate-300"
      style={{ fontFamily: font.sans }}
    >
      AaBbCc 0123 — Ejemplo de texto con esta fuente
    </p>
  );
};

export const CompanySettings: React.FC = () => {
  const { token, user } = useAuth();
  // Branding/formato/comportamiento/app son PUT /api/config/:section — el backend
  // exige ADMIN o SUPERUSER (ver adminMiddleware en apps/server/src/api/config.ts).
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERUSER';
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
    coreApi
      .get('/api/config/app')
      .catch(() => null)
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
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const saveFormat = async () => {
    setSaving(true);
    try {
      await updateTheme('format', formatDraft);
      toast.success('Formato guardado');
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const saveFlags = async () => {
    setSaving(true);
    try {
      await updateTheme('flags', flagsDraft);
      toast.success('Comportamiento guardado');
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || 'Error al guardar');
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
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || 'Error al guardar');
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

      {/* Pestañas internas de la pantalla (no la navegación de módulo):
          `scrollable` reproduce el scroll horizontal que había a mano. */}
      <Tabs
        variant="underline"
        size="sm"
        scrollable
        items={tabs.map((t) => ({
          key: t.id,
          label: t.label,
          icon: <t.icon size={13} />,
        }))}
        value={activeTab}
        onChange={(key) => setActiveTab(key as TabId)}
      />

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
                <Select
                  label="Moneda"
                  options={CURRENCY_OPTIONS}
                  value={fiscal.currency}
                  onChange={(v) => setF('currency', v)}
                />
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
              {/* ColorInput reemplaza el par «selector nativo + campo hex» que
                  estaba montado a mano; `presets` ofrece la paleta de los
                  presets de marca para no tener que teclear el hex. */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ColorInput
                  label="Color primario"
                  value={brandingDraft.colorPrimary}
                  onChange={(v) => setBrandingDraft({ ...brandingDraft, colorPrimary: v })}
                  presets={PRESET_PRIMARY_COLORS}
                />
                <ColorInput
                  label="Color acento"
                  value={brandingDraft.colorAccent}
                  onChange={(v) => setBrandingDraft({ ...brandingDraft, colorAccent: v })}
                  presets={PRESET_ACCENT_COLORS}
                />
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Marca
              </h2>
              <Input
                label="Nombre de la aplicación"
                value={brandingDraft.appName}
                onChange={(e) => setBrandingDraft({ ...brandingDraft, appName: e.target.value })}
              />
              <div>
                <Input
                  label="URL del logo"
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
                  {/* Opciones derivadas de FONT_OPTIONS (6 entradas) → Select. */}
                  <Select
                    label="Familia tipográfica"
                    options={FONT_OPTIONS.map((f) => ({ value: f.id, label: f.label }))}
                    value={brandingDraft.fontFamily}
                    onChange={(v) => setBrandingDraft({ ...brandingDraft, fontFamily: v })}
                  />
                  <FontPreview fontId={brandingDraft.fontFamily} />
                </div>
                <Select
                  label="Modo"
                  options={THEME_MODE_OPTIONS}
                  value={brandingDraft.themeMode}
                  onChange={(v) => setBrandingDraft({ ...brandingDraft, themeMode: v as any })}
                />
              </div>
            </div>
          </Card>

          {!isAdmin && (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-right">
              Solo un administrador puede guardar esta configuración.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setBrandingDraft(branding)}
              disabled={saving}
            >
              Descartar
            </Button>
            <Button onClick={saveBranding} disabled={saving || !isAdmin}>
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
                <Select
                  label="Locale"
                  options={LOCALE_OPTIONS}
                  value={formatDraft.locale}
                  onChange={(v) => setFormatDraft({ ...formatDraft, locale: v })}
                />
                <Select
                  label="Formato de fecha"
                  options={DATE_FORMAT_OPTIONS}
                  value={formatDraft.dateFormat}
                  onChange={(v) => setFormatDraft({ ...formatDraft, dateFormat: v })}
                />
                {/* `emptyValue="zero"`: 0 decimales es una opción legítima. */}
                <NumberInput
                  label="Decimales importes"
                  value={formatDraft.decimalPrecision}
                  onChange={(v) => setFormatDraft({ ...formatDraft, decimalPrecision: v ?? 0 })}
                  min={0}
                  max={6}
                  emptyValue="zero"
                />
                <NumberInput
                  label="Decimales cantidades"
                  value={formatDraft.quantityPrecision}
                  onChange={(v) => setFormatDraft({ ...formatDraft, quantityPrecision: v ?? 0 })}
                  min={0}
                  max={6}
                  emptyValue="zero"
                />
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

          {!isAdmin && (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-right">
              Solo un administrador puede guardar esta configuración.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setFormatDraft(format)} disabled={saving}>
              Descartar
            </Button>
            <Button onClick={saveFormat} disabled={saving || !isAdmin}>
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
                label="Chat de Keiro en seguimiento público"
                hint="Añade un chat de IA a la página pública de seguimiento (/track/:token) para que el cliente pregunte por su envío o reporte una incidencia — sin login, así que actívalo solo si quieres exponer esa superficie públicamente."
                checked={!!flagsDraft.trackingChatEnabled}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, trackingChatEnabled: v })}
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
                checked={!!flagsDraft.hrShiftsEnabled}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, hrShiftsEnabled: v })}
              />
              <FlagRow
                label="RRHH · Planificación"
                hint="Cuadrante mensual de turnos asignados con vista calendario."
                checked={!!flagsDraft.hrPlanningEnabled}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, hrPlanningEnabled: v })}
              />
              <FlagRow
                label="RRHH · Fichajes"
                hint="Permite a los empleados fichar entrada/salida desde la web o desde kioskos compartidos."
                checked={!!flagsDraft.hrTimeclockEnabled}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, hrTimeclockEnabled: v })}
              />
              <FlagRow
                label="RRHH · Incidencias y sustituciones"
                hint="Tipos de incidencia configurables y flujo de sustitución asistida cuando aplican."
                checked={!!flagsDraft.hrIncidentsEnabled}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, hrIncidentsEnabled: v })}
              />
              <FlagRow
                label="RRHH avanzado+ (rendimientos, costes, evaluaciones, comisiones, tareas)"
                hint="Activa convenios colectivos, evaluaciones de desempeño, objetivos SMART, comisiones comerciales, dashboard de rendimiento, coste laboral, tareas y Gantt."
                checked={!!flagsDraft.hrAdvancedEnabled}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, hrAdvancedEnabled: v })}
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
                <Select
                  ariaLabel="Ubicación del almacén en documentos"
                  options={WAREHOUSE_LOCATION_OPTIONS}
                  value={flagsDraft.warehouseLocation}
                  onChange={(v) =>
                    setFlagsDraft({ ...flagsDraft, warehouseLocation: v as 'header' | 'line' })
                  }
                  containerClassName="w-48"
                />
              </div>
            </div>
          </Card>

          {!isAdmin && (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-right">
              Solo un administrador puede guardar esta configuración.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setFlagsDraft(flags)} disabled={saving}>
              Descartar
            </Button>
            <Button onClick={saveFlags} disabled={saving || !isAdmin}>
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
              <Input
                label="URL base"
                value={appConfig.publicBaseUrl}
                onChange={(e) => setAppConfig({ ...appConfig, publicBaseUrl: e.target.value })}
                placeholder="https://miempresa.com"
              />
            </div>
          </Card>

          {!isAdmin && (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-right">
              Solo un administrador puede guardar esta configuración.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setAppConfig({ publicBaseUrl: appConfig.publicBaseUrl })}
              disabled={saving}
            >
              Descartar
            </Button>
            <Button onClick={saveAppConfig} disabled={saving || !isAdmin}>
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
  // Checkbox y no Switch: aunque son flags de empresa, aquí se editan sobre un
  // borrador (`flagsDraft`) y solo se persisten al pulsar «Guardar
  // comportamiento» — no al mover el control.
  <label className="flex items-start gap-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0 cursor-pointer">
    <span className="mt-1">
      <Checkbox checked={checked} onChange={onChange} />
    </span>
    <div className="flex-1">
      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{label}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  </label>
);
