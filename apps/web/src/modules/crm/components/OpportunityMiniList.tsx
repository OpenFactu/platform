import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, EmptyState } from '@openfactu/ui';
import { Target } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { STAGE_KIND_VARIANT, type Opportunity } from '../domain/crm';

/** Lista compacta de oportunidades que abre su ficha al pulsar. */
export const OpportunityMiniList: React.FC<{
  items: Opportunity[];
  empty: string;
  /** Qué fecha enseñar a la derecha. */
  dateOf?: (o: Opportunity) => string | null | undefined;
}> = ({ items, empty, dateOf }) => {
  const fmt = useFormat();
  const navigate = useNavigate();
  if (items.length === 0)
    return <EmptyState variant="compact" icon={<Target size={18} />} title={empty} />;
  return (
    <ul className="divide-y divide-border-subtle rounded-xs border border-border-default bg-bg-card">
      {items.map((o) => (
        <li key={o.id}>
          <button
            type="button"
            onClick={() => navigate(`/crm/opportunities/${o.id}`)}
            className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-bg-hover"
          >
            <span className="flex-1 min-w-0">
              <span className="block text-sm text-fg-default truncate">{o.title}</span>
              <span className="block text-xs text-fg-muted truncate">{o.partnerName}</span>
            </span>
            <Badge variant={STAGE_KIND_VARIANT[o.stageKind ?? 'open']}>{o.stageName}</Badge>
            <span className="text-sm tabular-nums text-fg-body">{fmt.money(o.amount)}</span>
            {dateOf && (
              <span className="text-xs tabular-nums text-fg-subtle w-20 text-right">
                {fmt.date(dateOf(o))}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
};
