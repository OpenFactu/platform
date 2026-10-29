import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Input,
  Modal,
  PageHeader,
  SegmentedControl,
  Table,
  usePopup,
  useToast,
  type TableColumn,
} from '@openfactu/ui';
import { ClipboardList, Plus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { formsApi } from '../api';
import type { CrmForm, FormKind } from '../domain/forms';
import { useCrmPermissions } from '../hooks/useCrmPermissions';

export const Forms: React.FC = () => {
  const fmt = useFormat();
  const toast = useToast();
  const popup = usePopup();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canWrite, canDelete } = useCrmPermissions('/crm/forms');
  const [forms, setForms] = useState<CrmForm[] | null>(null);
  const [creating, setCreating] = useState<{ name: string; kind: FormKind } | null>(null);

  const reload = useCallback(
    () =>
      formsApi
        .list()
        .then(setForms)
        .catch(() => setForms([])),
    [],
  );
  useEffect(() => {
    if (user?.tenantId) reload();
  }, [user?.tenantId, reload]);

  const create = async () => {
    if (!creating?.name.trim()) return;
    try {
      const f = await formsApi.create(creating.name.trim(), creating.kind);
      setCreating(null);
      navigate(`/crm/forms/${f.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear');
    }
  };

  const remove = async (f: CrmForm) => {
    const ok = await popup.confirm({
      title: 'Borrar formulario',
      message: `¿Borrar «${f.name}» y sus ${f.responses ?? 0} respuesta(s)?`,
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

  const columns: TableColumn<CrmForm>[] = [
    { header: 'Nombre', accessor: 'name', sortable: true, card: 'title' },
    {
      header: 'Tipo',
      id: 'kind',
      card: 'status',
      cell: (f) => (
        <Badge variant={f.kind === 'survey' ? 'info' : 'accent'}>
          {f.kind === 'survey' ? 'Encuesta' : 'Captación'}
        </Badge>
      ),
    },
    {
      header: 'Estado',
      id: 'active',
      cell: (f) =>
        f.isActive ? (
          <Badge variant="success">Activo</Badge>
        ) : (
          <Badge variant="neutral">Pausado</Badge>
        ),
    },
    { header: 'Respuestas', id: 'n', accessor: (f) => f.responses ?? 0, align: 'right' },
    {
      header: 'Última respuesta',
      id: 'last',
      accessor: (f) => (f.lastResponseAt ? fmt.date(f.lastResponseAt) : '—'),
      card: 'meta',
    },
  ];

  return (
    <div className="p-4 w-full space-y-4">
      <PageHeader
        title="Formularios y encuestas"
        subtitle="Captación con enlace público y encuestas personales a tus contactos"
        icon={<ClipboardList size={18} />}
        size="sm"
        actions={
          canWrite && (
            <Button type="button" size="sm" onClick={() => setCreating({ name: '', kind: 'form' })}>
              <Plus size={14} /> Nuevo
            </Button>
          )
        }
      />
      <Table
        columns={columns}
        data={forms ?? []}
        isLoading={forms === null}
        onRowClick={(f) => navigate(`/crm/forms/${f.id}`)}
        emptyMessage="Todavía no hay formularios."
        ariaLabel="Formularios"
        rowActions={(f) =>
          canDelete ? [{ label: 'Borrar', onClick: () => remove(f), destructive: true }] : []
        }
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
        primaryAction={{ label: 'Crear', type: 'submit', disabled: !creating?.name.trim() }}
      >
        {creating && (
          <div className="space-y-4">
            <Input
              label="Nombre"
              value={creating.name}
              onChange={(e) => setCreating({ ...creating, name: e.target.value })}
              placeholder="Solicitud de demo, Satisfacción 2026…"
              autoFocus
            />
            <SegmentedControl
              aria-label="Tipo"
              value={creating.kind}
              onChange={(v) => setCreating({ ...creating, kind: v as FormKind })}
              options={[
                { value: 'form', label: 'Captación de clientes' },
                { value: 'survey', label: 'Encuesta' },
              ]}
            />
            <p className="text-xs text-fg-muted">
              {creating.kind === 'form'
                ? 'Cada respuesta crea un prospecto en el CRM. Empieza con nombre, empresa, correo, teléfono y mensaje.'
                : 'Se manda con un enlace personal a tus contactos; las respuestas quedan en su ficha. Empieza con una pregunta de recomendación (NPS).'}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Forms;
