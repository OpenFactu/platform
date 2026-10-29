import React from 'react';
import { Select, cn } from '@openfactu/ui';
import { Calendar, User } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import type { Opportunity, OpportunityStage, StageColumn } from '../domain/crm';

interface Props {
  columns: StageColumn[];
  stages: OpportunityStage[];
  canWrite: boolean;
  drag: {
    dragId: string | null;
    start: (id: string) => void;
    end: () => void;
    dropOn: (stageId: string) => void;
  };
  onOpen: (o: Opportunity) => void;
  onMove: (o: Opportunity, stageId: string) => void;
}

const KIND_DOT: Record<string, string> = {
  open: 'bg-accent',
  won: 'bg-success',
  lost: 'bg-border-strong',
};

/**
 * Tablero del embudo. Arrastrar solo funciona con ratón; el selector de etapa
 * de cada tarjeta cubre teclado y móvil.
 */
export const OpportunityBoard: React.FC<Props> = ({
  columns,
  stages,
  canWrite,
  drag,
  onOpen,
  onMove,
}) => {
  const fmt = useFormat();
  const stageOptions = stages.map((s) => ({ value: s.id, label: s.name }));

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 snap-x">
      {columns.map(({ stage, items, total }) => (
        <section
          key={stage.id}
          aria-label={stage.name}
          onDragOver={(e) => canWrite && e.preventDefault()}
          onDrop={() => drag.dropOn(stage.id)}
          className={cn(
            'snap-start shrink-0 w-[85vw] sm:w-72 rounded-xs border bg-bg-muted flex flex-col min-h-[320px]',
            drag.dragId ? 'border-accent' : 'border-border-default',
          )}
        >
          <header className="px-3 py-2 border-b border-border-default">
            <div className="flex items-center gap-2">
              <span className={cn('w-1.5 h-1.5', KIND_DOT[stage.kind])} />
              <span className="text-[11px] font-bold uppercase tracking-wider text-fg-default flex-1 truncate">
                {stage.name}
              </span>
              <span className="text-[10px] font-bold text-fg-muted">{items.length}</span>
            </div>
            <div className="mt-0.5 text-xs text-fg-muted tabular-nums">
              {fmt.money(total)} · {stage.probability}%
            </div>
          </header>
          <div className="flex-1 p-2 space-y-2">
            {items.map((o) => (
              <article
                key={o.id}
                draggable={canWrite}
                onDragStart={() => drag.start(o.id)}
                onDragEnd={drag.end}
                className={cn(
                  'group rounded-xs border border-border-default bg-bg-card p-2.5',
                  'hover:border-accent transition-colors',
                  canWrite && 'cursor-grab',
                  drag.dragId === o.id && 'opacity-50',
                )}
              >
                <button type="button" onClick={() => onOpen(o)} className="block w-full text-left">
                  <div className="text-sm font-semibold text-fg-default leading-snug">
                    {o.title}
                  </div>
                  <div className="text-xs text-fg-muted truncate">{o.partnerName}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-muted">
                    <span className="font-semibold text-fg-body tabular-nums">
                      {fmt.money(o.amount)}
                    </span>
                    {o.contactName && (
                      <span className="flex items-center gap-1">
                        <User size={10} /> {o.contactName}
                      </span>
                    )}
                    {o.expectedCloseDate && (
                      <span className="flex items-center gap-1">
                        <Calendar size={10} /> {fmt.date(o.expectedCloseDate)}
                      </span>
                    )}
                  </div>
                </button>
                {canWrite && (
                  <div className="mt-2">
                    <Select
                      ariaLabel={`Etapa de ${o.title}`}
                      options={stageOptions}
                      value={o.stageId}
                      onChange={(v) => onMove(o, v)}
                    />
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
