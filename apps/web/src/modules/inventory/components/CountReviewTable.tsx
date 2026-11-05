import React from 'react';
import { Badge, Button, Table } from '@openfactu/ui';
import type { TableColumn } from '@openfactu/ui';
import { useFormat } from '@/hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';
import type { CountDetail, CountLine, CountProblem } from '../domain/inventoryCount';

interface Props {
  count: CountDetail;
  lines: CountLine[];
  problems: CountProblem[];
  canSeeCost: boolean;
  canReview: boolean;
  onPickBatch: (line: CountLine) => void;
}

const signed = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—';
  return value > 0 ? `+${value}` : String(value);
};

/** Las diferencias: lo que había, lo contado, lo que se movió por medio y cómo queda. */
export const CountReviewTable: React.FC<Props> = ({
  count,
  lines,
  problems,
  canSeeCost,
  canReview,
  onPickBatch,
}) => {
  const { t } = useI18n();
  const fmt = useFormat();
  const inReview = count.status === 'review';
  const zoneName = (zoneId: string | null) =>
    count.lines.find((line) => line.zoneId === zoneId)?.zoneName ?? zoneId;

  const columns: TableColumn<CountLine>[] = [
    {
      header: t('inventory.counts.item'),
      card: 'title',
      cell: (line) => (
        <span className="block min-w-0">
          <span className="block truncate font-semibold text-fg-default">{line.itemName}</span>
          <span className="block font-mono text-xs text-fg-muted">{line.itemCode}</span>
        </span>
      ),
    },
    {
      header: t('inventory.counts.where'),
      card: 'subtitle',
      cell: (line) =>
        [line.zoneName, line.batchNum].filter(Boolean).join(' · ') || t('inventory.counts.noZone'),
    },
    {
      header: t('inventory.counts.expected'),
      align: 'right',
      cell: (line) => <span className="tabular-nums">{line.expectedQty ?? '—'}</span>,
    },
    {
      header: t('inventory.counts.movedBefore'),
      align: 'right',
      cell: (line) => <span className="tabular-nums">{signed(line.movedBeforeCount)}</span>,
    },
    {
      header: t('inventory.counts.counted'),
      align: 'right',
      cell: (line) => (
        <span className="tabular-nums font-semibold">
          {line.countedQty ?? t('inventory.counts.notCounted')}
        </span>
      ),
    },
    {
      header: t('inventory.counts.difference'),
      align: 'right',
      cell: (line) => (
        <span
          className={`tabular-nums font-semibold ${
            (line.difference ?? 0) < 0
              ? 'text-danger'
              : (line.difference ?? 0) > 0
                ? 'text-success'
                : 'text-fg-muted'
          }`}
        >
          {signed(line.difference ?? 0)}
        </span>
      ),
    },
    ...(inReview
      ? [
          {
            header: t('inventory.counts.movedAfter'),
            align: 'right' as const,
            cell: (line: CountLine) => (
              <span className="tabular-nums">{signed(line.movedAfterCount)}</span>
            ),
          },
          {
            header: t('inventory.counts.final'),
            align: 'right' as const,
            cell: (line: CountLine) => (
              <span className="tabular-nums">{line.finalStock ?? '—'}</span>
            ),
          },
        ]
      : []),
    ...(canSeeCost
      ? [
          {
            header: t('inventory.counts.value'),
            align: 'right' as const,
            cell: (line: CountLine) => (
              <span className="tabular-nums">
                {line.differenceValue ? fmt.money(line.differenceValue) : '—'}
              </span>
            ),
          },
        ]
      : []),
    {
      header: t('inventory.counts.goesTo'),
      cell: (line) => {
        const problem = problems.find((row) => row.lineId === line.id);
        return (
          <div className="flex flex-col items-start gap-1">
            {(line.allocations ?? []).map((row, index) => (
              <span key={index} className="text-xs tabular-nums text-fg-body">
                {[row.zoneId ? zoneName(row.zoneId) : null, row.batchNum]
                  .filter(Boolean)
                  .join(' · ') || t('inventory.counts.noZone')}
                : {signed(row.quantity)}
              </span>
            ))}
            {line.needsBatch && inReview && canReview && (
              <Button
                size="sm"
                variant="secondary"
                onClick={(event) => {
                  event.stopPropagation();
                  onPickBatch(line);
                }}
              >
                {t('inventory.counts.pickBatch')}
              </Button>
            )}
            {line.needsBatch && !(inReview && canReview) && (
              <Badge variant="warning">{t('inventory.counts.pendingBatch')}</Badge>
            )}
            {problem && <span className="text-xs text-danger">{problem.message}</span>}
          </div>
        );
      },
    },
  ];

  return (
    <Table
      className="max-md:p-3"
      columns={columns}
      data={lines}
      rowKey={(line) => line.id}
      emptyMessage={t('inventory.counts.noLines')}
    />
  );
};
