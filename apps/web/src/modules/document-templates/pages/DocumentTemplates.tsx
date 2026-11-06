import React, { useEffect, useState } from 'react';
import { usePopup, useToast } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { useTabs } from '@/context/TabsContext';
import { useI18n } from '@/i18n/I18nContext';
import { TemplateEditor } from '../components/TemplateEditor';
import { TemplatesList } from '../components/TemplatesList';
import { DocumentGeneratorModal } from '../components/DocumentGeneratorModal';
import { AiTemplateGeneratorModal } from '../components/AiTemplateGeneratorModal';
import { NewTemplateModal } from '../components/NewTemplateModal';
import { compileCanvas } from '../components/canvas/compileCanvas';
import type { DocType, TemplateRow } from '../components/constants';
import { createEmptyLayout } from '../components/canvas/types';
import { loadStarterLayout } from '../designer/starterLayout';
import { templatesApi } from '../api';

export const DocumentTemplates: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const popup = usePopup();
  const { openTab } = useTabs();
  const { t: tr } = useI18n();
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [data, setData] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TemplateRow | null>(null);
  const [newDraft, setNewDraft] = useState<{ docType: DocType; name: string } | null>(null);
  const [creatingFor, setCreatingFor] = useState<DocType | null>(null);
  const [generating, setGenerating] = useState<{ id: string; name: string } | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERUSER';

  const fetchList = async () => {
    setLoading(true);
    try {
      const d = await templatesApi.list();
      setData((Array.isArray(d) ? d : []) as unknown as TemplateRow[]);
    } catch {
      toast.error(tr('templates.page.loadListError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const openDesigner = (id: string) => openTab(`/document-templates/${id}/designer`);

  /** Cada plantilla se abre con lo que se hizo: el lienzo o el formulario de la estándar. */
  const openEditor = async (row: TemplateRow) => {
    if (row.editor === 'designer') {
      openDesigner(row.id);
      return;
    }
    try {
      const full = (await templatesApi.get(row.id)) as unknown as TemplateRow;
      setSelected(full);
      setNewDraft(null);
      setView('edit');
    } catch {
      toast.error(tr('templates.page.loadError'));
    }
  };

  const handleCreate = async (choice: {
    docType: DocType;
    name: string;
    mode: 'designer' | 'visual' | 'ai';
  }) => {
    if (choice.mode === 'ai') {
      setCreatingFor(null);
      setAiGenerating(true);
      return;
    }
    if (choice.mode === 'visual') {
      setCreatingFor(null);
      setSelected(null);
      setNewDraft({ docType: choice.docType, name: choice.name });
      setView('edit');
      return;
    }
    try {
      const isFree = choice.docType === 'FREE' || choice.docType === 'LABEL';
      const layout = isFree ? createEmptyLayout() : await loadStarterLayout(choice.docType);
      const created: any = await templatesApi.create({
        docType: choice.docType,
        name: choice.name,
        html: compileCanvas(layout, { docType: choice.docType }),
        // La etiqueta nueva la monta el diseñador con su formulario.
        ...(choice.docType === 'LABEL' ? {} : { canvasLayout: layout, legacyHtml: false }),
        isDefault: false,
      });
      setCreatingFor(null);
      await fetchList();
      openDesigner(created.id);
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || tr('templates.page.loadError'));
    }
  };

  const handleSave = async (t: Partial<TemplateRow>) => {
    if (t.id) await templatesApi.update(t.id, t);
    else await templatesApi.create(t);
    await fetchList();
  };

  const handleSetDefault = async (row: TemplateRow) => {
    try {
      await templatesApi.setDefault(row.id);
      toast.success(tr('templates.page.defaultSet'));
      fetchList();
    } catch {
      toast.error(tr('templates.page.defaultSetError'));
    }
  };

  const handleDuplicate = async (row: TemplateRow) => {
    try {
      const detail: any = await templatesApi.get(row.id);
      await templatesApi.create({
        docType: detail.docType,
        name: tr('templates.page.copySuffix', { name: detail.name }),
        html: detail.html,
        isDefault: false,
        // Sin el diseño, la copia se abriría en blanco en el lienzo.
        ...(detail.canvasLayout
          ? { canvasLayout: detail.canvasLayout, legacyHtml: detail.legacyHtml }
          : {}),
      });
      toast.success(tr('templates.page.duplicated'));
      fetchList();
    } catch {
      toast.error(tr('templates.page.duplicateError'));
    }
  };

  const handleDelete = async (row: TemplateRow) => {
    const ok = await popup.confirm({
      title: tr('templates.list.delete'),
      message: tr('templates.page.deleteConfirm', { name: row.name }),
      tone: 'danger',
      confirmLabel: tr('templates.list.delete'),
    });
    if (!ok) return;
    try {
      await templatesApi.remove(row.id);
      toast.success(tr('templates.page.deleted'));
      fetchList();
    } catch {
      toast.error(tr('templates.page.deleteError'));
    }
  };

  if (view === 'edit') {
    return (
      <TemplateEditor
        template={selected}
        initialDocType={newDraft?.docType}
        initialName={newDraft?.name}
        onBack={() => {
          setSelected(null);
          setNewDraft(null);
          setView('list');
        }}
        onSave={handleSave}
        token=""
        tenantId={user?.tenantId || ''}
      />
    );
  }

  return (
    <>
      <TemplatesList
        data={data}
        loading={loading}
        onCreate={setCreatingFor}
        onEdit={openEditor}
        onDesign={(row) => openDesigner(row.id)}
        onSetDefault={handleSetDefault}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        onGenerate={(t) => setGenerating({ id: t.id, name: t.name })}
        onAiGenerate={isAdmin ? () => setAiGenerating(true) : undefined}
        onReload={fetchList}
      />
      {creatingFor && (
        <NewTemplateModal
          initialDocType={creatingFor}
          canUseAi={isAdmin}
          onClose={() => setCreatingFor(null)}
          onConfirm={handleCreate}
        />
      )}
      {generating && (
        <DocumentGeneratorModal
          templateId={generating.id}
          templateName={generating.name}
          onClose={() => setGenerating(null)}
        />
      )}
      {aiGenerating && (
        <AiTemplateGeneratorModal onClose={() => setAiGenerating(false)} onSaved={fetchList} />
      )}
    </>
  );
};
