import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, Loader, PageHeader, Tabs, useToast } from '@openfactu/ui';
import { ArrowLeft, Copy, ExternalLink } from 'lucide-react';
import { FloatingSaveButton } from '@/components/FloatingSaveButton';
import type { Answers } from '../domain/forms';
import { useFormBuilder } from '../hooks/useFormBuilder';
import { useCrmPermissions } from '../hooks/useCrmPermissions';
import { FieldList } from '../components/forms/FieldList';
import { FieldProperties } from '../components/forms/FieldProperties';
import { FormRenderer } from '../components/forms/FormRenderer';
import { FormSettingsPanel } from '../components/forms/FormSettingsPanel';
import { FormResponses } from '../components/forms/FormResponses';
import { FormResults } from '../components/forms/FormResults';
import { FormInvites } from '../components/forms/FormInvites';

type Tab = 'design' | 'settings' | 'responses' | 'results' | 'invites';

/** Ficha de un formulario: diseño, ajustes, respuestas, resultados e invitaciones. */
export const FormDetail: React.FC = () => {
  const { formId = '' } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { canWrite } = useCrmPermissions('/crm/forms');
  const builder = useFormBuilder(formId);
  const [tab, setTab] = useState<Tab>('design');
  const [preview, setPreview] = useState<Answers>({});
  const form = builder.form;

  if (builder.notFound)
    return (
      <div className="p-12 text-center text-fg-muted">
        Formulario no encontrado.
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate('/crm/forms')}>
            <ArrowLeft size={14} /> Volver
          </Button>
        </div>
      </div>
    );
  if (!form)
    return (
      <div className="p-12 flex justify-center">
        <Loader />
      </div>
    );

  const save = async () => {
    try {
      await builder.save();
      toast.success('Formulario guardado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  };

  const copyLink = async () => {
    if (!form.publicUrl) return;
    try {
      await navigator.clipboard.writeText(form.publicUrl);
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const editing = tab === 'design' || tab === 'settings';
  const tabs = [
    { key: 'design', label: 'Diseño' },
    { key: 'settings', label: 'Ajustes' },
    { key: 'responses', label: 'Respuestas' },
    ...(form.kind === 'survey'
      ? [
          { key: 'results', label: 'Resultados' },
          { key: 'invites', label: 'Invitaciones' },
        ]
      : []),
  ];

  return (
    <form
      className="p-4 pb-24 max-md:pb-48 space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <PageHeader
        size="md"
        breadcrumbs={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate('/crm/forms')}
            className="w-fit gap-1"
          >
            <ArrowLeft size={12} /> Formularios
          </Button>
        }
        title={
          <>
            {form.name}
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant={form.kind === 'survey' ? 'info' : 'accent'}>
                {form.kind === 'survey' ? 'Encuesta' : 'Captación'}
              </Badge>
              {!form.isActive && <Badge variant="neutral">Pausado</Badge>}
              {builder.dirty && <Badge variant="warning">Sin guardar</Badge>}
            </span>
          </>
        }
        subtitle={<span className="text-xs text-fg-muted break-all">{form.publicUrl}</span>}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={copyLink}>
              <Copy size={14} /> Copiar enlace
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => form.publicUrl && window.open(form.publicUrl, '_blank', 'noopener')}
              disabled={builder.dirty}
              title={builder.dirty ? 'Guarda antes los cambios' : undefined}
            >
              <ExternalLink size={14} /> Abrir
            </Button>
          </div>
        }
      />

      <Tabs items={tabs} value={tab} onChange={(k) => setTab(k as Tab)} scrollable />

      {tab === 'design' && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 items-start">
          <div className="space-y-6">
            <Card title="Preguntas">
              <FieldList builder={builder} disabled={!canWrite} />
            </Card>
            <Card title="Pregunta seleccionada">
              <FieldProperties
                field={builder.selected}
                kind={form.kind}
                onChange={(patch) =>
                  builder.selected && builder.updateField(builder.selected.id, patch)
                }
                disabled={!canWrite}
              />
            </Card>
          </div>
          <Card title="Vista previa" subtitle="Así lo verá quien responda.">
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-fg-default">{form.title || form.name}</h2>
                {form.intro && (
                  <p className="text-sm text-fg-muted mt-1 whitespace-pre-wrap">{form.intro}</p>
                )}
              </div>
              <FormRenderer
                fields={form.fields}
                answers={preview}
                onChange={(id, v) => setPreview((p) => ({ ...p, [id]: v as Answers[string] }))}
              />
              <Button type="button" disabled>
                {form.settings?.submitLabel || 'Enviar'}
              </Button>
            </div>
          </Card>
        </div>
      )}
      {tab === 'settings' && (
        <Card>
          <FormSettingsPanel form={form} set={builder.set} disabled={!canWrite} />
        </Card>
      )}
      {tab === 'responses' && <FormResponses form={form} />}
      {tab === 'results' && <FormResults formId={form.id} />}
      {tab === 'invites' && (
        // Los modales de las invitaciones no deben enviar el <form> de la ficha.
        <div onSubmit={(e) => e.stopPropagation()}>
          <FormInvites form={form} />
        </div>
      )}

      {canWrite && editing && (
        <FloatingSaveButton label="Guardar formulario" saving={builder.saving} />
      )}
    </form>
  );
};

export default FormDetail;
