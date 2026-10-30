import { useI18n } from '@/i18n/I18nContext';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  Input,
  Loader,
  PageHeader,
  Table,
  usePopup,
  useToast,
} from '@openfactu/ui';
import type { RowAction, TableColumn } from '@openfactu/ui';
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
  const { t } = useI18n();
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
      toast.error(t('website.pages.loadError'));
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
      toast.success(t('website.pages.created'));
      navigate(`/website/editor/${page.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('website.pages.createError'));
    }
  };

  const handleDelete = async (page: WebsitePage) => {
    const ok = await popup.confirm({
      title: t('website.pages.deleteTitle'),
      message: t('website.pages.deleteMessage', { title: page.title }),
      tone: 'danger',
      confirmLabel: t('website.common.delete'),
    });
    if (!ok) return;
    try {
      await websiteApi.deletePage(page.id);
      toast.success(t('website.pages.deleted'));
      fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('website.media.deleteError'));
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
      toast.error(e instanceof Error ? e.message : t('website.pages.reorderError'));
      fetchAll();
    }
  };

  /** Muestra/oculta la página del menú automático (sigue publicada por URL). */
  const handleToggleNav = async (page: WebsitePage) => {
    try {
      await websiteApi.updatePage(page.id, { showInNav: !page.showInNav });
      fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('website.pages.visibilityError'));
    }
  };

  /** Abre la plantilla de producto — creándola con un diseño inicial si no existe. */
  const handleProductTemplate = async () => {
    const existing = pages.find((p) => p.path === PRODUCT_TEMPLATE_PATH);
    if (existing) return navigate(`/website/editor/${existing.id}`);
    try {
      const page = await websiteApi.createPage({
        title: t('website.pages.productTemplate'),
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
      toast.success(t('website.pages.templateCreated'));
      navigate(`/website/editor/${page.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('website.pages.templateError'));
    }
  };

  const handlePublishAll = async () => {
    setPublishing(true);
    try {
      const r = await websiteApi.publishAll();
      toast.success(t('website.pages.sitePublished', { count: r.pages }));
      fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('website.editor.publishError'));
    } finally {
      setPublishing(false);
    }
  };

  if (loading) return <Loader />;

  const publicUrl = site ? `/site/${site.slug}` : '#';

  const columns: TableColumn<WebsitePage>[] = [
    {
      header: t('website.pages.page'),
      primary: true,
      cell: (page) => (
        <span className="font-bold text-fg-default text-sm">
          {page.title}
          {page.isHome && (
            <Badge variant="neutral" className="ml-2 text-[10px]">
              {t('website.pages.home')}
            </Badge>
          )}
          {page.path === PRODUCT_TEMPLATE_PATH && (
            <Badge variant="info" className="ml-2 text-[10px]">
              {t('website.pages.productTemplate')}
            </Badge>
          )}
        </span>
      ),
    },
    {
      header: t('website.pages.path'),
      accessor: 'path',
      className: 'font-mono text-xs text-fg-muted',
    },
    {
      header: t('website.pages.status'),
      cell: (page) =>
        page.status === 'published' ? (
          <Badge variant="success">{t('website.status.published')}</Badge>
        ) : (
          <Badge variant="neutral">{t('website.status.draft')}</Badge>
        ),
    },
    {
      header: t('website.pages.menu'),
      cell: (page) =>
        page.path === PRODUCT_TEMPLATE_PATH ? null : (
          // La fila entera navega al editor: los controles del menú paran la
          // propagación para que subir/bajar/ocultar no abran la página.
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleMove(page, -1)}
              disabled={pages.findIndex((p) => p.id === page.id) === 0}
              title={t('website.pages.moveUp')}
            >
              <ArrowUp size={14} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleMove(page, 1)}
              disabled={pages.findIndex((p) => p.id === page.id) === pages.length - 1}
              title={t('website.pages.moveDown')}
            >
              <ArrowDown size={14} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleToggleNav(page)}
              title={
                page.showInNav === false
                  ? t('website.pages.hiddenInMenu')
                  : t('website.pages.visibleInMenu')
              }
              className={page.showInNav === false ? 'text-fg-subtle' : 'text-accent'}
            >
              {page.showInNav === false ? <EyeOff size={14} /> : <Eye size={14} />}
            </Button>
          </div>
        ),
    },
  ];

  const rowActions = (page: WebsitePage): RowAction[] => [
    {
      label: t('website.common.edit'),
      icon: <Pencil size={14} />,
      onClick: () => navigate(`/website/editor/${page.id}`),
    },
    {
      label: t('website.common.delete'),
      icon: <Trash2 size={14} />,
      destructive: true,
      // La home no se puede borrar: antes era un botón deshabilitado.
      disabled: page.isHome,
      onClick: () => handleDelete(page),
    },
  ];

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <PageHeader
        eyebrow={t('website.pages.eyebrow')}
        title={site?.name || t('website.pages.mySite')}
        subtitle={
          <>
            {t('website.pages.subtitle')}{' '}
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent font-bold hover:underline"
            >
              /site/{site?.slug}
            </a>
            .
          </>
        }
        icon={<Globe size={18} />}
        size="lg"
        actions={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => window.open(publicUrl, '_blank')}
            >
              <ExternalLink size={16} className="mr-2" /> {t('website.pages.viewSite')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleProductTemplate}
              title={t('website.pages.productTemplateHint')}
            >
              <Tag size={16} className="mr-2" /> {t('website.pages.productTemplate')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handlePublishAll}
              disabled={publishing}
            >
              <Rocket size={16} className="mr-2" />{' '}
              {publishing ? t('website.editor.publishing') : t('website.pages.publishAll')}
            </Button>
            <Button
              type="button"
              onClick={() => setNewRow({ title: '', path: '/' })}
              disabled={!!newRow}
            >
              <Plus size={18} className="mr-2" /> {t('website.pages.new')}
            </Button>
          </div>
        }
      />

      <Card className="overflow-hidden border-0" noPadding>
        <Table
          columns={columns}
          data={pages}
          rowActions={rowActions}
          onRowClick={(page) => navigate(`/website/editor/${page.id}`)}
          emptyMessage={t('website.pages.empty')}
          skeletonRowHeight={24}
          appendRow={
            // El alta rápida ya no es un <tr> con celdas: la Table la pinta
            // como una fila a lo ancho al final del cuerpo.
            newRow ? (
              <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-bg-muted">
                <Input
                  placeholder={t('website.pages.titlePlaceholder')}
                  value={newRow.title}
                  onChange={(e) => setNewRow({ ...newRow, title: e.target.value })}
                  containerClassName="flex-1 min-w-[180px]"
                  inputSize="sm"
                  autoFocus
                />
                <Input
                  placeholder="/servicios"
                  value={newRow.path}
                  onChange={(e) => setNewRow({ ...newRow, path: e.target.value.toLowerCase() })}
                  containerClassName="flex-1 min-w-[160px]"
                  inputSize="sm"
                  className="font-mono"
                />
                <Button type="button" size="sm" onClick={handleCreate}>
                  <Save size={14} className="mr-2" /> {t('website.pages.create')}
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setNewRow(null)}>
                  <X size={14} />
                </Button>
              </div>
            ) : null
          }
        />
      </Card>
    </div>
  );
};
