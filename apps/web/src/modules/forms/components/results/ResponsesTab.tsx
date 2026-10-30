import { useI18n } from '@/i18n/I18nContext';
import React, { useState } from 'react';
import { Button, EmptyState, Skeleton, Tabs, usePopup, useToast } from '@openfactu/ui';
import { BarChart3, Download, Send, Trash2 } from 'lucide-react';
import { downloadPdf } from '@/utils/downloadPdf';
import { formsApi } from '../../api/formsApi';
import type { FormDoc, FormResponseRow } from '../../domain/types';
import { useResponses } from '../../hooks/useResponses';
import { SummaryView } from './SummaryView';
import { ByQuestionView } from './ByQuestionView';
import { IndividualView } from './IndividualView';

type View = 'summary' | 'question' | 'individual';

interface Props {
  form: FormDoc;
  canWrite: boolean;
  canDelete: boolean;
}

/** Pestaña «Respuestas»: resumen, por pregunta e individual. */
export const ResponsesTab: React.FC<Props> = ({ form, canWrite, canDelete }) => {
  const { t } = useI18n();
  const toast = useToast();
  const popup = usePopup();
  const { rows, summary, reload } = useResponses(form.id);
  const [view, setView] = useState<View>('summary');
  const quiz = form.settings.quiz;

  const removeOne = async (row: FormResponseRow) => {
    const ok = await popup.confirm({
      title: t('forms.responses.deleteTitle'),
      message: t('forms.responses.deleteMessage'),
      tone: 'danger',
      confirmLabel: t('forms.common.delete'),
    });
    if (!ok) return;
    try {
      await formsApi.removeResponse(form.id, row.id);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms.errors.deleteFailed'));
    }
  };

  const removeAll = async () => {
    const ok = await popup.confirm({
      title: t('forms.responses.deleteAllTitle'),
      message: t('forms.responses.deleteAllMessage', { count: rows?.length ?? 0 }),
      tone: 'danger',
      confirmLabel: t('forms.responses.deleteAll'),
    });
    if (!ok) return;
    try {
      await formsApi.removeAllResponses(form.id);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms.errors.deleteFailed'));
    }
  };

  const release = async () => {
    try {
      const r = await formsApi.releaseScores(form.id);
      toast.success(
        r.sent
          ? t('forms.responses.scoresSent', { count: r.sent })
          : t('forms.responses.scoresReleased'),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms.responses.releaseFailed'));
    }
  };

  if (!rows || !summary) return <Skeleton className="h-40 w-full" />;
  if (rows.length === 0)
    return (
      <EmptyState
        icon={<BarChart3 size={18} />}
        title={t('forms.responses.empty')}
        hint={t('forms.responses.emptyHint')}
      />
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-fg-default">
          {t('forms.responses.count', { count: rows.length })}
        </h2>
        <div className="flex flex-wrap gap-2">
          {quiz.enabled && quiz.release === 'later' && canWrite && (
            <Button type="button" variant="secondary" size="sm" onClick={release}>
              <Send size={14} />{' '}
              {quiz.released
                ? t('forms.responses.resendScores')
                : t('forms.responses.releaseScores')}
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => downloadPdf(formsApi.exportUrl(form.id), `${form.slug}.csv`)}
          >
            <Download size={14} /> {t('forms.responses.exportCsv')}
          </Button>
          {canDelete && (
            <Button type="button" variant="ghost" size="sm" onClick={removeAll}>
              <Trash2 size={14} /> {t('forms.responses.deleteAll')}
            </Button>
          )}
        </div>
      </div>
      <Tabs
        variant="segmented"
        value={view}
        onChange={(k) => setView(k as View)}
        items={[
          { key: 'summary', label: t('forms.responses.tabs.summary') },
          { key: 'question', label: t('forms.responses.tabs.question') },
          { key: 'individual', label: t('forms.responses.tabs.individual') },
        ]}
      />
      {view === 'summary' && <SummaryView summary={summary} />}
      {view === 'question' && <ByQuestionView definition={form.definition} rows={rows} />}
      {view === 'individual' && (
        <IndividualView
          formId={form.id}
          definition={form.definition}
          rows={rows}
          quiz={quiz.enabled}
          canWrite={canWrite}
          canDelete={canDelete}
          onDelete={removeOne}
          onGraded={reload}
        />
      )}
    </div>
  );
};
