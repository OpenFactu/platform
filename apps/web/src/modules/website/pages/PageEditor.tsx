import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SiteEditor, type PageDocument, type RenderContext } from '@openfactu/site-builder';
import { Badge, Button, Loader, useToast } from '@openfactu/ui';
import { ArrowLeft, Eye, Rocket, Save } from 'lucide-react';
import { websiteApi } from '../api/websiteApi';
import type { WebsitePage, WebsiteSite } from '../domain/website';
import { useSiteTheme } from '../hooks/useSiteTheme';

const AUTOSAVE_MS = 1500;

/** Editor a pantalla completa de una página: canvas + autosave + publicar. */
export const PageEditor: React.FC = () => {
  const { pageId } = useParams<{ pageId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [site, setSite] = useState<WebsiteSite | null>(null);
  const [page, setPage] = useState<WebsitePage | null>(null);
  const [pages, setPages] = useState<WebsitePage[]>([]);
  const [doc, setDoc] = useState<PageDocument | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const theme = useSiteTheme(site);

  useEffect(() => {
    (async () => {
      try {
        const [s, p, all] = await Promise.all([
          websiteApi.getSite(),
          websiteApi.getPage(pageId!),
          websiteApi.listPages(),
        ]);
        setSite(s);
        setPage(p);
        setPages(all);
        setDoc(p.blocksDraft ?? { version: 1, blocks: [] });
      } catch {
        toast.error('No se pudo cargar la página');
        navigate('/website/pages');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  const save = useCallback(
    async (docToSave: PageDocument) => {
      if (!pageId) return;
      setSaving(true);
      try {
        await websiteApi.updatePage(pageId, { blocksDraft: docToSave });
        setDirty(false);
      } catch {
        toast.error('Error al guardar');
      } finally {
        setSaving(false);
      }
    },
    [pageId, toast],
  );

  // Autosave con debounce sobre cada cambio del documento
  const handleChange = (next: PageDocument) => {
    setDoc(next);
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(next), AUTOSAVE_MS);
  };

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const handlePreview = async () => {
    if (!pageId || !doc) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await save(doc);
    const html = await websiteApi.previewHtml(pageId);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank');
  };

  const handlePublish = async () => {
    if (!pageId || !doc) return;
    setPublishing(true);
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await save(doc);
      await websiteApi.publishPage(pageId);
      toast.success('Página publicada');
      setPage((p) => (p ? { ...p, status: 'published' } : p));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al publicar');
    } finally {
      setPublishing(false);
    }
  };

  const uploadImage = async (file: File): Promise<string> => {
    const asset = await websiteApi.uploadAsset(file);
    return asset.publicUrl;
  };

  if (!site || !page || !doc) return <Loader />;

  const ctx: RenderContext = {
    basePath: `/site/${site.slug}`,
    contactEndpoint: `/site/${site.slug}/contact`,
    pages: pages.map((p) => ({ path: p.path, title: p.title })),
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] min-h-[480px] animate-in fade-in duration-300">
      <header className="flex items-center justify-between gap-4 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-3 min-w-0">
          <Button size="sm" variant="secondary" onClick={() => navigate('/website/pages')}>
            <ArrowLeft size={14} className="mr-1" /> Páginas
          </Button>
          <div className="min-w-0">
            <p className="font-black text-slate-900 dark:text-slate-100 truncate leading-tight">
              {page.title}
            </p>
            <p className="text-[11px] font-mono text-slate-400 leading-tight">{page.path}</p>
          </div>
          {page.status === 'published' ? (
            <Badge variant="success">Publicada</Badge>
          ) : (
            <Badge variant="neutral">Borrador</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 font-medium w-24 text-right">
            {saving ? 'Guardando…' : dirty ? 'Cambios sin guardar' : 'Guardado'}
          </span>
          <Button size="sm" variant="secondary" onClick={() => save(doc)} disabled={saving}>
            <Save size={14} className="mr-1" /> Guardar
          </Button>
          <Button size="sm" variant="secondary" onClick={handlePreview}>
            <Eye size={14} className="mr-1" /> Vista previa
          </Button>
          <Button size="sm" onClick={handlePublish} disabled={publishing}>
            <Rocket size={14} className="mr-1" /> {publishing ? 'Publicando…' : 'Publicar'}
          </Button>
        </div>
      </header>
      <div className="flex-1 min-h-0">
        <SiteEditor
          doc={doc}
          onChange={handleChange}
          theme={theme}
          ctx={ctx}
          uploadImage={uploadImage}
        />
      </div>
    </div>
  );
};
