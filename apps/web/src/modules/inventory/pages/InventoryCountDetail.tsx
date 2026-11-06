import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Loader,
  PageHeader,
  Progress,
  SearchInput,
  SegmentedControl,
} from '@openfactu/ui';
import { ArrowLeft, ClipboardCheck, Plus, RotateCcw, ScanLine, X } from 'lucide-react';
import { PageBack } from '@/components/common/PageBack';
import { ResponsiveActions } from '@/components/common/ResponsiveActions';
import { BarcodeCameraModal } from '@/components/scanner/BarcodeCameraModal';
import { useAuth } from '@/context/AuthContext';
import { useGoBack } from '@/hooks/useGoBack';
import { useFormat } from '@/hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';
import { CountAddLineModal } from '../components/CountAddLineModal';
import { CountBatchModal } from '../components/CountBatchModal';
import { CountLineRow } from '../components/CountLineRow';
import { CountReviewTable } from '../components/CountReviewTable';
import { canSeeItemCosts } from '../domain/itemCost';
import {
  allowedFilters,
  canReviewCounts,
  canWriteCounts,
  COUNT_STATUS_VARIANT,
  countProgress,
  filterLines,
  type CountLine,
  type LineFilter,
} from '../domain/inventoryCount';
import { useInventoryCount } from '../hooks/useInventoryCount';

type Confirming = 'finish' | 'close' | 'cancel' | null;

/** Un recuento: contar con el móvil o el lector, revisar las diferencias y cerrarlo. */
export const InventoryCountDetail: React.FC = () => {
  const { t } = useI18n();
  const fmt = useFormat();
  const { id = '' } = useParams();
  const { user } = useAuth();
  const canWrite = canWriteCounts(user ?? undefined);
  const goBack = useGoBack();
  const state = useInventoryCount(id);
  const { count, filter, query } = state;
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [batchLine, setBatchLine] = useState<CountLine | null>(null);

  const counting = count?.status === 'open' && canWrite;
  const available = allowedFilters({ counting, revealed: !!count?.revealed });
  const activeFilter = available.includes(filter) ? filter : available[0];
  const lines = useMemo(
    () => filterLines(count?.lines ?? [], activeFilter, query),
    [count?.lines, activeFilter, query],
  );

  if (state.loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader />
      </div>
    );
  }
  if (!count) {
    return <EmptyState title={t('inventory.counts.notFound')} />;
  }

  const canReview = canReviewCounts(user ?? undefined);
  const reviewing = count.status === 'review';
  const live = count.status === 'open' || count.status === 'review';
  const scope = [count.warehouseName, count.zoneName, count.categoryName]
    .filter(Boolean)
    .join(' · ');

  const filters: Array<{ value: LineFilter; label: string }> = counting
    ? [
        {
          value: 'pending',
          label: t('inventory.counts.filterPending', { count: count.summary.pending }),
        },
        {
          value: 'counted',
          label: t('inventory.counts.filterCounted', { count: count.summary.counted }),
        },
        { value: 'all', label: t('inventory.counts.filterAll') },
      ]
    : [
        ...(count.revealed
          ? [
              {
                value: 'difference' as const,
                label: t('inventory.counts.filterDifference', {
                  count: count.summary.withDifference ?? 0,
                }),
              },
            ]
          : []),
        {
          value: 'counted',
          label: t('inventory.counts.filterCounted', { count: count.summary.counted }),
        },
        { value: 'all', label: t('inventory.counts.filterAll') },
      ];

  const runConfirmed = async () => {
    const action = confirming;
    setConfirming(null);
    if (action === 'finish') await state.finish();
    if (action === 'close') await state.close();
    if (action === 'cancel') await state.cancel();
  };

  const mobileActions = [
    ...(counting
      ? [
          {
            id: 'add',
            label: t('inventory.counts.addAction'),
            icon: <Plus size={19} />,
            onClick: () => setAdding(true),
          },
          {
            id: 'finish',
            label: t('inventory.counts.finishAction'),
            icon: <ClipboardCheck size={19} />,
            onClick: () => setConfirming('finish' as const),
          },
        ]
      : []),
    ...(reviewing && canReview
      ? [
          {
            id: 'close',
            label: t('inventory.counts.closeAction'),
            icon: <ClipboardCheck size={19} />,
            onClick: () => setConfirming('close' as const),
          },
          {
            id: 'reopen',
            label: t('inventory.counts.reopenAction'),
            icon: <RotateCcw size={19} />,
            onClick: () => void state.reopen(),
          },
        ]
      : []),
    ...(live && canWrite
      ? [
          {
            id: 'cancel',
            label: t('inventory.counts.cancelCount'),
            icon: <X size={19} />,
            onClick: () => setConfirming('cancel' as const),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4 p-4">
      <PageBack onBack={goBack}>
        <Button variant="secondary" size="sm" className="gap-2" onClick={goBack}>
          <ArrowLeft size={16} /> {t('inventory.counts.back')}
        </Button>
      </PageBack>

      <PageHeader
        title={count.code}
        subtitle={scope}
        actions={
          <ResponsiveActions source="inventory-count" actions={mobileActions}>
            <div className="flex flex-wrap items-center gap-2">
              {counting && (
                <>
                  <Button variant="secondary" className="gap-2" onClick={() => setScanning(true)}>
                    <ScanLine size={16} /> {t('inventory.counts.scan')}
                  </Button>
                  <Button variant="secondary" className="gap-2" onClick={() => setAdding(true)}>
                    <Plus size={16} /> {t('inventory.counts.addAction')}
                  </Button>
                  <Button className="gap-2" onClick={() => setConfirming('finish')}>
                    <ClipboardCheck size={16} /> {t('inventory.counts.finishAction')}
                  </Button>
                </>
              )}
              {reviewing && canReview && (
                <>
                  <Button
                    variant="secondary"
                    className="gap-2"
                    onClick={() => void state.reopen()}
                    disabled={state.busy}
                  >
                    <RotateCcw size={16} /> {t('inventory.counts.reopenAction')}
                  </Button>
                  <Button
                    className="gap-2"
                    onClick={() => setConfirming('close')}
                    isLoading={state.busy}
                  >
                    <ClipboardCheck size={16} /> {t('inventory.counts.closeAction')}
                  </Button>
                </>
              )}
              {live && canWrite && (
                <Button variant="secondary" onClick={() => setConfirming('cancel')}>
                  {t('inventory.counts.cancelCount')}
                </Button>
              )}
            </div>
          </ResponsiveActions>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={COUNT_STATUS_VARIANT[count.status]}>
          {t(`inventory.counts.status.${count.status}`)}
        </Badge>
        {count.blind && <Badge variant="neutral">{t('inventory.counts.blindBadge')}</Badge>}
        <span className="text-xs text-fg-muted">
          {t('inventory.counts.openedOn', { date: fmt.date(count.createdAt) })}
        </span>
      </div>

      <Progress
        value={countProgress(count.summary)}
        label={t('inventory.counts.progress', {
          counted: count.summary.counted,
          total: count.summary.total,
        })}
        showValue
      />

      {count.notes && <p className="text-sm text-fg-body">{count.notes}</p>}

      {reviewing && !canReview && <Alert tone="info">{t('inventory.counts.waitingReview')}</Alert>}
      {reviewing && canReview && count.summary.pending > 0 && (
        <Alert tone="warning">
          {t('inventory.counts.uncountedWarning', { count: count.summary.pending })}
        </Alert>
      )}
      {count.status === 'closed' && count.revealed && (
        <Alert tone="success">
          {t('inventory.counts.closedSummary', {
            count: count.summary.withDifference ?? 0,
            documents:
              [count.receiptCode, count.issueCode].filter(Boolean).join(', ') ||
              t('inventory.counts.noDocuments'),
          })}
        </Alert>
      )}
      {state.problems.length > 0 && (
        <Alert tone="danger" title={t('inventory.counts.problemsTitle')}>
          <ul className="mt-1 space-y-0.5 text-sm">
            {state.problems.map((problem) => (
              <li key={`${problem.lineId}-${problem.message}`}>{problem.message}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <SearchInput
          className="min-w-0 md:max-w-xs md:flex-1"
          value={query}
          onChange={state.setQuery}
          clearable
          placeholder={t('inventory.counts.searchLine')}
        />
        <SegmentedControl
          options={filters}
          value={activeFilter}
          onChange={(value) => state.setFilter(value as LineFilter)}
          size="sm"
          className="shrink-0"
          aria-label={t('inventory.counts.filterLabel')}
        />
      </div>

      <Card noPadding>
        {count.revealed && !counting ? (
          <CountReviewTable
            count={count}
            lines={lines}
            problems={state.problems}
            canSeeCost={canSeeItemCosts(user)}
            canReview={canReview}
            onPickBatch={setBatchLine}
          />
        ) : lines.length === 0 ? (
          <EmptyState
            title={t(
              count.summary.total === 0
                ? 'inventory.counts.emptyTitle'
                : 'inventory.counts.noLinesHere',
            )}
            hint={count.summary.total === 0 ? t('inventory.counts.emptyHint') : undefined}
          />
        ) : (
          lines.map((line) => (
            <CountLineRow
              key={line.id}
              line={line}
              highlighted={line.id === state.lastLineId}
              disabled={!counting}
              onCount={(value) => {
                if (counting) void state.setLineCount(line.id, value);
              }}
            />
          ))
        )}
      </Card>

      <CountAddLineModal
        open={adding || !!state.askBatchFor}
        countId={count.id}
        zoneScoped={!!count.zoneId}
        presetItem={state.askBatchFor}
        onClose={() => {
          setAdding(false);
          state.setAskBatchFor(null);
        }}
        onAdd={state.addLine}
      />
      <CountBatchModal
        line={batchLine}
        onClose={() => setBatchLine(null)}
        onSave={state.saveAllocations}
      />
      <BarcodeCameraModal
        open={scanning}
        onClose={() => setScanning(false)}
        onScan={(code) => void state.scan(code)}
      />
      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? t(`inventory.counts.confirm.${confirming}.title`) : undefined}
        tone={confirming === 'cancel' ? 'danger' : 'warning'}
        message={
          confirming
            ? t(`inventory.counts.confirm.${confirming}.message`, {
                pending: count.summary.pending,
                differences: count.summary.withDifference ?? 0,
              })
            : ''
        }
        confirmLabel={confirming ? t(`inventory.counts.confirm.${confirming}.action`) : undefined}
        cancelLabel={t('inventory.counts.cancelAction')}
        onConfirm={() => void runConfirmed()}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
};

export default InventoryCountDetail;
