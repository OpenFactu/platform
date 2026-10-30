import { useCallback, useEffect, useState } from 'react';
import { formsApi } from '../api/formsApi';
import type { FormResponseDetail, FormResponseRow, FormSummary } from '../domain/types';

/** Respuestas y resumen de un formulario, con recarga tras borrar o corregir. */
export function useResponses(formId: string) {
  const [rows, setRows] = useState<FormResponseRow[] | null>(null);
  const [summary, setSummary] = useState<FormSummary | null>(null);

  const reload = useCallback(() => {
    formsApi
      .responses(formId)
      .then(setRows)
      .catch(() => setRows([]));
    formsApi
      .summary(formId)
      .then(setSummary)
      .catch(() => setSummary({ total: 0, questions: [], quiz: null }));
  }, [formId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { rows, summary, reload };
}

/** Detalle de una respuesta (archivos y corrección). */
export function useResponseDetail(formId: string, responseId: string | null) {
  const [detail, setDetail] = useState<FormResponseDetail | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  useEffect(() => {
    if (!responseId) return;
    let alive = true;
    formsApi
      .response(formId, responseId)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setLoadedId(responseId);
      })
      .catch(() => {
        if (alive) setLoadedId(responseId);
      });
    return () => {
      alive = false;
    };
  }, [formId, responseId]);

  const saveGrades = async (grades: Record<string, number>) => {
    if (!responseId || !detail) return;
    const grading = await formsApi.grade(formId, responseId, grades);
    setDetail({ ...detail, grades, grading });
  };

  return { detail: loadedId === responseId ? detail : null, saveGrades };
}
