import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, EmptyState, Table, type TableColumn } from '@openfactu/ui';
import { Target } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { STAGE_KIND_VARIANT, type Opportunity } from '../domain/crm';

/**
 * Lista compacta de oportunidades que abre su ficha al pulsar (Hoy, ficha del
 * cliente). En pantallas estrechas pasa a tarjetas.
 */
export const OpportunityMiniList: React.FC<{
  items: Opportunity[];
  empty: string;
  /** Qué fecha enseñar, y con qué título de columna. */
  date?: { header: string; of: (o: Opportunity) => string | null | undefined };
  /** Ocultar el cliente (p. ej. en la ficha del propio cliente). */
  hideClient?: boolean;
}> = ({ items, empty, date, hideClient }) => {
  const fmt = useFormat();
  const navigate = useNavigate();

  const columns: TableColumn<Opportunity>[] = [
    { header: 'Oportunidad', id: 'title', accessor: 'title', card: 'title' },
    ...(hideClient
      ? []
      : [
          {
            header: 'Cliente',
            id: 'client',
            accessor: (o: Opportunity) => o.partnerName ?? '—',
            card: 'subtitle',
          } as TableColumn<Opportunity>,
        ]),
    {
      header: 'Etapa',
      id: 'stage',
      card: 'status',
      cell: (o) => <Badge variant={STAGE_KIND_VARIANT[o.stageKind ?? 'open']}>{o.stageName}</Badge>,
    },
    { header: 'Importe', id: 'amount', accessor: (o) => fmt.money(o.amount), align: 'right' },
    ...(date
      ? [
          {
            header: date.header,
            id: 'date',
            accessor: (o: Opportunity) => fmt.date(date.of(o)),
            card: 'meta',
          } as TableColumn<Opportunity>,
        ]
      : []),
  ];

  return (
    <Table
      columns={columns}
      data={items}
      onRowClick={(o) => navigate(`/crm/opportunities/${o.id}`)}
      density="compact"
      ariaLabel="Oportunidades"
      emptyMessage={<EmptyState variant="compact" icon={<Target size={18} />} title={empty} />}
    />
  );
};
