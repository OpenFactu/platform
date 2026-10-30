import { useI18n } from '@/i18n/I18nContext';
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  KpiCard,
  PageHeader,
  SearchInput,
  SegmentedControl,
  Switch,
  Table,
  Tabs,
  usePopup,
  useToast,
  type TableColumn,
} from '@openfactu/ui';
import { Columns3, List, Plus, Target } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useAuth } from '@/context/AuthContext';
import { opportunitiesApi } from '../api';
import { STAGE_KIND_VARIANT, type Opportunity } from '../domain/crm';
import { usePipeline } from '../hooks/usePipeline';
import { useCrmPermissions } from '../hooks/useCrmPermissions';
import { useCrmSettings, useMembers } from '../hooks/useCrmData';
import { LostReasonModal } from '../components/LostReasonModal';
import { OpportunityBoard } from '../components/OpportunityBoard';

type View = 'board' | 'list';
type ListScope = 'open' | 'closed' | 'all';

export const Opportunities: React.FC = () => {
  const fmt = useFormat();
  const { t } = useI18n();
  const toast = useToast();
  const popup = usePopup();
  const { canWrite, canDelete } = useCrmPermissions('/crm/opportunities');
  const [view, setView] = useState<View>('board');
  const [listScope, setListScope] = useState<ListScope>('open');
  // El tablero solo trae las cerradas recientes; la lista, lo que se filtre.
  const pipeline = usePipeline(
    undefined,
    view === 'board' ? 'board' : listScope === 'all' ? undefined : listScope,
  );
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const open = (o: Opportunity) => navigate(`/crm/opportunities/${o.id}`);
  const [onlyMine, setOnlyMine] = useState(false);
  const { user } = useAuth();
  const { byId: members } = useMembers();
  const { settings } = useCrmSettings();

  const term = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      pipeline.opportunities.filter(
        (o) =>
          (!onlyMine || o.ownerUserId === user?.id) &&
          (!term ||
            [o.title, o.partnerName, o.contactName, ...(o.tags ?? [])].some((v) =>
              v?.toLowerCase().includes(term),
            )),
      ),
    [pipeline.opportunities, term, onlyMine, user?.id],
  );
  const columns = useMemo(
    () =>
      pipeline.columns.map((c) => {
        const items = c.items.filter((o) => filtered.includes(o));
        return { ...c, items, total: items.reduce((s, o) => s + (Number(o.amount) || 0), 0) };
      }),
    [pipeline.columns, filtered],
  );

  const remove = async (o: Opportunity) => {
    const ok = await popup.confirm({
      title: t('crm.opportunities.deleteTitle'),
      message: t('crm.opportunities.deleteMessage', { title: o.title }),
      tone: 'danger',
      confirmLabel: t('crm.common.delete'),
    });
    if (!ok) return;
    try {
      await opportunitiesApi.remove(o.id);
      pipeline.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('crm.errors.deleteFailed'));
    }
  };

  const tableColumns: TableColumn<Opportunity>[] = [
    { header: t('crm.common.opportunity'), accessor: 'title', sortable: true, card: 'title' },
    {
      header: t('crm.partnerSelect.label'),
      accessor: 'partnerName',
      sortable: true,
      card: 'subtitle',
    },
    {
      header: t('crm.common.stage'),
      id: 'stage',
      cell: (o) => <Badge variant={STAGE_KIND_VARIANT[o.stageKind ?? 'open']}>{o.stageName}</Badge>,
      sortAccessor: (o) => o.stageName,
      sortable: true,
      card: 'status',
    },
    {
      header: t('crm.common.amount'),
      id: 'amount',
      cell: (o) => fmt.money(o.amount),
      sortAccessor: (o) => Number(o.amount),
      sortable: true,
      align: 'right',
    },
    {
      header: t('crm.common.expectedClose'),
      id: 'close',
      cell: (o) => fmt.date(o.expectedCloseDate),
      sortAccessor: (o) => o.expectedCloseDate ?? '',
      sortable: true,
      card: 'meta',
    },
    { header: t('crm.contactForm.contact'), accessor: (o) => o.contactName ?? '—' },
    {
      header: t('crm.owner.label'),
      id: 'owner',
      accessor: (o) => (o.ownerUserId ? (members.get(o.ownerUserId)?.name ?? '—') : '—'),
    },
    { header: t('crm.fields.source'), id: 'source', accessor: (o) => o.source ?? '—' },
  ];

  return (
    <div className="p-4 w-full space-y-4">
      <PageHeader
        title={t('crm.nav.opportunities')}
        subtitle={t('crm.opportunities.subtitle')}
        icon={<Target size={18} />}
        size="sm"
        actions={
          canWrite && (
            <Button type="button" size="sm" onClick={() => navigate('/crm/opportunities/new')}>
              <Plus size={14} /> {t('crm.opportunity.new')}
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label={t('crm.opportunities.open')} value={String(pipeline.summary.openCount)} />
        <KpiCard
          label={t('crm.opportunities.openAmount')}
          value={fmt.money(pipeline.summary.openAmount)}
        />
        <KpiCard
          label={t('crm.opportunities.weighted')}
          value={fmt.money(pipeline.summary.weighted)}
        />
      </div>

      {/* Buscador a la izquierda; los filtros a la derecha y, si no caben, en la
          línea siguiente. Ningún control se encoge: los segmentados recortan
          (overflow-hidden) y se comerían su última opción. */}
      <div className="flex flex-wrap items-center gap-3">
        {/* El ancho va en un contenedor: el className de SearchInput llega al
            <input>, no a su envoltorio, que se quedaría a todo el ancho. */}
        <div className="w-full sm:w-auto sm:flex-1 sm:min-w-[16rem] sm:max-w-sm">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('crm.opportunities.searchPlaceholder')}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
          {view === 'list' && (
            <SegmentedControl
              size="sm"
              className="shrink-0"
              aria-label={t('crm.opportunities.scopeLabel')}
              value={listScope}
              onChange={(v) => setListScope(v as ListScope)}
              options={[
                { value: 'open', label: t('crm.opportunities.open') },
                { value: 'closed', label: t('crm.opportunities.closed') },
                { value: 'all', label: t('crm.opportunities.all') },
              ]}
            />
          )}
          <div className="shrink-0 whitespace-nowrap">
            <Switch
              label={t('crm.activities.onlyMine')}
              checked={onlyMine}
              onChange={setOnlyMine}
            />
          </div>
          <Tabs
            variant="segmented"
            size="sm"
            className="shrink-0"
            value={view}
            onChange={(k) => setView(k as View)}
            items={[
              { key: 'board', label: t('crm.opportunities.board'), icon: <Columns3 size={14} /> },
              { key: 'list', label: t('crm.opportunities.list'), icon: <List size={14} /> },
            ]}
          />
        </div>
      </div>

      {view === 'board' ? (
        <OpportunityBoard
          columns={columns}
          canWrite={canWrite}
          onOpen={open}
          onMove={pipeline.moveTo}
          members={members}
          staleDays={settings.staleDays}
          closedDays={settings.boardClosedDays}
        />
      ) : (
        <Table
          columns={tableColumns}
          data={filtered}
          isLoading={pipeline.loading}
          errorMessage={pipeline.error ?? undefined}
          onRetry={pipeline.refresh}
          onRowClick={open}
          emptyMessage={t('crm.opportunities.empty')}
          ariaLabel={t('crm.nav.opportunities')}
          rowActions={(o) =>
            canDelete
              ? [{ label: t('crm.common.delete'), onClick: () => remove(o), destructive: true }]
              : []
          }
          summaryByColumn={(rows) => ({
            amount: fmt.money(rows.reduce((s, o) => s + (Number(o.amount) || 0), 0)),
          })}
        />
      )}

      {pipeline.pendingLost && (
        <LostReasonModal
          open
          reasons={settings.lostReasons}
          onCancel={pipeline.cancelLost}
          onConfirm={pipeline.confirmLost}
        />
      )}
    </div>
  );
};

export default Opportunities;
