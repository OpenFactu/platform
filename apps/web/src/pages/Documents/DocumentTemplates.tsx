import React, { useEffect, useState } from 'react';
import { useToast } from '@openfactu/ui';
import { useAuth } from '../../context/AuthContext';
import { TemplateEditor } from '../../components/document-templates/TemplateEditor';
import { TemplatesList } from '../../components/document-templates/TemplatesList';
import { DocumentGeneratorModal } from '../../components/document-templates/DocumentGeneratorModal';
import { AiTemplateGeneratorModal } from '../../components/document-templates/AiTemplateGeneratorModal';
import type { TemplateRow } from '../../components/document-templates/constants';

export const DocumentTemplates: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
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
      const res = await fetch('/api/document-templates', { headers });
      const d = await res.json();
      setData(Array.isArray(d) ? d : []);
    } catch {
      toast.error('Error al cargar plantillas');
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
      const res = await fetch(`/api/document-templates/${row.id}`, { headers });
      const full = await res.json();
      setSelected(full);
      setView('edit');
    } catch {
      toast.error('No se pudo cargar la plantilla');
    }
  };

  const handleSave = async (t: Partial<TemplateRow>) => {
    const method = t.id ? 'PUT' : 'POST';
    const url = t.id ? `/api/document-templates/${t.id}` : '/api/document-templates';
    const res = await fetch(url, { method, headers, body: JSON.stringify(t) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error al guardar' }));
      throw new Error(err.error || 'Error al guardar');
    }
    await fetchList();
  };

  const handleSetDefault = async (row: TemplateRow) => {
    try {
      const res = await fetch(`/api/document-templates/${row.id}/set-default`, {
        method: 'POST',
        headers,
      });
      if (!res.ok) throw new Error('Error');
      toast.success('Plantilla marcada como default');
      fetchList();
    } catch {
      toast.error('No se pudo establecer como default');
    }
  };

  const handleDuplicate = async (row: TemplateRow) => {
    try {
      const detail = await (await fetch(`/api/document-templates/${row.id}`, { headers })).json();
      await fetch('/api/document-templates', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          docType: detail.docType,
          name: `${detail.name} (copia)`,
          html: detail.html,
          isDefault: false,
        }),
      });
      toast.success('Plantilla duplicada');
      fetchList();
    } catch {
      toast.error('No se pudo duplicar');
    }
  };

  const handleDelete = async (row: TemplateRow) => {
    if (!confirm(`¿Borrar"${row.name}"?`)) return;
    try {
      const res = await fetch(`/api/document-templates/${row.id}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error('Error');
      toast.success('Plantilla borrada');
      fetchList();
    } catch {
      toast.error('No se pudo borrar');
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
