import React, { useEffect, useState } from 'react';
import { useToast } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { TemplateEditor } from '../components/TemplateEditor';
import { TemplatesList } from '../components/TemplatesList';
import { DocumentGeneratorModal } from '../components/DocumentGeneratorModal';
import { AiTemplateGeneratorModal } from '../components/AiTemplateGeneratorModal';
import type { TemplateRow } from '../components/constants';
import { templatesApi } from '../api';
import { useI18n } from '@/i18n/I18nContext';

export const DocumentTemplates: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const { t: tr } = useI18n();
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [data, setData] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TemplateRow | null>(null);
  const [generating, setGenerating] = useState<{ id: string; name: string } | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERUSER';

  const headers = {
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
    'Content-Type': 'application/json',
  };

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

  const openEditor = async (row?: TemplateRow) => {
    if (!row) {
      setSelected(null);
      setView('edit');
      return;
    }
    try {
      const full = (await templatesApi.get(row.id)) as unknown as TemplateRow;
      setSelected(full);
      setView('edit');
    } catch {
      toast.error(tr('templates.page.loadError'));
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
      const detail = await templatesApi.get(row.id);
      await templatesApi.create({
        docType: detail.docType,
        name: tr('templates.page.copySuffix', { name: detail.name }),
        html: detail.html,
        isDefault: false,
      });
      toast.success(tr('templates.page.duplicated'));
      fetchList();
    } catch {
      toast.error(tr('templates.page.duplicateError'));
    }
  };

  const handleDelete = async (row: TemplateRow) => {
    if (!confirm(tr('templates.page.deleteConfirm', { name: row.name }))) return;
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
        onBack={() => {
          setSelected(null);
          setView('list');
        }}
        onSave={handleSave}
        token={token || ''}
        tenantId={user?.tenantId || ''}
      />
    );
  }

  return (
    <>
      <TemplatesList
        data={data}
        loading={loading}
        onCreate={() => openEditor()}
        onEdit={(t) => openEditor(t)}
        onSetDefault={handleSetDefault}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        onGenerate={(t) => setGenerating({ id: t.id, name: t.name })}
        onAiGenerate={isAdmin ? () => setAiGenerating(true) : undefined}
        onReload={fetchList}
      />
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
