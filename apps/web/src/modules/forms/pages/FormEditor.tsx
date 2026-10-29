import React, { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Badge, Button, EmptyState, PageHeader, SkeletonPage, Switch, Tabs } from '@openfactu/ui';
import { ArrowLeft, ClipboardList, Eye, Share2 } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useFormEditor } from '../hooks/useFormEditor';
import { useFormsPermissions } from '../hooks/useFormsPermissions';
import { FormCanvas } from '../components/editor/FormCanvas';
import { SaveIndicator } from '../components/editor/SaveIndicator';
import { SettingsTab } from '../components/settings/SettingsTab';
import { ResponsesTab } from '../components/results/ResponsesTab';
import { ShareModal } from '../components/share/ShareModal';

type TabKey = 'questions' | 'responses' | 'settings';
const TABS: TabKey[] = ['questions', 'responses', 'settings'];

/** Editor de un formulario, con guardado automático. */
export const FormEditor: React.FC = () => {
  const { formId = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { flags } = useTheme();
  const { canWrite, canDelete } = useFormsPermissions();
  const editor = useFormEditor(formId);
  const [sharing, setSharing] = useState(false);
  const tab = (
    TABS.includes(params.get('tab') as TabKey) ? params.get('tab') : 'questions'
  ) as TabKey;
  const { form } = editor;

  if (editor.notFound)
    return (
      <div className="p-4">
        <EmptyState
          icon={<ClipboardList size={18} />}
          title="Formulario no encontrado"
          action={
            <Button type="button" variant="secondary" onClick={() => navigate('/forms')}>
              Volver a formularios
            </Button>
          }
        />
      </div>
    );
  if (!form) return <SkeletonPage />;

  return (
    <div className="p-4 w-full space-y-4">
      <PageHeader
        title={form.name}
        size="sm"
        icon={<ClipboardList size={18} />}
        breadcrumbs={
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => navigate('/forms')}
            // En móvil ya está la flecha de volver de la barra superior.
            className="max-md:hidden"
          >
            <ArrowLeft size={14} /> Formularios
          </Button>
        }
        subtitle={
          <SaveIndicator status={editor.status} error={editor.error} onRetry={editor.retry} />
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Switch
              label="Acepta respuestas"
              checked={form.isActive}
              onChange={(isActive) => editor.change({ isActive })}
              disabled={!canWrite}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => navigate(`/forms/${form.id}/preview`)}
            >
              <Eye size={14} /> Vista previa
            </Button>
            <Button type="button" size="sm" onClick={() => setSharing(true)}>
              <Share2 size={14} /> Compartir
            </Button>
          </div>
        }
        tabs={
          <Tabs
            value={tab}
            onChange={(k) => setParams(k === 'questions' ? {} : { tab: k }, { replace: true })}
            items={[
              { key: 'questions', label: 'Preguntas' },
              {
                key: 'responses',
                label: 'Respuestas',
                badge: form.responses ? (
                  <Badge variant="accent">{form.responses}</Badge>
                ) : undefined,
              },
              { key: 'settings', label: 'Ajustes' },
            ]}
          />
        }
      />

      <div className="mx-auto w-full max-w-3xl">
        {tab === 'questions' && (
          <FormCanvas editor={editor} crm={!!flags.crmEnabled} disabled={!canWrite} />
        )}
        {tab === 'responses' && (
          <ResponsesTab form={form} canDelete={canDelete} canWrite={canWrite} />
        )}
        {tab === 'settings' && (
          <SettingsTab editor={editor} crm={!!flags.crmEnabled} disabled={!canWrite} />
        )}
      </div>

      <ShareModal
        form={form}
        isOpen={sharing}
        onClose={() => setSharing(false)}
        canWrite={canWrite}
        crm={!!flags.crmEnabled}
      />
    </div>
  );
};

export default FormEditor;
