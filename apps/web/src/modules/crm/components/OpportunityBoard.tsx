import { useI18n } from '@/i18n/I18nContext';
import React, { useMemo } from 'react';
import { Badge, Kanban, type KanbanColumn, type KanbanTone } from '@openfactu/ui';
import { User } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { isStale, type Member, type Opportunity, type StageColumn } from '../domain/crm';

interface Props {
  columns: StageColumn[];
  canWrite: boolean;
  onOpen: (o: Opportunity) => void;
  onMove: (o: Opportunity, stageId: string) => void;
  members: Map<string, Member>;
  /** Días sin actividad para marcar una oportunidad como parada. */
  staleDays: number;
  /** Las columnas cerradas solo enseñan lo de estos últimos días. */
  closedDays: number;
}

const KIND_TONE: Record<string, KanbanTone> = {
  open: 'accent',
  won: 'success',
  lost: 'default',
};

/**
 * Tablero del embudo con el `Kanban` de @openfactu/ui: arrastrar con ratón,
 * Espacio + flechas con teclado y, en móvil, el menú «mover a…» de cada
 * tarjeta. Antes era un tablero a mano con arrastre nativo, que solo
 * funcionaba con ratón, y un selector de etapa en cada tarjeta para lo demás.
 */
export const OpportunityBoard: React.FC<Props> = ({
  columns,
  canWrite,
  onOpen,
  onMove,
  members,
  staleDays,
  closedDays,
}) => {
  const fmt = useFormat();
  const { t } = useI18n();

  const byId = useMemo(
    () => new Map(columns.flatMap(({ items }) => items.map((o) => [o.id, o] as const))),
    [columns],
  );

  const kanbanColumns = useMemo<KanbanColumn[]>(
    () =>
      columns.map(({ stage, items, total }) => ({
        id: stage.id,
        tone: KIND_TONE[stage.kind] ?? 'default',
        label: (
          <span className="flex flex-col">
            <span>{stage.name}</span>
            <span className="text-xs font-normal normal-case tracking-normal text-fg-muted tabular-nums">
              {fmt.money(total)} · {stage.probability}%
              {stage.kind !== 'open' && ` · ${t('crm.board.lastDays', { days: closedDays })}`}
            </span>
          </span>
        ),
        cards: items.map((o) => {
          const owner = o.ownerUserId ? members.get(o.ownerUserId) : undefined;
          const stale = isStale(o, staleDays);
          return {
            id: o.id,
            title: o.title,
            description: o.partnerName,
            locked: !canWrite,
            due: o.expectedCloseDate ?? undefined,
            // Ganada o perdida: la fecha de cierre ya no puede «vencer».
            done: stage.kind !== 'open',
            assignees: owner ? [{ name: owner.name, src: owner.avatarUrl ?? undefined }] : [],
            meta: (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-fg-body tabular-nums">
                  {fmt.money(o.amount)}
                </span>
                {o.contactName && (
                  <span className="flex items-center gap-1">
                    <User size={10} /> {o.contactName}
                  </span>
                )}
              </span>
            ),
            badges:
              o.isProspect || stale || (o.stageKind === 'lost' && o.lostReason) ? (
                <>
                  {o.isProspect && <Badge variant="warning">{t('crm.board.prospect')}</Badge>}
                  {stale && <Badge variant="warning">{t('crm.board.stale')}</Badge>}
                  {o.stageKind === 'lost' && o.lostReason && (
                    <Badge variant="neutral">{o.lostReason}</Badge>
                  )}
                </>
              ) : undefined,
            labels: o.tags?.map((tag) => ({ text: tag, tone: 'accent' as const })),
          };
        }),
      })),
    [columns, members, staleDays, closedDays, canWrite, fmt, t],
  );

  return (
    <Kanban
      aria-label={t('crm.board.ariaLabel')}
      columns={kanbanColumns}
      onCardClick={(card) => {
        const o = byId.get(card.id);
        if (o) onOpen(o);
      }}
      onCardMove={
        canWrite
          ? (card, to) => {
              const o = byId.get(card.id);
              if (o) onMove(o, to.columnId);
            }
          : undefined
      }
    />
  );
};
