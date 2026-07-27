import React, { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  ColorInput,
  Input,
  Loader,
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
      toast.error('Error al cargar los ajustes');
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
      toast.success('Ajustes guardados');
      fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleAddHost = async () => {
    if (!newHost?.value) return;
    try {
      await websiteApi.addHost(newHost.kind, newHost.value.trim().toLowerCase());
      setNewHost(null);
      toast.success('Host añadido');
      fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al añadir host');
    }
  };

  const handleRemoveHost = async (host: WebsiteHost) => {
    const ok = await popup.confirm({
      title: 'Quitar dominio',
      message: `¿Quitar ${host.value}?`,
      tone: 'danger',
      confirmLabel: 'Quitar',
    });
    if (!ok) return;
    try {
      await websiteApi.removeHost(host.id);
      fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al quitar host');
    }
  };

  if (loading || !site) return <Loader />;

  const overrides = site.themeOverrides ?? {};

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500 max-w-4xl">
      <header className="flex items-end justify-between gap-6 pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 bg-teal-600 rounded-lg text-white">
              <Settings2 size={20} />
            </span>
            <span className="text-[10px] font-black text-teal-600 dark:text-teal-300 uppercase tracking-[0.2em]">
              Website / Ajustes
            </span>
          </div>
          <h1 className="text-4xl font-black text-fg-default tracking-tight text-display">
            Ajustes de la web
          </h1>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save size={16} className="mr-2" /> {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </header>

      <Card className="space-y-4">
        <h2 className="font-black text-fg-default">Identidad</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Nombre del site</label>
            <Input value={site.name} onChange={(e) => patch({ name: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Slug (URL)</label>
            <Input
              value={site.slug}
              onChange={(e) =>
                patch({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })
              }
              className="font-mono"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Tu web:{' '}
              <span className="font-mono text-teal-600 dark:text-teal-300">
                {window.location.origin}/site/{site.slug}
              </span>
            </p>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-black text-fg-default">Tema</h2>
        <p className="text-xs text-slate-400 -mt-2">
          Por defecto la web usa el branding de la empresa; aquí puedes sobreescribirlo solo para la
          web.
        </p>
        <div className="grid md:grid-cols-3 gap-4">
          <ColorInput
            label="Color primario"
            value={overrides.colorPrimary ?? branding.colorPrimary}
            onChange={(v) => patchTheme({ colorPrimary: v })}
          />
          <ColorInput
            label="Color de acento"
            value={overrides.colorAccent ?? branding.colorAccent}
            onChange={(v) => patchTheme({ colorAccent: v })}
          />
          <Select
            label="Fuente"
            value={overrides.fontId ?? ''}
            onChange={(v) => patchTheme({ fontId: v || undefined })}
            options={[
              { value: '', label: `Como el branding (${branding.fontFamily})` },
              ...FONT_OPTIONS.map((f) => ({ value: f.id, label: f.label })),
            ]}
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-black text-fg-default flex items-center gap-2">
          <ShoppingCart size={16} /> Tienda
        </h2>
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1">
            Tarifa de precios de la web
          </label>
          <SearchableSelect
            value={site.priceListId ?? ''}
            onChange={(v) => patch({ priceListId: v || null })}
            options={[
              { value: '', label: 'Precio base de los artículos' },
              ...priceLists.map((pl) => ({ value: pl.id, label: pl.name })),
            ]}
            placeholder="Precio base de los artículos"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            La tienda muestra (y el checkout cobra) los precios de esta tarifa. Si el precio de
            tarifa es menor que el base, el producto sale como oferta: precio anterior tachado y
            badge de descuento. Los artículos sin precio en la tarifa usan su precio base.
          </p>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-black text-fg-default">SEO por defecto</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Título SEO</label>
            <Input
              value={site.seoTitle ?? ''}
              onChange={(e) => patch({ seoTitle: e.target.value || null })}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Imagen OG (URL)</label>
            <Input
              value={site.ogImageUrl ?? ''}
              onChange={(e) => patch({ ogImageUrl: e.target.value || null })}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1">Descripción</label>
          <Input
            value={site.seoDescription ?? ''}
            onChange={(e) => patch({ seoDescription: e.target.value || null })}
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-fg-default">Dominios</h2>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setNewHost({ kind: 'subdomain', value: '' })}
            disabled={!!newHost}
          >
            <Plus size={14} className="mr-1" /> Añadir
          </Button>
        </div>
        <p className="text-xs text-slate-400 -mt-2">
          Además de /site/{site.slug}, la web puede servirse bajo un subdominio de la plataforma o
          un dominio propio (requiere configuración DNS).
        </p>
        {newHost && (
          <div className="flex gap-2 items-center bg-teal-50/40 dark:bg-teal-500/5 p-3 rounded-xl">
            <Select
              ariaLabel="Tipo de host"
              value={newHost.kind}
              onChange={(v) => setNewHost({ ...newHost, kind: v as 'subdomain' | 'domain' })}
              options={[
                { value: 'subdomain', label: 'Subdominio' },
                { value: 'domain', label: 'Dominio propio' },
              ]}
              containerClassName="w-44 shrink-0"
            />
            <Input
              placeholder={newHost.kind === 'subdomain' ? 'acme.keirost.app' : 'www.miempresa.com'}
              value={newHost.value}
              onChange={(e) => setNewHost({ ...newHost, value: e.target.value })}
              className="h-9 font-mono text-sm flex-1"
            />
            <Button size="sm" onClick={handleAddHost}>
              Añadir
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setNewHost(null)}>
              Cancelar
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
                  <Badge variant="warning">Pendiente de verificación</Badge>
                )}
                {host.kind === 'slug' && <Badge variant="neutral">Slug</Badge>}
              </div>
              {host.kind !== 'slug' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveHost(host)}
                  title="Quitar dominio"
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
