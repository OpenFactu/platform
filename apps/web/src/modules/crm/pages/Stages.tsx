import React, { useState } from 'react';
import {
  Badge,
  Button,
  Input,
  Modal,
  PageHeader,
  NumberInput,
  PercentInput,
  Select,
  Table,
  usePopup,
  useToast,
  type TableColumn,
} from '@openfactu/ui';
import { ArrowDown, ArrowUp, Plus, Workflow } from 'lucide-react';
import { stagesApi } from '../api';
import {
  ACTIVITY_TYPE_LABEL,
  ACTIVITY_TYPE_OPTIONS,
  type ActivityType,
  STAGE_KIND_LABEL,
  STAGE_KIND_VARIANT,
  type OpportunityStage,
  type StageKind,
} from '../domain/crm';
import { useStages } from '../hooks/useCrmData';
import { useCrmPermissions } from '../hooks/useCrmPermissions';

const KIND_OPTIONS = (Object.keys(STAGE_KIND_LABEL) as StageKind[]).map((value) => ({
  value,
  label: STAGE_KIND_LABEL[value],
}));

/** Mueve el elemento `index` una posición arriba (-1) o abajo (+1). */
function swap<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const next = [...list];
  const j = index + dir;
  if (j < 0 || j >= next.length) return list;
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

export const Stages: React.FC = () => {
  const toast = useToast();
  const popup = usePopup();
  const { canWrite, canDelete } = useCrmPermissions('/crm/opportunities');
  const { stages, loading, error, refresh } = useStages();
  const [draft, setDraft] = useState<Partial<OpportunityStage> | null>(null);

  const fail = (err: unknown) =>
    toast.error(err instanceof Error ? err.message : 'No se pudo guardar');

  const move = async (index: number, dir: -1 | 1) => {
    try {
      await stagesApi.reorder(swap(stages, index, dir).map((s) => s.id));
      refresh();
    } catch (err) {
      fail(err);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft?.name?.trim()) return;
    const payload = {
      name: draft.name,
      probability: draft.probability ?? 0,
      kind: draft.kind ?? 'open',
      followUpType: draft.followUpType || null,
      followUpDays: draft.followUpType ? (draft.followUpDays ?? 0) : null,
      followUpSubject: draft.followUpType ? draft.followUpSubject || null : null,
    };
    try {
      if (draft.id) await stagesApi.update(draft.id, payload);
      else await stagesApi.create(payload);
      setDraft(null);
      refresh();
    } catch (err) {
      fail(err);
    }
  };

  const remove = async (s: OpportunityStage) => {
    const ok = await popup.confirm({
      title: 'Borrar etapa',
      message: `¿Borrar la etapa «${s.name}»?`,
      tone: 'danger',
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    try {
      await stagesApi.remove(s.id);
      refresh();
    } catch (err) {
      fail(err);
    }
  };

  const columns: TableColumn<OpportunityStage>[] = [
    { header: 'Etapa', accessor: 'name', card: 'title' },
    {
      header: 'Tipo',
      id: 'kind',
      cell: (s) => <Badge variant={STAGE_KIND_VARIANT[s.kind]}>{STAGE_KIND_LABEL[s.kind]}</Badge>,
      card: 'status',
    },
    { header: 'Probabilidad', id: 'prob', cell: (s) => `${s.probability}%`, align: 'right' },
    {
      header: 'Seguimiento',
      id: 'follow',
      cell: (s) =>
        s.followUpType
          ? `${ACTIVITY_TYPE_LABEL[s.followUpType]} a los ${s.followUpDays ?? 0} días`
          : '—',
    },
    {
      header: 'Oportunidades',
      id: 'count',
      cell: (s) => s.opportunityCount ?? 0,
      align: 'right',
    },
    ...(canWrite
      ? [
          {
            header: 'Orden',
            id: 'order',
            align: 'right',
            cell: (_s: OpportunityStage, i: number) => (
              <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Subir"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp size={12} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Bajar"
                  disabled={i === stages.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={12} />
                </Button>
              </span>
            ),
          } as TableColumn<OpportunityStage>,
        ]
      : []),
  ];

  return (
    <div className="p-4 w-full space-y-4">
      <PageHeader
        title="Etapas del embudo"
        subtitle="Las columnas del tablero de oportunidades, en orden"
        icon={<Workflow size={18} />}
        size="sm"
        actions={
          canWrite && (
            <Button type="button" size="sm" onClick={() => setDraft({ kind: 'open' })}>
              <Plus size={14} /> Nueva etapa
            </Button>
          )
        }
      />
      <Table
        columns={columns}
        data={stages}
        isLoading={loading}
        errorMessage={error ?? undefined}
        onRetry={refresh}
        onRowClick={canWrite ? setDraft : undefined}
        ariaLabel="Etapas"
        rowActions={(s) =>
          canDelete ? [{ label: 'Borrar', onClick: () => remove(s), destructive: true }] : []
        }
      />
      <Modal
        isOpen={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Editar etapa' : 'Nueva etapa'}
        size="md"
        onSubmit={save}
        primaryAction={{ label: 'Guardar', type: 'submit' }}
      >
        {draft && (
          <div className="space-y-4">
            <Input
              label="Nombre"
              value={draft.name ?? ''}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Tipo"
                options={KIND_OPTIONS}
                value={draft.kind ?? 'open'}
                onChange={(v) => setDraft({ ...draft, kind: v as StageKind })}
              />
              <PercentInput
                label="Probabilidad"
                precision={0}
                value={draft.probability ?? 0}
                onChange={(v) => setDraft({ ...draft, probability: Math.round(v ?? 0) })}
              />
            </div>
            <div className="space-y-3 pt-3 border-t border-border-subtle">
              <Select
                label="Seguimiento al entrar en la etapa"
                options={[{ value: '', label: 'Ninguno' }, ...ACTIVITY_TYPE_OPTIONS]}
                value={draft.followUpType ?? ''}
                onChange={(v) =>
                  setDraft({ ...draft, followUpType: (v || null) as ActivityType | null })
                }
              />
              {draft.followUpType && (
                <div className="grid grid-cols-[8rem_1fr] gap-3">
                  <NumberInput
                    label="A los (días)"
                    value={draft.followUpDays ?? 0}
                    onChange={(v) => setDraft({ ...draft, followUpDays: Math.round(v ?? 0) })}
                    min={0}
                    max={365}
                  />
                  <Input
                    label="Asunto"
                    value={draft.followUpSubject ?? ''}
                    placeholder="Seguimiento: <título de la oportunidad>"
                    onChange={(e) => setDraft({ ...draft, followUpSubject: e.target.value })}
                  />
                </div>
              )}
              <p className="text-xs text-fg-muted">
                Se crea para el responsable de la oportunidad cada vez que entra en esta etapa.
              </p>
            </div>
            <p className="text-xs text-fg-muted">
              Las etapas «Ganada» y «Perdida» cierran la oportunidad; volver a una abierta la
              reabre.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Stages;
