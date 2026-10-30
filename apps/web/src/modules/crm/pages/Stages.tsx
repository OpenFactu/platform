import { useI18n } from '@/i18n/I18nContext';
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
  const { t } = useI18n();
  const toast = useToast();
  const popup = usePopup();
  const { canWrite, canDelete } = useCrmPermissions('/crm/opportunities');
  const { stages, loading, error, refresh } = useStages();
  const [draft, setDraft] = useState<Partial<OpportunityStage> | null>(null);

  const fail = (err: unknown) =>
    toast.error(err instanceof Error ? err.message : t('crm.errors.saveFailed'));

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
      title: t('crm.stages.deleteTitle'),
      message: t('crm.stages.deleteMessage', { name: s.name }),
      tone: 'danger',
      confirmLabel: t('crm.common.delete'),
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
    { header: t('crm.common.stage'), accessor: 'name', card: 'title' },
    {
      header: t('crm.activityForm.type'),
      id: 'kind',
      cell: (s) => (
        <Badge variant={STAGE_KIND_VARIANT[s.kind]}>{t(STAGE_KIND_LABEL[s.kind])}</Badge>
      ),
      card: 'status',
    },
    {
      header: t('crm.stages.probability'),
      id: 'prob',
      cell: (s) => `${s.probability}%`,
      align: 'right',
    },
    {
      header: t('crm.settings.followUp'),
      id: 'follow',
      cell: (s) =>
        s.followUpType
          ? t('crm.stages.followUpAfter', {
              type: t(ACTIVITY_TYPE_LABEL[s.followUpType]),
              days: s.followUpDays ?? 0,
            })
          : '—',
    },
    {
      header: t('crm.nav.opportunities'),
      id: 'count',
      cell: (s) => s.opportunityCount ?? 0,
      align: 'right',
    },
    ...(canWrite
      ? [
          {
            header: t('crm.stages.order'),
            id: 'order',
            align: 'right',
            cell: (_s: OpportunityStage, i: number) => (
              <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t('crm.stages.moveUp')}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp size={12} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t('crm.stages.moveDown')}
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
        title={t('crm.nav.stagesTitle')}
        subtitle={t('crm.stages.subtitle')}
        icon={<Workflow size={18} />}
        size="sm"
        actions={
          canWrite && (
            <Button type="button" size="sm" onClick={() => setDraft({ kind: 'open' })}>
              <Plus size={14} /> {t('crm.stages.new')}
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
        ariaLabel={t('crm.nav.stages')}
        rowActions={(s) =>
          canDelete
            ? [{ label: t('crm.common.delete'), onClick: () => remove(s), destructive: true }]
            : []
        }
      />
      <Modal
        isOpen={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? t('crm.stages.edit') : t('crm.stages.new')}
        size="md"
        onSubmit={save}
        primaryAction={{ label: t('crm.common.save'), type: 'submit' }}
      >
        {draft && (
          <div className="space-y-4">
            <Input
              label={t('crm.common.name')}
              value={draft.name ?? ''}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label={t('crm.activityForm.type')}
                options={KIND_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                value={draft.kind ?? 'open'}
                onChange={(v) => setDraft({ ...draft, kind: v as StageKind })}
              />
              <PercentInput
                label={t('crm.stages.probability')}
                precision={0}
                value={draft.probability ?? 0}
                onChange={(v) => setDraft({ ...draft, probability: Math.round(v ?? 0) })}
              />
            </div>
            <div className="space-y-3 pt-3 border-t border-border-subtle">
              <Select
                label={t('crm.stages.followUpOnEnter')}
                options={[
                  { value: '', label: t('crm.stages.noFollowUp') },
                  ...ACTIVITY_TYPE_OPTIONS.map((o) => ({ ...o, label: t(o.label) })),
                ]}
                value={draft.followUpType ?? ''}
                onChange={(v) =>
                  setDraft({ ...draft, followUpType: (v || null) as ActivityType | null })
                }
              />
              {draft.followUpType && (
                <div className="grid grid-cols-[8rem_1fr] gap-3">
                  <NumberInput
                    label={t('crm.stages.afterDays')}
                    value={draft.followUpDays ?? 0}
                    onChange={(v) => setDraft({ ...draft, followUpDays: Math.round(v ?? 0) })}
                    min={0}
                    max={365}
                  />
                  <Input
                    label={t('crm.activityForm.subject')}
                    value={draft.followUpSubject ?? ''}
                    placeholder={t('crm.stages.subjectPlaceholder')}
                    onChange={(e) => setDraft({ ...draft, followUpSubject: e.target.value })}
                  />
                </div>
              )}
              <p className="text-xs text-fg-muted">{t('crm.stages.followUpHint')}</p>
            </div>
            <p className="text-xs text-fg-muted">{t('crm.stages.closingHint')}</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Stages;
