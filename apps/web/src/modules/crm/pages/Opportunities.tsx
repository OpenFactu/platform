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
      title: 'Borrar oportunidad',
      message: `¿Borrar «${o.title}» y sus actividades?`,
      tone: 'danger',
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    try {
      await opportunitiesApi.remove(o.id);
      pipeline.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo borrar');
    }
  };

  const tableColumns: TableColumn<Opportunity>[] = [
    { header: 'Oportunidad', accessor: 'title', sortable: true, card: 'title' },
    { header: 'Interlocutor', accessor: 'partnerName', sortable: true, card: 'subtitle' },
    {
      header: 'Etapa',
      id: 'stage',
      cell: (o) => <Badge variant={STAGE_KIND_VARIANT[o.stageKind ?? 'open']}>{o.stageName}</Badge>,
      sortAccessor: (o) => o.stageName,
      sortable: true,
      card: 'status',
    },
    {
      header: 'Importe',
      id: 'amount',
      cell: (o) => fmt.money(o.amount),
      sortAccessor: (o) => Number(o.amount),
      sortable: true,
      align: 'right',
    },
    {
      header: 'Cierre previsto',
      id: 'close',
      cell: (o) => fmt.date(o.expectedCloseDate),
      sortAccessor: (o) => o.expectedCloseDate ?? '',
      sortable: true,
      card: 'meta',
    },
    { header: 'Contacto', accessor: (o) => o.contactName ?? '—' },
    {
      header: 'Responsable',
      id: 'owner',
      accessor: (o) => (o.ownerUserId ? (members.get(o.ownerUserId)?.name ?? '—') : '—'),
    },
    { header: 'Origen', id: 'source', accessor: (o) => o.source ?? '—' },
  ];

  return (
    <div className="p-4 w-full space-y-4">
      <PageHeader
        title="Oportunidades"
        subtitle="El embudo comercial: arrastra una tarjeta para cambiarla de etapa"
        icon={<Target size={18} />}
        size="sm"
        actions={
          canWrite && (
            <Button type="button" size="sm" onClick={() => navigate('/crm/opportunities/new')}>
              <Plus size={14} /> Nueva oportunidad
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Abiertas" value={String(pipeline.summary.openCount)} />
        <KpiCard label="Importe abierto" value={fmt.money(pipeline.summary.openAmount)} />
        <KpiCard label="Previsión ponderada" value={fmt.money(pipeline.summary.weighted)} />
      </div>

      {/* Buscador a la izquierda; los filtros a la derecha y, si no caben, en la
          línea siguiente. Ningún control se encoge: los segmentados recortan
          (overflow-hidden) y se comerían su última opción. */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por título, interlocutor o contacto"
          className="w-full sm:w-auto sm:flex-1 sm:min-w-[16rem] sm:max-w-sm"
        />
        <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
          {view === 'list' && (
            <SegmentedControl
              size="sm"
              className="shrink-0"
              aria-label="Qué oportunidades ver"
              value={listScope}
              onChange={(v) => setListScope(v as ListScope)}
              options={[
                { value: 'open', label: 'Abiertas' },
                { value: 'closed', label: 'Cerradas' },
                { value: 'all', label: 'Todas' },
              ]}
            />
          )}
          <div className="shrink-0 whitespace-nowrap">
            <Switch label="Solo las mías" checked={onlyMine} onChange={setOnlyMine} />
          </div>
          <Tabs
            variant="segmented"
            size="sm"
            className="shrink-0"
            value={view}
            onChange={(k) => setView(k as View)}
            items={[
              { key: 'board', label: 'Tablero', icon: <Columns3 size={14} /> },
              { key: 'list', label: 'Lista', icon: <List size={14} /> },
            ]}
          />
        </div>
      </div>

      {view === 'board' ? (
        <OpportunityBoard
          columns={columns}
          stages={pipeline.stages}
          canWrite={canWrite}
          drag={pipeline.drag}
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
          emptyMessage="Todavía no hay oportunidades."
          ariaLabel="Oportunidades"
          rowActions={(o) =>
            canDelete ? [{ label: 'Borrar', onClick: () => remove(o), destructive: true }] : []
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
