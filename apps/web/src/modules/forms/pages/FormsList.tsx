import { useI18n } from '@/i18n/I18nContext';
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

/** Claves de i18n de la ayuda de cada plantilla (por id de plantilla del servidor). */
const TEMPLATE_HINT: Record<string, string> = {
  blank: 'forms.list.templates.blank',
  contact: 'forms.list.templates.contact',
  satisfaction: 'forms.list.templates.satisfaction',
  event: 'forms.list.templates.event',
  quiz: 'forms.list.templates.quiz',
};

export const FormsList: React.FC = () => {
  const { t } = useI18n();
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
      toast.error(err instanceof Error ? err.message : t('forms.list.createFailed'));
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async (f: FormListItem) => {
    try {
      const copy = await formsApi.duplicate(f.id);
      navigate(`/forms/${copy.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms.list.duplicateFailed'));
    }
  };

  const remove = async (f: FormListItem) => {
    const ok = await popup.confirm({
      title: t('forms.list.deleteTitle'),
      message: t('forms.list.deleteMessage', { name: f.name, count: f.responses }),
      tone: 'danger',
      confirmLabel: t('forms.common.delete'),
    });
    if (!ok) return;
    try {
      await formsApi.remove(f.id);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms.errors.deleteFailed'));
    }
  };

  const columns: TableColumn<FormListItem>[] = [
    { header: t('forms.list.name'), accessor: 'name', sortable: true, card: 'title' },
    {
      header: t('forms.share.status'),
      id: 'active',
      card: 'status',
      cell: (f) =>
        f.isActive ? (
          <Badge variant="success">{t('forms.list.accepting')}</Badge>
        ) : (
          <Badge variant="neutral">{t('forms.list.closed')}</Badge>
        ),
    },
    {
      header: t('forms.settings.responses'),
      id: 'n',
      accessor: (f) => f.responses,
      align: 'right',
    },
    {
      header: t('forms.list.lastResponse'),
      id: 'last',
      accessor: (f) => (f.lastResponseAt ? fmt.date(f.lastResponseAt) : '—'),
      card: 'meta',
    },
    {
      header: t('forms.list.modified'),
      id: 'upd',
      accessor: (f) => fmt.date(f.updatedAt),
      card: 'meta',
    },
  ];

  return (
    <div className="p-4 w-full space-y-4">
      <PageHeader
        title={t('forms.nav.list')}
        subtitle={t('forms.list.subtitle')}
        icon={<ClipboardList size={18} />}
        size="sm"
        actions={
          canWrite && (
            <Button
              type="button"
              size="sm"
              onClick={() => setCreating({ name: '', template: 'blank' })}
            >
              <Plus size={14} /> {t('forms.list.new')}
            </Button>
          )
        }
      />
      <Table
        columns={columns}
        data={forms ?? []}
        isLoading={forms === null}
        onRowClick={(f) => navigate(`/forms/${f.id}`)}
        emptyMessage={t('forms.list.empty')}
        ariaLabel={t('forms.nav.list')}
        rowActions={(f) => [
          ...(canWrite
            ? [{ label: t('forms.blocks.duplicate'), onClick: () => duplicate(f) }]
            : []),
          ...(canDelete
            ? [{ label: t('forms.common.delete'), onClick: () => remove(f), destructive: true }]
            : []),
        ]}
      />
      <Modal
        isOpen={!!creating}
        onClose={() => setCreating(null)}
        title={t('forms.list.newTitle')}
        size="md"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
        primaryAction={{
          label: t('forms.list.create'),
          type: 'submit',
          disabled: !creating?.name.trim(),
          isLoading: busy,
        }}
      >
        {creating && (
          <div className="space-y-4">
            <Input
              label={t('forms.list.name')}
              value={creating.name}
              onChange={(e) => setCreating({ ...creating, name: e.target.value })}
              placeholder={t('forms.list.namePlaceholder')}
              autoFocus
            />
            <RadioGroup
              label={t('forms.list.startWith')}
              options={templates.map((tpl) => ({
                value: tpl.id,
                label: tpl.label,
                description: TEMPLATE_HINT[tpl.id] ? t(TEMPLATE_HINT[tpl.id]) : undefined,
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
