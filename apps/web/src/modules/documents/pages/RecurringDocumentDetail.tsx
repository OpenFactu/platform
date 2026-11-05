import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  List,
  ListItem,
  Loader,
  PageHeader,
  usePopup,
  useToast,
} from '@openfactu/ui';
import { ArrowLeft, Pause, Pencil, Play, Square, Trash2, Zap } from 'lucide-react';
import { PageBack } from '@/components/common/PageBack';
import { ResponsiveActions } from '@/components/common/ResponsiveActions';
import { useAuth } from '@/context/AuthContext';
import { useTabs } from '@/context/TabsContext';
import { useFormat } from '@/hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';
import { recurringApi } from '../api/salesApi';
import { RECURRING_STATUS_VARIANT, type RecurringDetail } from '../domain/sales';

const Fact: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <p className="text-xs text-fg-muted">{label}</p>
    <p className="font-semibold text-fg-default">{value}</p>
  </div>
);

/** Una recurrente: cómo se repite, qué ha generado y qué hacer con ella. */
export const RecurringDocumentDetail: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const { t } = useI18n();
  const fmt = useFormat();
  const toast = useToast();
  const popup = usePopup();
  const navigate = useNavigate();
  const { openTab } = useTabs();
  const { user } = useAuth();
  const canWrite =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    !!user?.permissions?.['/sales/recurring']?.write;
  const canDelete =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    !!user?.permissions?.['/sales/recurring']?.delete;
  const [row, setRow] = useState<RecurringDetail | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      recurringApi
        .get(id)
        .then(setRow)
        .catch((e) => setProblem(e instanceof Error ? e.message : String(e))),
    [id],
  );
  useEffect(() => {
    load();
  }, [load]);

  const back = () => navigate('/sales/recurring');
  const backButton = (
    <PageBack onBack={back}>
      <Button type="button" variant="ghost" size="sm" onClick={back} className="w-fit gap-1">
        <ArrowLeft size={12} /> {t('doc.recurring.title')}
      </Button>
    </PageBack>
  );

  if (!row) {
    return (
      <div className="p-4 space-y-4">
        {problem ? (
          <>
            <PageHeader size="sm" breadcrumbs={backButton} title={t('doc.recurring.title')} />
            <Alert tone="danger">{problem}</Alert>
          </>
        ) : (
          <div className="p-12 flex justify-center">
            <Loader />
          </div>
        )}
      </div>
    );
  }

  const act = async (work: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await work();
      if (done) toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : undefined);
    } finally {
      await load();
      setBusy(false);
    }
  };

  const run = () =>
    act(async () => {
      const { generated } = await recurringApi.run(id);
      toast.success(
        generated.length > 0
          ? generated.length === 1
            ? t('doc.recurring.generatedOne')
            : t('doc.recurring.generated', { count: generated.length })
          : t('doc.recurring.nothingDue'),
      );
    });
  const finish = async () => {
    const ok = await popup.confirm({
      title: t('doc.recurring.finishTitle'),
      message: t('doc.recurring.finishMessage'),
      tone: 'danger',
      confirmLabel: t('doc.recurring.finish'),
      cancelLabel: t('doc.common.back'),
    });
    if (ok) act(() => recurringApi.action(id, 'finish'));
  };
  const remove = async () => {
    const ok = await popup.confirm({
      title: t('doc.recurring.deleteTitle'),
      message: t('doc.recurring.deleteMessage'),
      tone: 'danger',
      confirmLabel: t('doc.recurring.delete'),
      cancelLabel: t('doc.common.back'),
    });
    if (!ok) return;
    try {
      await recurringApi.remove(id);
      back();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : undefined);
    }
  };

  const active = row.status === 'active';
  const paused = row.status === 'paused';
  const edit = () => navigate(`/sales/recurring/${id}/edit`);
  const pause = () => act(() => recurringApi.action(id, 'pause'));
  const resume = () => act(() => recurringApi.action(id, 'resume'));
  const mobileActions = canWrite
    ? [
        ...(active
          ? [
              {
                id: 'run',
                label: t('doc.recurring.runNow'),
                icon: <Zap size={16} />,
                onClick: run,
              },
              {
                id: 'pause',
                label: t('doc.recurring.pause'),
                icon: <Pause size={16} />,
                onClick: pause,
              },
            ]
          : []),
        ...(paused
          ? [
              {
                id: 'resume',
                label: t('doc.recurring.resume'),
                icon: <Play size={16} />,
                onClick: resume,
              },
            ]
          : []),
        ...(row.status !== 'finished'
          ? [
              {
                id: 'edit',
                label: t('doc.recurring.edit'),
                icon: <Pencil size={16} />,
                onClick: edit,
              },
              {
                id: 'finish',
                label: t('doc.recurring.finish'),
                icon: <Square size={16} />,
                onClick: finish,
              },
            ]
          : []),
        ...(canDelete && row.runs.length === 0
          ? [
              {
                id: 'delete',
                label: t('doc.recurring.delete'),
                icon: <Trash2 size={16} />,
                onClick: remove,
              },
            ]
          : []),
      ]
    : [];

  return (
    <div className="p-4 pb-24 max-md:pb-32 space-y-4 animate-in fade-in duration-300">
      <PageHeader
        size="sm"
        breadcrumbs={backButton}
        title={
          <>
            {row.name}
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant={RECURRING_STATUS_VARIANT[row.status]}>
                {t(`doc.recurring.status.${row.status}`)}
              </Badge>
            </span>
          </>
        }
        subtitle={row.partnerName}
        actions={
          <ResponsiveActions source="recurring-detail" actions={mobileActions}>
            {canWrite && (
              <div className="flex flex-wrap gap-2">
                {active && (
                  <Button variant="secondary" onClick={run} disabled={busy}>
                    <Zap size={14} /> {t('doc.recurring.runNow')}
                  </Button>
                )}
                {active && (
                  <Button variant="secondary" onClick={pause} disabled={busy}>
                    <Pause size={14} /> {t('doc.recurring.pause')}
                  </Button>
                )}
                {paused && (
                  <Button variant="secondary" onClick={resume} disabled={busy}>
                    <Play size={14} /> {t('doc.recurring.resume')}
                  </Button>
                )}
                {row.status !== 'finished' && (
                  <Button variant="secondary" onClick={edit} disabled={busy}>
                    <Pencil size={14} /> {t('doc.recurring.edit')}
                  </Button>
                )}
                {row.status !== 'finished' && (
                  <Button variant="ghost" onClick={finish} disabled={busy}>
                    <Square size={14} /> {t('doc.recurring.finish')}
                  </Button>
                )}
                {canDelete && row.runs.length === 0 && (
                  <Button variant="ghost" onClick={remove} disabled={busy}>
                    <Trash2 size={14} /> {t('doc.recurring.delete')}
                  </Button>
                )}
              </div>
            )}
          </ResponsiveActions>
        }
      />

      {row.lastError && (
        <Alert tone="danger" title={t('doc.recurring.lastErrorTitle')}>
          {row.lastError}
        </Alert>
      )}

      <Card>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Fact
            label={t('doc.recurring.frequency')}
            value={t(`doc.recurring.freq.${row.frequency}`)}
          />
          <Fact
            label={t('doc.recurring.nextDate')}
            value={row.nextDate ? fmt.date(row.nextDate) : '—'}
          />
          <Fact label={t('doc.recurring.startDate')} value={fmt.date(row.startDate)} />
          <Fact
            label={t('doc.recurring.endDate')}
            value={row.endDate ? fmt.date(row.endDate) : t('doc.recurring.noEnd')}
          />
          <Fact label={t('doc.recurring.net')} value={fmt.money(row.net)} />
          <Fact
            label={t('doc.recurring.lines')}
            value={
              row.lines.length === 1
                ? t('doc.recurring.lineCountOne')
                : t('doc.recurring.lineCount', { count: row.lines.length })
            }
          />
          <Fact
            label={t('doc.recurring.autoPost')}
            value={row.autoPost ? t('doc.recurring.yes') : t('doc.recurring.noDraft')}
          />
          <Fact
            label={t('doc.recurring.autoSend')}
            value={row.autoSend ? t('doc.recurring.yes') : t('doc.recurring.no')}
          />
        </div>
      </Card>

      <Card title={t('doc.recurring.runsTitle')} noPadding={row.runs.length > 0}>
        {row.runs.length === 0 ? (
          <EmptyState variant="compact" title={t('doc.recurring.noRuns')} />
        ) : (
          <List>
            {row.runs.map((run) => (
              <ListItem
                key={run.id}
                title={t('doc.recurring.runTitle', {
                  date: fmt.date(run.periodDate),
                  num: run.docNum ?? '',
                })}
                description={run.note ?? undefined}
                onClick={() => openTab(`/sales/invoices/${run.documentId}`)}
              />
            ))}
          </List>
        )}
      </Card>
    </div>
  );
};

export default RecurringDocumentDetail;
