import { useI18n } from '@/i18n/I18nContext';
import React, { useState } from 'react';
import { Badge, Button, Card, NumberInput, Skeleton, useToast } from '@openfactu/ui';
import { ChevronLeft, ChevronRight, Download, Trash2 } from 'lucide-react';
import { allQuestions, formatAnswer, type FormDefinition, type Question } from '@forms-engine';
import { useFormat } from '@/hooks/useFormat';
import { downloadPdf } from '@/utils/downloadPdf';
import { formsApi } from '../../api/formsApi';
import type { FormResponseDetail, FormResponseRow } from '../../domain/types';
import { useResponseDetail } from '../../hooks/useResponses';

interface Props {
  formId: string;
  definition: FormDefinition;
  rows: FormResponseRow[];
  quiz: boolean;
  canWrite: boolean;
  canDelete: boolean;
  onDelete: (row: FormResponseRow) => void;
  onGraded: () => void;
}

/** Corrección de una pregunta: puntos a mano, con lo automático como punto de partida. */
const GradeInput: React.FC<{
  q: Question;
  detail: FormResponseDetail;
  draft: Record<string, number>;
  setDraft: (d: Record<string, number>) => void;
  disabled: boolean;
}> = ({ q, detail, draft, setDraft, disabled }) => {
  const { t } = useI18n();
  const g = detail.grading?.questions[q.id];
  if (!g) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {g.correct === true && <Badge variant="success">{t('forms.individual.correct')}</Badge>}
      {g.correct === false && <Badge variant="error">{t('forms.individual.incorrect')}</Badge>}
      {g.correct === null && <Badge variant="warning">{t('forms.thanks.toGrade')}</Badge>}
      <div className="w-24">
        <NumberInput
          aria-label={t('forms.individual.pointsOf', { title: q.title })}
          value={draft[q.id] ?? g.points}
          onChange={(n) => setDraft({ ...draft, [q.id]: Math.max(0, Math.min(g.max, n ?? 0)) })}
          min={0}
          max={g.max}
          precision={1}
          disabled={disabled}
        />
      </div>
      <span className="text-xs text-fg-muted">{t('forms.individual.ofMax', { max: g.max })}</span>
    </div>
  );
};

/** Respuesta a respuesta, con sus archivos y la corrección si es un cuestionario. */
export const IndividualView: React.FC<Props> = ({
  formId,
  definition,
  rows,
  quiz,
  canWrite,
  canDelete,
  onDelete,
  onGraded,
}) => {
  const { t } = useI18n();
  const fmt = useFormat();
  const toast = useToast();
  const [index, setIndex] = useState(0);
  const at = Math.min(index, rows.length - 1);
  const row = rows[at];
  const { detail, saveGrades } = useResponseDetail(formId, row?.id ?? null);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [draftFor, setDraftFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Al cambiar de respuesta, la corrección a medias se descarta.
  if (row && draftFor !== row.id) {
    setDraftFor(row.id);
    setDraft({});
  }

  if (!row) return null;
  const files = new Map((detail?.files ?? []).map((f) => [f.id, f]));

  const save = async () => {
    setSaving(true);
    try {
      await saveGrades({ ...(detail?.grades ?? {}), ...draft });
      setDraft({});
      onGraded();
      toast.success(t('forms.individual.gradeSaved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms.errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card bodyClassName="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t('forms.individual.previous')}
            onClick={() => setIndex(at - 1)}
            disabled={at === 0}
          >
            <ChevronLeft size={16} />
          </Button>
          <span className="text-sm tabular-nums text-fg-body">
            {t('forms.individual.position', { n: at + 1, total: rows.length })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t('forms.runner.next')}
            onClick={() => setIndex(at + 1)}
            disabled={at >= rows.length - 1}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
        <div className="min-w-0 text-sm text-fg-muted">
          {[row.respondentEmail, row.contactName, row.partnerName, fmt.date(row.createdAt)]
            .filter(Boolean)
            .join(' · ')}
          {row.updatedAt && ` · ${t('forms.individual.edited')}`}
        </div>
        <div className="flex items-center gap-2">
          {quiz && detail?.grading && (
            <Badge variant={detail.grading.pending ? 'warning' : 'accent'}>
              {detail.grading.score} / {detail.grading.maxScore}
              {detail.grading.pending && ` · ${t('forms.individual.toGradeLower')}`}
            </Badge>
          )}
          {canDelete && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t('forms.individual.deleteThis')}
              onClick={() => onDelete(row)}
            >
              <Trash2 size={16} />
            </Button>
          )}
        </div>
      </Card>

      {!detail ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        allQuestions(definition).map((q) => {
          const ids =
            q.type === 'file' && Array.isArray(detail.answers[q.id])
              ? (detail.answers[q.id] as string[])
              : [];
          return (
            <Card
              key={q.id}
              title={q.title || t('forms.question.untitled')}
              bodyClassName="space-y-3"
            >
              {q.type === 'file' ? (
                ids.length ? (
                  <ul className="space-y-1">
                    {ids.map((id) => (
                      <li key={id}>
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          onClick={() =>
                            downloadPdf(
                              formsApi.fileUrl(formId, row.id, id),
                              files.get(id)?.fileName ?? t('forms.individual.fileLower'),
                            )
                          }
                        >
                          <Download size={14} />{' '}
                          {files.get(id)?.fileName ?? t('forms.individual.file')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-fg-subtle">{t('forms.individual.noAnswer')}</p>
                )
              ) : (
                <p className="text-sm text-fg-body whitespace-pre-wrap">
                  {formatAnswer(q, detail.answers) || (
                    <span className="text-fg-subtle">{t('forms.individual.noAnswer')}</span>
                  )}
                </p>
              )}
              {quiz && (
                <GradeInput
                  q={q}
                  detail={detail}
                  draft={draft}
                  setDraft={setDraft}
                  disabled={!canWrite}
                />
              )}
            </Card>
          );
        })
      )}

      {quiz && canWrite && Object.keys(draft).length > 0 && (
        <div className="flex justify-end">
          <Button type="button" onClick={save} isLoading={saving}>
            {t('forms.individual.saveGrade')}
          </Button>
        </div>
      )}
    </div>
  );
};
