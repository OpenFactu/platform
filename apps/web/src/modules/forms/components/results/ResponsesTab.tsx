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
  const toast = useToast();
  const popup = usePopup();
  const { rows, summary, reload } = useResponses(form.id);
  const [view, setView] = useState<View>('summary');
  const quiz = form.settings.quiz;

  const removeOne = async (row: FormResponseRow) => {
    const ok = await popup.confirm({
      title: 'Borrar respuesta',
      message: 'La respuesta y sus archivos se borran para siempre.',
      tone: 'danger',
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    try {
      await formsApi.removeResponse(form.id, row.id);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo borrar');
    }
  };

  const removeAll = async () => {
    const ok = await popup.confirm({
      title: 'Borrar todas las respuestas',
      message: `Se borran las ${rows?.length ?? 0} respuestas y sus archivos. No se puede deshacer.`,
      tone: 'danger',
      confirmLabel: 'Borrar todas',
    });
    if (!ok) return;
    try {
      await formsApi.removeAllResponses(form.id);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo borrar');
    }
  };

  const release = async () => {
    try {
      const r = await formsApi.releaseScores(form.id);
      toast.success(r.sent ? `Notas enviadas a ${r.sent} persona(s)` : 'Notas publicadas');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron publicar');
    }
  };

  if (!rows || !summary) return <Skeleton className="h-40 w-full" />;
  if (rows.length === 0)
    return (
      <EmptyState
        icon={<BarChart3 size={18} />}
        title="Aún no hay respuestas"
        hint="Comparte el enlace o manda invitaciones para empezar a recibirlas."
      />
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-fg-default">{rows.length} respuesta(s)</h2>
        <div className="flex flex-wrap gap-2">
          {quiz.enabled && quiz.release === 'later' && canWrite && (
            <Button type="button" variant="secondary" size="sm" onClick={release}>
              <Send size={14} /> {quiz.released ? 'Volver a enviar notas' : 'Publicar notas'}
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => downloadPdf(formsApi.exportUrl(form.id), `${form.slug}.csv`)}
          >
            <Download size={14} /> Exportar CSV
          </Button>
          {canDelete && (
            <Button type="button" variant="ghost" size="sm" onClick={removeAll}>
              <Trash2 size={14} /> Borrar todas
            </Button>
          )}
        </div>
      </div>
      <Tabs
        variant="segmented"
        value={view}
        onChange={(k) => setView(k as View)}
        items={[
          { key: 'summary', label: 'Resumen' },
          { key: 'question', label: 'Por pregunta' },
          { key: 'individual', label: 'Individual' },
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
