import { useI18n } from '@/i18n/I18nContext';
import React, { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  ColorInput,
  Input,
  Loader,
  PageHeader,
  SearchableSelect,
  Select,
  usePopup,
  useToast,
} from '@openfactu/ui';
import { Globe, Link2, Plus, Save, Settings2, ShoppingCart, Trash2 } from 'lucide-react';
import { FONT_OPTIONS, useTheme } from '@/context/ThemeContext';
import { priceListsApi } from '@/modules/documents/api/docsApi';
import { websiteApi } from '../api/websiteApi';
import type { WebsiteHost, WebsiteSite } from '../domain/website';

/** Ajustes del site: identidad, slug, tema, SEO y dominios. Solo admins. */
export const Settings: React.FC = () => {
  const { t } = useI18n();
  const toast = useToast();
  const popup = usePopup();
  const { branding } = useTheme();
  const [site, setSite] = useState<WebsiteSite | null>(null);
  const [hosts, setHosts] = useState<WebsiteHost[]>([]);
  const [priceLists, setPriceLists] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newHost, setNewHost] = useState<{ kind: 'subdomain' | 'domain'; value: string } | null>(
    null,
  );

  const fetchAll = async () => {
    try {
      const [s, h, pl] = await Promise.all([
        websiteApi.getSite(),
        websiteApi.listHosts(),
        priceListsApi.list().catch(() => []),
      ]);
      setSite(s);
      setHosts(h);
      setPriceLists(Array.isArray(pl) ? pl : []);
    } catch {
      toast.error(t('website.settings.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (p: Partial<WebsiteSite>) => setSite((s) => (s ? { ...s, ...p } : s));
  const patchTheme = (p: Record<string, string | undefined>) =>
    setSite((s) => (s ? { ...s, themeOverrides: { ...(s.themeOverrides ?? {}), ...p } } : s));

  const handleSave = async () => {
    if (!site) return;
    setSaving(true);
    try {
      const updated = await websiteApi.updateSite({
        name: site.name,
        slug: site.slug,
        themeOverrides: site.themeOverrides,
        seoTitle: site.seoTitle,
        seoDescription: site.seoDescription,
        ogImageUrl: site.ogImageUrl,
        priceListId: site.priceListId,
      });
      setSite(updated);
      toast.success(t('website.settings.saved'));
      fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('website.editor.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddHost = async () => {
    if (!newHost?.value) return;
    try {
      await websiteApi.addHost(newHost.kind, newHost.value.trim().toLowerCase());
      setNewHost(null);
      toast.success(t('website.settings.hostAdded'));
      fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('website.settings.hostAddError'));
    }
  };

  const handleRemoveHost = async (host: WebsiteHost) => {
    const ok = await popup.confirm({
      title: t('website.settings.removeDomain'),
      message: t('website.settings.removeDomainMessage', { host: host.value }),
      tone: 'danger',
      confirmLabel: t('website.settings.remove'),
    });
    if (!ok) return;
    try {
      await websiteApi.removeHost(host.id);
      fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('website.settings.hostRemoveError'));
    }
  };

  if (loading || !site) return <Loader />;

  const overrides = site.themeOverrides ?? {};

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500 max-w-4xl">
      <PageHeader
        eyebrow={t('website.settings.eyebrow')}
        title={t('website.nav.settingsTitle')}
        icon={<Settings2 size={18} />}
        size="lg"
        actions={
          <Button type="button" onClick={handleSave} disabled={saving}>
            <Save size={16} className="mr-2" />{' '}
            {saving ? t('website.common.saving') : t('website.common.save')}
          </Button>
        }
      />

      <Card className="space-y-4">
        <h2 className="font-black text-fg-default">{t('website.settings.identity')}</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">
              {t('website.settings.siteName')}
            </label>
            <Input value={site.name} onChange={(e) => patch({ name: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">
              {t('website.settings.slug')}
            </label>
            <Input
              value={site.slug}
              onChange={(e) =>
                patch({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })
              }
              className="font-mono"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              {t('website.settings.yourSite')}{' '}
              <span className="font-mono text-teal-600 dark:text-teal-300">
                {window.location.origin}/site/{site.slug}
              </span>
            </p>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-black text-fg-default">{t('website.settings.theme')}</h2>
        <p className="text-xs text-slate-400 -mt-2">{t('website.settings.themeHint')}</p>
        <div className="grid md:grid-cols-3 gap-4">
          <ColorInput
            label={t('website.theme.primaryColor')}
            value={overrides.colorPrimary ?? branding.colorPrimary}
            onChange={(v) => patchTheme({ colorPrimary: v })}
          />
          <ColorInput
            label={t('website.theme.accentColor')}
            value={overrides.colorAccent ?? branding.colorAccent}
            onChange={(v) => patchTheme({ colorAccent: v })}
          />
          <Select
            label={t('website.theme.font')}
            value={overrides.fontId ?? ''}
            onChange={(v) => patchTheme({ fontId: v || undefined })}
            options={[
              { value: '', label: t('website.theme.fontBranding', { font: branding.fontFamily }) },
              ...FONT_OPTIONS.map((f) => ({ value: f.id, label: f.label })),
            ]}
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-black text-fg-default flex items-center gap-2">
          <ShoppingCart size={16} /> {t('website.settings.store')}
        </h2>
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1">
            {t('website.settings.priceList')}
          </label>
          <SearchableSelect
            value={site.priceListId ?? ''}
            onChange={(v) => patch({ priceListId: v || null })}
            options={[
              { value: '', label: t('website.settings.basePrice') },
              ...priceLists.map((pl) => ({ value: pl.id, label: pl.name })),
            ]}
            placeholder={t('website.settings.basePrice')}
          />
          <p className="text-[11px] text-slate-400 mt-1">{t('website.settings.priceListHint')}</p>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-black text-fg-default">{t('website.settings.seo')}</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">
              {t('website.settings.seoTitle')}
            </label>
            <Input
              value={site.seoTitle ?? ''}
              onChange={(e) => patch({ seoTitle: e.target.value || null })}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">
              {t('website.settings.ogImage')}
            </label>
            <Input
              value={site.ogImageUrl ?? ''}
              onChange={(e) => patch({ ogImageUrl: e.target.value || null })}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1">
            {t('website.settings.description')}
          </label>
          <Input
            value={site.seoDescription ?? ''}
            onChange={(e) => patch({ seoDescription: e.target.value || null })}
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-fg-default">{t('website.settings.domains')}</h2>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setNewHost({ kind: 'subdomain', value: '' })}
            disabled={!!newHost}
          >
            <Plus size={14} className="mr-1" /> {t('website.settings.add')}
          </Button>
        </div>
        <p className="text-xs text-slate-400 -mt-2">
          {t('website.settings.domainsHint', { path: `/site/${site.slug}` })}
        </p>
        {newHost && (
          <div className="flex gap-2 items-center bg-teal-50/40 dark:bg-teal-500/5 p-3 rounded-lg">
            <Select
              ariaLabel={t('website.settings.hostType')}
              value={newHost.kind}
              onChange={(v) => setNewHost({ ...newHost, kind: v as 'subdomain' | 'domain' })}
              options={[
                { value: 'subdomain', label: t('website.settings.subdomain') },
                { value: 'domain', label: t('website.settings.ownDomain') },
              ]}
              containerClassName="w-44 shrink-0"
            />
            <Input
              placeholder={
                newHost.kind === 'subdomain'
                  ? 'acme.keirost.app'
                  : t('website.settings.domainPlaceholder')
              }
              value={newHost.value}
              onChange={(e) => setNewHost({ ...newHost, value: e.target.value })}
              className="h-9 font-mono text-sm flex-1"
            />
            <Button size="sm" onClick={handleAddHost}>
              {t('website.settings.add')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setNewHost(null)}>
              {t('website.common.cancel')}
            </Button>
          </div>
        )}
        <ul className="divide-y divide-border-subtle">
          {hosts.map((host) => (
            <li key={host.id} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                {host.kind === 'slug' ? (
                  <Globe size={16} className="text-slate-400" />
                ) : (
                  <Link2 size={16} className="text-slate-400" />
                )}
                <span className="font-mono text-sm text-fg-body">
                  {host.kind === 'slug' ? `/site/${host.value}` : host.value}
                </span>
                {host.kind === 'domain' && !host.verified && (
                  <Badge variant="warning">{t('website.settings.pendingVerification')}</Badge>
                )}
                {host.kind === 'slug' && <Badge variant="neutral">Slug</Badge>}
              </div>
              {host.kind !== 'slug' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveHost(host)}
                  title={t('website.settings.removeDomain')}
                  className="text-fg-subtle hover:text-rose-500"
                >
                  <Trash2 size={15} />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};
