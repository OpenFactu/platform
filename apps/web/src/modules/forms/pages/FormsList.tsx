import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Input,
  Modal,
  PageHeader,
  RadioGroup,
  Table,
  usePopup,
  useToast,
  type TableColumn,
} from '@openfactu/ui';
import { ClipboardList, Plus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { formsApi } from '../api/formsApi';
import type { FormListItem } from '../domain/types';
import { useFormsPermissions } from '../hooks/useFormsPermissions';

type Template = { id: string; label: string; kind: 'form' | 'survey' };

const TEMPLATE_HINT: Record<string, string> = {
  blank: 'Empieza de cero.',
  contact: 'Nombre, empresa, correo, teléfono y mensaje.',
  satisfaction: 'Recomendación de 0 a 10 (NPS), valoración y comentarios.',
  event: 'Datos del asistente, sesiones y necesidades.',
  quiz: 'Preguntas con puntos y respuesta correcta.',
};

export const FormsList: React.FC = () => {
  const fmt = useFormat();
  const toast = useToast();
  const popup = usePopup();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canWrite, canDelete } = useFormsPermissions();
  const [forms, setForms] = useState<FormListItem[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [creating, setCreating] = useState<{ name: string; template: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(
    () =>
      formsApi
        .list()
        .then(setForms)
        .catch(() => setForms([])),
    [],
  );
  useEffect(() => {
    if (!user?.tenantId) return;
    reload();
    formsApi
      .templates()
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, [user?.tenantId, reload]);

  const create = async () => {
    if (!creating?.name.trim()) return;
    setBusy(true);
    try {
      const f = await formsApi.create(creating.name.trim(), creating.template);
      setCreating(null);
      navigate(`/forms/${f.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear');
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async (f: FormListItem) => {
    try {
      const copy = await formsApi.duplicate(f.id);
      navigate(`/forms/${copy.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo duplicar');
    }
  };

  const remove = async (f: FormListItem) => {
    const ok = await popup.confirm({
      title: 'Borrar formulario',
      message: `¿Borrar «${f.name}» y sus ${f.responses} respuesta(s)? El enlace dejará de funcionar.`,
      tone: 'danger',
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    try {
      await formsApi.remove(f.id);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo borrar');
    }
  };

  const columns: TableColumn<FormListItem>[] = [
    { header: 'Nombre', accessor: 'name', sortable: true, card: 'title' },
    {
      header: 'Estado',
      id: 'active',
      card: 'status',
      cell: (f) =>
        f.isActive ? (
          <Badge variant="success">Acepta respuestas</Badge>
        ) : (
          <Badge variant="neutral">Cerrado</Badge>
        ),
    },
    { header: 'Respuestas', id: 'n', accessor: (f) => f.responses, align: 'right' },
    {
      header: 'Última respuesta',
      id: 'last',
      accessor: (f) => (f.lastResponseAt ? fmt.date(f.lastResponseAt) : '—'),
      card: 'meta',
    },
    { header: 'Modificado', id: 'upd', accessor: (f) => fmt.date(f.updatedAt), card: 'meta' },
  ];

  return (
    <div className="p-4 w-full space-y-4">
      <PageHeader
        title="Formularios"
        subtitle="Formularios, encuestas y cuestionarios que se comparten con un enlace"
        icon={<ClipboardList size={18} />}
        size="sm"
        actions={
          canWrite && (
            <Button
              type="button"
              size="sm"
              onClick={() => setCreating({ name: '', template: 'blank' })}
            >
              <Plus size={14} /> Nuevo
            </Button>
          )
        }
      />
      <Table
        columns={columns}
        data={forms ?? []}
        isLoading={forms === null}
        onRowClick={(f) => navigate(`/forms/${f.id}`)}
        emptyMessage="Todavía no hay formularios. Crea el primero desde una plantilla."
        ariaLabel="Formularios"
        rowActions={(f) => [
          ...(canWrite ? [{ label: 'Duplicar', onClick: () => duplicate(f) }] : []),
          ...(canDelete ? [{ label: 'Borrar', onClick: () => remove(f), destructive: true }] : []),
        ]}
      />
      <Modal
        isOpen={!!creating}
        onClose={() => setCreating(null)}
        title="Nuevo formulario"
        size="md"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
        primaryAction={{
          label: 'Crear',
          type: 'submit',
          disabled: !creating?.name.trim(),
          isLoading: busy,
        }}
      >
        {creating && (
          <div className="space-y-4">
            <Input
              label="Nombre"
              value={creating.name}
              onChange={(e) => setCreating({ ...creating, name: e.target.value })}
              placeholder="Inscripción jornada, Satisfacción 2026…"
              autoFocus
            />
            <RadioGroup
              label="Empezar con"
              options={templates.map((t) => ({
                value: t.id,
                label: t.label,
                description: TEMPLATE_HINT[t.id],
              }))}
              value={creating.template}
              onChange={(template) => setCreating({ ...creating, template })}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default FormsList;
