import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Input, Loader, useToast } from '@openfactu/ui';
import { ExternalLink, Globe, Pencil, Plus, Rocket, Save, Trash2, X } from 'lucide-react';
import { websiteApi } from '../api/websiteApi';
import type { WebsitePage, WebsiteSite } from '../domain/website';

/** Lista de páginas del site: crear, editar (→ editor), publicar y ver la web. */
export const Pages: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const [site, setSite] = useState<WebsiteSite | null>(null);
  const [pages, setPages] = useState<WebsitePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRow, setNewRow] = useState<{ title: string; path: string } | null>(null);
  const [publishing, setPublishing] = useState(false);

  const fetchAll = async () => {
    try {
      const [s, p] = await Promise.all([websiteApi.getSite(), websiteApi.listPages()]);
      setSite(s);
      setPages(p);
    } catch {
      toast.error('Error al cargar la web');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    if (!newRow?.title) return;
    try {
      const page = await websiteApi.createPage({
        title: newRow.title,
        path: newRow.path.startsWith('/') ? newRow.path : `/${newRow.path}`,
      });
      setNewRow(null);
      toast.success('Página creada');
      navigate(`/website/editor/${page.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear la página');
    }
  };

  const handleDelete = async (page: WebsitePage) => {
    if (!confirm(`¿Eliminar la página "${page.title}"?`)) return;
    try {
      await websiteApi.deletePage(page.id);
      toast.success('Página eliminada');
      fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar');
    }
  };

  const handlePublishAll = async () => {
    setPublishing(true);
    try {
      const r = await websiteApi.publishAll();
      toast.success(`Web publicada (${r.pages} páginas)`);
      fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al publicar');
    } finally {
      setPublishing(false);
    }
  };

  if (loading) return <Loader />;

  const publicUrl = site ? `/site/${site.slug}` : '#';

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 bg-teal-600 rounded-lg text-white">
              <Globe size={20} />
            </span>
            <span className="text-[10px] font-black text-teal-600 dark:text-teal-300 uppercase tracking-[0.2em]">
              Website / Páginas
            </span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight text-display">
            {site?.name || 'Mi web'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            Construye tu web por bloques y publícala en{' '}
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="text-teal-600 dark:text-teal-300 font-bold hover:underline"
            >
              /site/{site?.slug}
            </a>
            .
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.open(publicUrl, '_blank')}>
            <ExternalLink size={16} className="mr-2" /> Ver web
          </Button>
          <Button variant="secondary" onClick={handlePublishAll} disabled={publishing}>
            <Rocket size={16} className="mr-2" /> {publishing ? 'Publicando…' : 'Publicar todo'}
          </Button>
          <Button onClick={() => setNewRow({ title: '', path: '/' })} disabled={!!newRow}>
            <Plus size={18} className="mr-2" /> Nueva página
          </Button>
        </div>
      </header>

      <Card className="overflow-hidden border-0" noPadding>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase font-black text-slate-400 dark:text-slate-500">
              <th className="px-6 py-4">Página</th>
              <th className="px-6 py-4">Ruta</th>
              <th className="px-6 py-4">Estado</th>
              <th className="px-6 py-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {newRow && (
              <tr className="bg-teal-50/30 animate-in zoom-in-95 duration-200">
                <td className="px-4 py-3">
                  <Input
                    placeholder="Título (Ej: Servicios)"
                    value={newRow.title}
                    onChange={(e) => setNewRow({ ...newRow, title: e.target.value })}
                    className="h-9 text-sm"
                  />
                </td>
                <td className="px-4 py-3">
                  <Input
                    placeholder="/servicios"
                    value={newRow.path}
                    onChange={(e) => setNewRow({ ...newRow, path: e.target.value.toLowerCase() })}
                    className="h-9 font-mono text-sm"
                  />
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right space-x-1">
                  <Button size="sm" onClick={handleCreate}>
                    <Save size={14} className="mr-2" /> Crear
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setNewRow(null)}>
                    <X size={14} />
                  </Button>
                </td>
              </tr>
            )}

            {pages.map((page) => (
              <tr
                key={page.id}
                className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <td className="px-6 py-3">
                  <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                    {page.title}
                    {page.isHome && (
                      <Badge variant="neutral" className="ml-2 text-[10px]">
                        Inicio
                      </Badge>
                    )}
                  </p>
                </td>
                <td className="px-6 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                  {page.path}
                </td>
                <td className="px-6 py-3">
                  {page.status === 'published' ? (
                    <Badge variant="success">Publicada</Badge>
                  ) : (
                    <Badge variant="neutral">Borrador</Badge>
                  )}
                </td>
                <td className="px-6 py-3 text-right space-x-1">
                  <Button size="sm" onClick={() => navigate(`/website/editor/${page.id}`)}>
                    <Pencil size={14} className="mr-2" /> Editar
                  </Button>
                  <button
                    onClick={() => !page.isHome && handleDelete(page)}
                    disabled={page.isHome}
                    className={`p-2 transition-all rounded-xl ${!page.isHome ? 'text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10' : 'text-slate-100 dark:text-slate-800 cursor-not-allowed'}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};
