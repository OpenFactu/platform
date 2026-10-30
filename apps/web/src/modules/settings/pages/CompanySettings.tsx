import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Input,
  Checkbox,
  ColorInput,
  NumberInput,
  PageHeader,
  Select,
  Tabs,
  Loader,
  useToast,
  useThemePresets,
  MOTION_CHARACTERS,
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
import { useI18n } from '@/i18n/I18nContext';
import {
  useTheme,
  type BrandingConfig,
  presetSwatch,
  FONT_OPTIONS,
  fontOptionFor,
  googleFontsUrl,
} from '@/context/ThemeContext';
import { ThemePresetCard } from '../components/ThemePresetCard';
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
  { value: 'light', label: 'settingsCompany.page.modes.light' },
  { value: 'dark', label: 'settingsCompany.page.modes.dark' },
];

// Ajustes finos del tema de @openfactu/ui; '' = lo que diga el preset.
const RADIUS_OPTIONS = [
  { value: '', label: 'settingsCompany.page.fromTheme' },
  { value: 'none', label: 'settingsCompany.page.radius.none' },
  { value: 'sm', label: 'settingsCompany.page.radius.sm' },
  { value: 'md', label: 'settingsCompany.page.radius.md' },
  { value: 'lg', label: 'settingsCompany.page.radius.lg' },
];

const DENSITY_OPTIONS = [
  { value: '', label: 'settingsCompany.page.fromTheme' },
  { value: 'compact', label: 'settingsCompany.page.density.compact' },
  { value: 'normal', label: 'settingsCompany.page.normal' },
  { value: 'comfortable', label: 'settingsCompany.page.density.comfortable' },
];

const TEXT_SCALE_OPTIONS = [
  { value: '0.9', label: 'settingsCompany.page.textScale.small' },
  { value: '1', label: 'settingsCompany.page.normal' },
  { value: '1.1', label: 'settingsCompany.page.textScale.large' },
  { value: '1.2', label: 'settingsCompany.page.textScale.xlarge' },
];

const MOTION_CHARACTER_OPTIONS = [
  { value: '', label: 'settingsCompany.page.fromTheme' },
  ...Object.entries(MOTION_CHARACTERS).map(([value, c]) => ({ value, label: c.label })),
];

const MOTION_SPEED_OPTIONS = [
  { value: '', label: 'settingsCompany.page.fromTheme' },
  { value: 'fast', label: 'settingsCompany.page.motionSpeed.fast' },
  { value: 'normal', label: 'settingsCompany.page.normal' },
  { value: 'slow', label: 'settingsCompany.page.motionSpeed.slow' },
  { value: 'none', label: 'settingsCompany.page.motionSpeed.none' },
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
  { value: 'header', label: 'settingsCompany.page.warehouseLocation.header' },
  { value: 'line', label: 'settingsCompany.page.warehouseLocation.line' },
];

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
  const { t } = useI18n();
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
    <p className="mt-2 text-sm text-fg-body" style={{ fontFamily: font.sans }}>
      {t('settingsCompany.page.fontSample')}
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
  const { t } = useI18n();
  const tr = (opts: { value: string; label: string }[]) =>
    opts.map((o) => ({ ...o, label: t(o.label) }));
  const themePresets = useThemePresets();
  const presetPrimaryColors = Array.from(
    new Set(themePresets.map((p) => presetSwatch(p).colorPrimary)),
  );
  const presetAccentColors = Array.from(
    new Set(themePresets.map((p) => presetSwatch(p).colorAccent)),
  );
  // Soporta deep-link al tab vía `?tab=storage|data|...` para enlazar directamente
  // a una pestaña concreta de Empresa desde otras partes de la app.
  const initialTab: TabId = (() => {
    if (typeof window === 'undefined') return 'fiscal';
    const tab = new URLSearchParams(window.location.search).get('tab');
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
    return allowed.includes(tab as TabId) ? (tab as TabId) : 'fiscal';
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
      toast.error(t('settingsCompany.page.loadError'));
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
      toast.success(t('settingsCompany.page.fiscalSaved'));
    } catch {
      toast.error(t('settingsCompany.page.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const saveBranding = async () => {
    setSaving(true);
    try {
      await updateTheme('branding', brandingDraft);
      toast.success(t('settingsCompany.page.brandingSaved'));
    } catch (e) {
      toast.error(
        (e instanceof Error ? e.message : undefined) || t('settingsCompany.page.saveError'),
      );
    } finally {
      setSaving(false);
    }
  };

  const saveFormat = async () => {
    setSaving(true);
    try {
      await updateTheme('format', formatDraft);
      toast.success(t('settingsCompany.page.formatSaved'));
    } catch (e) {
      toast.error(
        (e instanceof Error ? e.message : undefined) || t('settingsCompany.page.saveError'),
      );
    } finally {
      setSaving(false);
    }
  };

  const saveFlags = async () => {
    setSaving(true);
    try {
      await updateTheme('flags', flagsDraft);
      toast.success(t('settingsCompany.page.flagsSaved'));
    } catch (e) {
      toast.error(
        (e instanceof Error ? e.message : undefined) || t('settingsCompany.page.saveError'),
      );
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
      toast.success(t('settingsCompany.page.urlSaved'));
    } catch (e) {
      toast.error(
        (e instanceof Error ? e.message : undefined) || t('settingsCompany.page.saveError'),
      );
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
    { id: 'fiscal', label: t('settingsCompany.page.tabs.fiscal'), icon: FileText },
    { id: 'branding', label: t('settingsCompany.page.tabs.branding'), icon: Palette },
    { id: 'format', label: t('settingsCompany.page.tabs.format'), icon: Globe },
    { id: 'flags', label: t('settingsCompany.page.tabs.flags'), icon: SlidersHorizontal },
    { id: 'catalogs', label: t('settingsCompany.page.tabs.catalogs'), icon: Coins },
    { id: 'app', label: t('settingsCompany.page.tabs.app'), icon: Link },
    { id: 'storage', label: t('settingsCompany.page.tabs.storage'), icon: HardDrive },
    { id: 'email', label: t('settingsCompany.page.tabs.email'), icon: Mail },
    { id: 'ai', label: t('settingsCompany.page.tabs.ai'), icon: Sparkles },
    { id: 'data', label: t('settingsCompany.page.tabs.data'), icon: Upload },
    { id: 'backups', label: t('settingsCompany.page.tabs.backups'), icon: DatabaseBackup },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title={t('settingsCompany.page.title')}
        subtitle={t('settingsCompany.page.subtitle')}
        icon={<Building size={18} />}
        size="md"
        /* Pestañas internas de la pantalla (no la navegación de módulo):
           `scrollable` reproduce el scroll horizontal que había a mano. */
        tabs={
          <Tabs
            variant="underline"
            size="sm"
            scrollable
            items={tabs.map((tab) => ({
              key: tab.id,
              label: tab.label,
              icon: <tab.icon size={13} />,
            }))}
            value={activeTab}
            onChange={(key) => setActiveTab(key as TabId)}
          />
        }
      />

      {activeTab === 'fiscal' && (
        <div className="space-y-6">
          <Card>
            <div className="p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-fg-muted">
                {t('settingsCompany.page.sectionIdentification')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CountrySelect
                  label={t('settingsCompany.page.country')}
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
                  label={t('settingsCompany.page.companyName')}
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
              <h2 className="text-sm font-bold uppercase tracking-wide text-fg-muted">
                {t('settingsCompany.page.sectionAddress')}
              </h2>
              <Input
                label={t('settingsCompany.page.address')}
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
              <h2 className="text-sm font-bold uppercase tracking-wide text-fg-muted">
                {t('settingsCompany.page.sectionContact')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label={t('settingsCompany.page.email')}
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
                  label={t('settingsCompany.page.website')}
                  value={fiscal.website}
                  onChange={(e) => setF('website', e.target.value)}
                />
                <Input
                  label={t('settingsCompany.page.fiscalLogoUrl')}
                  value={fiscal.logoUrl}
                  onChange={(e) => setF('logoUrl', e.target.value)}
                />
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-fg-muted">
                {t('settingsCompany.page.sectionPreferences')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label={t('settingsCompany.page.currency')}
                  options={CURRENCY_OPTIONS}
                  value={fiscal.currency}
                  onChange={(v) => setF('currency', v)}
                />
                <Input
                  label={t('settingsCompany.page.fiscalYearStart')}
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
              {saving ? t('settingsCompany.page.saving') : t('settingsCompany.page.saveChanges')}
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
                    {t('settingsCompany.page.themePresets')}
                  </h2>
                  <p className="text-[12px] text-[var(--k-ink-500)] mt-1">
                    {t('settingsCompany.page.themePresetsHelp')}
                  </p>
                </div>
                {activePresetId === 'custom' && (
                  <span className="font-mono text-[10px] tracking-[1px] uppercase text-[var(--k-teal-600)] bg-[var(--k-teal-50)] border border-[var(--k-teal-100)] rounded-[2px] px-2 py-1">
                    {t('settingsCompany.page.custom')}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {themePresets.map((p) => (
                  <ThemePresetCard
                    key={p.id}
                    preset={p}
                    selected={activePresetId === p.id}
                    onSelect={() => applyPreset(p.id)}
                  />
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6 space-y-4">
              <h2 className="font-mono text-[10px] tracking-[1.5px] uppercase text-[var(--k-ink-400)]">
                {t('settingsCompany.page.colors')}
              </h2>
              {/* ColorInput reemplaza el par «selector nativo + campo hex» que
                  estaba montado a mano; `presets` ofrece la paleta de los
                  presets de marca para no tener que teclear el hex. */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ColorInput
                  label={t('settingsCompany.page.colorPrimary')}
                  value={brandingDraft.colorPrimary}
                  onChange={(v) =>
                    setBrandingDraft({ ...brandingDraft, colorPrimary: v, themePreset: '' })
                  }
                  presets={presetPrimaryColors}
                />
                <ColorInput
                  label={t('settingsCompany.page.colorAccent')}
                  value={brandingDraft.colorAccent}
                  onChange={(v) =>
                    setBrandingDraft({ ...brandingDraft, colorAccent: v, themePreset: '' })
                  }
                  presets={presetAccentColors}
                />
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-fg-muted">
                {t('settingsCompany.page.sectionBrand')}
              </h2>
              <Input
                label={t('settingsCompany.page.appName')}
                value={brandingDraft.appName}
                onChange={(e) => setBrandingDraft({ ...brandingDraft, appName: e.target.value })}
              />
              <div>
                <Input
                  label={t('settingsCompany.page.logoUrl')}
                  value={brandingDraft.logoUrl}
                  onChange={(e) => setBrandingDraft({ ...brandingDraft, logoUrl: e.target.value })}
                  placeholder="https://..."
                />
                {brandingDraft.logoUrl && (
                  <div className="mt-3 flex items-center gap-3">
                    <span className="text-xs text-fg-muted">
                      {t('settingsCompany.page.previewColon')}
                    </span>
                    <img
                      src={brandingDraft.logoUrl}
                      alt="logo"
                      className="h-12 w-12 rounded-lg object-cover border border-border-default"
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-fg-muted">
                {t('settingsCompany.page.sectionAppearance')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  {/* Opciones derivadas de FONT_OPTIONS (6 entradas) → Select. */}
                  <Select
                    label={t('settingsCompany.page.fontFamily')}
                    options={FONT_OPTIONS.map((f) => ({ value: f.id, label: f.label }))}
                    value={brandingDraft.fontFamily}
                    onChange={(v) => setBrandingDraft({ ...brandingDraft, fontFamily: v })}
                  />
                  <FontPreview fontId={brandingDraft.fontFamily} />
                </div>
                <Select
                  label={t('settingsCompany.page.mode')}
                  options={tr(THEME_MODE_OPTIONS)}
                  value={brandingDraft.themeMode}
                  onChange={(v) =>
                    setBrandingDraft({ ...brandingDraft, themeMode: v as any, themePreset: '' })
                  }
                />
                <Select
                  label={t('settingsCompany.page.corners')}
                  options={tr(RADIUS_OPTIONS)}
                  value={brandingDraft.radius}
                  onChange={(v) =>
                    setBrandingDraft({ ...brandingDraft, radius: v as BrandingConfig['radius'] })
                  }
                />
                <Select
                  label={t('settingsCompany.page.densityLabel')}
                  options={tr(DENSITY_OPTIONS)}
                  value={brandingDraft.density}
                  onChange={(v) =>
                    setBrandingDraft({ ...brandingDraft, density: v as BrandingConfig['density'] })
                  }
                />
                <Select
                  label={t('settingsCompany.page.textSize')}
                  options={tr(TEXT_SCALE_OPTIONS)}
                  value={String(brandingDraft.textScale || 1)}
                  onChange={(v) => setBrandingDraft({ ...brandingDraft, textScale: Number(v) })}
                />
                <Select
                  label={t('settingsCompany.page.motion')}
                  options={tr(MOTION_CHARACTER_OPTIONS)}
                  value={brandingDraft.motionCharacter}
                  onChange={(v) => setBrandingDraft({ ...brandingDraft, motionCharacter: v })}
                />
                <Select
                  label={t('settingsCompany.page.motionSpeedLabel')}
                  options={tr(MOTION_SPEED_OPTIONS)}
                  value={brandingDraft.motionSpeed}
                  onChange={(v) =>
                    setBrandingDraft({
                      ...brandingDraft,
                      motionSpeed: v as BrandingConfig['motionSpeed'],
                    })
                  }
                />
              </div>
              <p className="text-xs text-fg-muted">{t('settingsCompany.page.fromThemeHelp')}</p>
            </div>
          </Card>

          {!isAdmin && (
            <p className="text-xs text-fg-muted text-right">
              {t('settingsCompany.page.adminOnly')}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setBrandingDraft(branding)}
              disabled={saving}
            >
              {t('settingsCompany.page.discard')}
            </Button>
            <Button onClick={saveBranding} disabled={saving || !isAdmin}>
              <Save size={16} className="mr-2" />
              {saving ? t('settingsCompany.page.saving') : t('settingsCompany.page.saveBranding')}
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'format' && (
        <div className="space-y-6">
          <Card>
            <div className="p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-fg-muted">
                {t('settingsCompany.page.regionalization')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label={t('settingsCompany.page.locale')}
                  options={LOCALE_OPTIONS}
                  value={formatDraft.locale}
                  onChange={(v) => setFormatDraft({ ...formatDraft, locale: v })}
                />
                <Select
                  label={t('settingsCompany.page.dateFormat')}
                  options={DATE_FORMAT_OPTIONS}
                  value={formatDraft.dateFormat}
                  onChange={(v) => setFormatDraft({ ...formatDraft, dateFormat: v })}
                />
                {/* `emptyValue="zero"`: 0 decimales es una opción legítima. */}
                <NumberInput
                  label={t('settingsCompany.page.amountDecimals')}
                  value={formatDraft.decimalPrecision}
                  onChange={(v) => setFormatDraft({ ...formatDraft, decimalPrecision: v ?? 0 })}
                  min={0}
                  max={6}
                  emptyValue="zero"
                />
                <NumberInput
                  label={t('settingsCompany.page.quantityDecimals')}
                  value={formatDraft.quantityPrecision}
                  onChange={(v) => setFormatDraft({ ...formatDraft, quantityPrecision: v ?? 0 })}
                  min={0}
                  max={6}
                  emptyValue="zero"
                />
              </div>

              <div className="mt-4 p-4 bg-bg-muted rounded-lg">
                <p className="text-xs font-black uppercase text-fg-muted tracking-wide mb-2">
                  {t('settingsCompany.page.preview')}
                </p>
                <div className="space-y-1 text-sm text-fg-default">
                  <p>
                    <span className="text-fg-muted">{t('settingsCompany.page.amountColon')}</span>{' '}
                    <span className="font-bold">
                      {formatCurrency(1234.56, formatDraft, fiscal.currency || 'EUR')}
                    </span>
                  </p>
                  <p>
                    <span className="text-fg-muted">{t('settingsCompany.page.dateColon')}</span>{' '}
                    <span className="font-bold">{formatDate(new Date(), formatDraft)}</span>
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {!isAdmin && (
            <p className="text-xs text-fg-muted text-right">
              {t('settingsCompany.page.adminOnly')}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setFormatDraft(format)} disabled={saving}>
              {t('settingsCompany.page.discard')}
            </Button>
            <Button onClick={saveFormat} disabled={saving || !isAdmin}>
              <Save size={16} className="mr-2" />
              {saving ? t('settingsCompany.page.saving') : t('settingsCompany.page.saveFormat')}
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'flags' && (
        <div className="space-y-6">
          <Card>
            <div className="p-6 space-y-1">
              <h2 className="text-sm font-bold uppercase tracking-wide text-fg-muted mb-4">
                {t('settingsCompany.page.flagsTitle')}
              </h2>
              <FlagRow
                label={t('settingsCompany.page.flags.allowNegativeStock.label')}
                hint={t('settingsCompany.page.flags.allowNegativeStock.hint')}
                checked={flagsDraft.allowNegativeStock}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, allowNegativeStock: v })}
              />
              <FlagRow
                label={t('settingsCompany.page.flags.autoConfirmBatches.label')}
                hint={t('settingsCompany.page.flags.autoConfirmBatches.hint')}
                checked={flagsDraft.autoConfirmBatches}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, autoConfirmBatches: v })}
              />
              <FlagRow
                label={t('settingsCompany.page.flags.watermarkDraft.label')}
                hint={t('settingsCompany.page.flags.watermarkDraft.hint')}
                checked={flagsDraft.watermarkDraft}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, watermarkDraft: v })}
              />
              <FlagRow
                label={t('settingsCompany.page.flags.watermarkPaid.label')}
                hint={t('settingsCompany.page.flags.watermarkPaid.hint')}
                checked={flagsDraft.watermarkPaid}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, watermarkPaid: v })}
              />
              <FlagRow
                label={t('settingsCompany.page.flags.confirmBeforeCancel.label')}
                hint={t('settingsCompany.page.flags.confirmBeforeCancel.hint')}
                checked={flagsDraft.confirmBeforeCancel}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, confirmBeforeCancel: v })}
              />
              <FlagRow
                label={t('settingsCompany.page.flags.quoteDirectInvoiceEnabled.label')}
                hint={t('settingsCompany.page.flags.quoteDirectInvoiceEnabled.hint')}
                checked={flagsDraft.quoteDirectInvoiceEnabled !== false}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, quoteDirectInvoiceEnabled: v })}
              />
              <FlagRow
                label={t('settingsCompany.page.flags.enforceWarehouseZones.label')}
                hint={t('settingsCompany.page.flags.enforceWarehouseZones.hint')}
                checked={flagsDraft.enforceWarehouseZones}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, enforceWarehouseZones: v })}
              />
              <FlagRow
                label={t('settingsCompany.page.flags.trackingChatEnabled.label')}
                hint={t('settingsCompany.page.flags.trackingChatEnabled.hint')}
                checked={!!flagsDraft.trackingChatEnabled}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, trackingChatEnabled: v })}
              />
              <FlagRow
                label={t('settingsCompany.page.flags.logisticsOnly.label')}
                hint={t('settingsCompany.page.flags.logisticsOnly.hint')}
                checked={!!flagsDraft.logisticsOnly}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, logisticsOnly: v })}
              />
              <FlagRow
                label={t('settingsCompany.page.flags.hrShiftsEnabled.label')}
                hint={t('settingsCompany.page.flags.hrShiftsEnabled.hint')}
                checked={!!flagsDraft.hrShiftsEnabled}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, hrShiftsEnabled: v })}
              />
              <FlagRow
                label={t('settingsCompany.page.flags.hrPlanningEnabled.label')}
                hint={t('settingsCompany.page.flags.hrPlanningEnabled.hint')}
                checked={!!flagsDraft.hrPlanningEnabled}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, hrPlanningEnabled: v })}
              />
              <FlagRow
                label={t('settingsCompany.page.flags.hrTimeclockEnabled.label')}
                hint={t('settingsCompany.page.flags.hrTimeclockEnabled.hint')}
                checked={!!flagsDraft.hrTimeclockEnabled}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, hrTimeclockEnabled: v })}
              />
              <FlagRow
                label={t('settingsCompany.page.flags.hrIncidentsEnabled.label')}
                hint={t('settingsCompany.page.flags.hrIncidentsEnabled.hint')}
                checked={!!flagsDraft.hrIncidentsEnabled}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, hrIncidentsEnabled: v })}
              />
              <FlagRow
                label={t('settingsCompany.page.flags.hrAdvancedEnabled.label')}
                hint={t('settingsCompany.page.flags.hrAdvancedEnabled.hint')}
                checked={!!flagsDraft.hrAdvancedEnabled}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, hrAdvancedEnabled: v })}
              />
              <div className="flex items-center justify-between py-3 border-t border-border-subtle">
                <div className="flex-1 pr-4">
                  <div className="text-sm font-semibold text-fg-default">
                    {t('settingsCompany.page.warehouseLocationLabel')}
                  </div>
                  <div className="text-xs text-fg-muted mt-0.5">
                    {t('settingsCompany.page.warehouseLocationHelp')}
                  </div>
                </div>
                <Select
                  ariaLabel={t('settingsCompany.page.warehouseLocationLabel')}
                  options={tr(WAREHOUSE_LOCATION_OPTIONS)}
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
            <p className="text-xs text-fg-muted text-right">
              {t('settingsCompany.page.adminOnly')}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setFlagsDraft(flags)} disabled={saving}>
              {t('settingsCompany.page.discard')}
            </Button>
            <Button onClick={saveFlags} disabled={saving || !isAdmin}>
              <Save size={16} className="mr-2" />
              {saving ? t('settingsCompany.page.saving') : t('settingsCompany.page.saveFlags')}
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'app' && (
        <div className="space-y-6">
          <Card>
            <div className="p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-fg-muted">
                {t('settingsCompany.page.publicUrl')}
              </h2>
              <p className="text-xs text-fg-muted">{t('settingsCompany.page.publicUrlHelp')}</p>
              <Input
                label={t('settingsCompany.page.baseUrl')}
                value={appConfig.publicBaseUrl}
                onChange={(e) => setAppConfig({ ...appConfig, publicBaseUrl: e.target.value })}
                placeholder="https://miempresa.com"
              />
            </div>
          </Card>

          {!isAdmin && (
            <p className="text-xs text-fg-muted text-right">
              {t('settingsCompany.page.adminOnly')}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setAppConfig({ publicBaseUrl: appConfig.publicBaseUrl })}
              disabled={saving}
            >
              {t('settingsCompany.page.discard')}
            </Button>
            <Button onClick={saveAppConfig} disabled={saving || !isAdmin}>
              <Save size={16} className="mr-2" />
              {saving ? t('settingsCompany.page.saving') : t('settingsCompany.page.saveUrl')}
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
  <label className="flex items-start gap-4 py-3 border-b border-border-subtle last:border-0 cursor-pointer">
    <span className="mt-1">
      <Checkbox checked={checked} onChange={onChange} />
    </span>
    <div className="flex-1">
      <p className="text-sm font-bold text-fg-default">{label}</p>
      <p className="text-xs text-fg-muted">{hint}</p>
    </div>
  </label>
);
