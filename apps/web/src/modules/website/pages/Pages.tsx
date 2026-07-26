import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Input, Loader, usePopup, useToast } from '@openfactu/ui';
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Pencil,
  Plus,
  Rocket,
  Save,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { websiteApi } from '../api/websiteApi';
import type { WebsitePage, WebsiteSite } from '../domain/website';

/** Ruta reservada: sus bloques renderizan TODAS las fichas de producto /p/… */
const PRODUCT_TEMPLATE_PATH = '/plantilla-producto';

/** Lista de páginas del site: crear, editar (→ editor), publicar y ver la web. */
export const Pages: React.FC = () => {
  const toast = useToast();
  const popup = usePopup();
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
    const ok = await popup.confirm({
      title: 'Eliminar página',
      message: `¿Eliminar la página "${page.title}"?`,
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await websiteApi.deletePage(page.id);
      toast.success('Página eliminada');
      fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar');
    }
  };

  /**
   * Reordena la página en el menú automático: intercambia posición con su
   * vecina y persiste navOrder secuencial para toda la lista (así el orden
   * queda estable aunque haya páginas sin navOrder previo).
   */
  const handleMove = async (page: WebsitePage, dir: -1 | 1) => {
    const idx = pages.findIndex((p) => p.id === page.id);
    const swapWith = pages[idx + dir];
    if (!swapWith) return;
    const next = [...pages];
    next[idx] = swapWith;
    next[idx + dir] = page;
    setPages(next);
    try {
      await Promise.all(next.map((p, i) => websiteApi.updatePage(p.id, { navOrder: i })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al reordenar');
      fetchAll();
    }
  };

  /** Muestra/oculta la página del menú automático (sigue publicada por URL). */
  const handleToggleNav = async (page: WebsitePage) => {
    try {
      await websiteApi.updatePage(page.id, { showInNav: !page.showInNav });
      fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cambiar visibilidad');
    }
  };

  /** Abre la plantilla de producto — creándola con un diseño inicial si no existe. */
  const handleProductTemplate = async () => {
    const existing = pages.find((p) => p.path === PRODUCT_TEMPLATE_PATH);
    if (existing) return navigate(`/website/editor/${existing.id}`);
    try {
      const page = await websiteApi.createPage({
        title: 'Plantilla de producto',
        path: PRODUCT_TEMPLATE_PATH,
      });
      // Diseño de partida: menú + ficha completa (luego se sustituye por piezas si quieren)
      await websiteApi.updatePage(page.id, {
        blocksDraft: {
          version: 1,
          blocks: [
            {
              id: 'nav',
              type: 'navbar',
              props: {
                showLogo: true,
                sticky: true,
                variant: 'classic',
                side: 'left',
                links: [],
                autoPageLinks: true,
              },
            },
            { id: 'product', type: 'productDetail', props: {} },
          ],
        } as WebsitePage['blocksDraft'],
      });
      toast.success('Plantilla creada — al publicarla, todas las fichas /p/… la usarán');
      navigate(`/website/editor/${page.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear la plantilla');
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
          <Button
            variant="secondary"
            onClick={handleProductTemplate}
            title="Diseña cómo se ven las fichas de producto (/p/…) de la tienda"
          >
            <Tag size={16} className="mr-2" /> Plantilla de producto
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
              <th className="px-6 py-4">Menú</th>
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
                    {page.path === PRODUCT_TEMPLATE_PATH && (
                      <Badge variant="info" className="ml-2 text-[10px]">
                        Plantilla de producto
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
                <td className="px-6 py-3">
                  {page.path !== PRODUCT_TEMPLATE_PATH && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMove(page, -1)}
                        disabled={pages.findIndex((p) => p.id === page.id) === 0}
                        title="Subir en el menú"
                      >
                        <ArrowUp size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMove(page, 1)}
                        disabled={pages.findIndex((p) => p.id === page.id) === pages.length - 1}
                        title="Bajar en el menú"
                      >
                        <ArrowDown size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleNav(page)}
                        title={
                          page.showInNav === false
                            ? 'Oculta del menú (visible por URL) — pulsar para mostrar'
                            : 'Visible en el menú — pulsar para ocultar'
                        }
                        className={
                          page.showInNav === false
                            ? 'text-slate-300 dark:text-slate-600'
                            : 'text-teal-600 dark:text-teal-300'
                        }
                      >
                        {page.showInNav === false ? <EyeOff size={14} /> : <Eye size={14} />}
                      </Button>
                    </div>
                  )}
                </td>
                <td className="px-6 py-3 text-right space-x-1">
                  <Button size="sm" onClick={() => navigate(`/website/editor/${page.id}`)}>
                    <Pencil size={14} className="mr-2" /> Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(page)}
                    disabled={page.isHome}
                    title={page.isHome ? 'La página de inicio no se puede eliminar' : 'Eliminar'}
                    className="text-slate-300 dark:text-slate-600 hover:text-rose-500"
                  >
                    <Trash2 size={16} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};
