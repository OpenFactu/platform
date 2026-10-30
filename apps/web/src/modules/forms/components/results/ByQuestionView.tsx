import React, { useState } from 'react';
import { Card, Select } from '@openfactu/ui';
import { allQuestions, formatAnswer, isEmpty, type FormDefinition } from '@forms-engine';
import { useFormat } from '@/hooks/useFormat';
import type { FormResponseRow } from '../../domain/types';

/** Todas las respuestas a una pregunta, una debajo de otra. */
export const ByQuestionView: React.FC<{ definition: FormDefinition; rows: FormResponseRow[] }> = ({
  definition,
  rows,
}) => {
  const fmt = useFormat();
  const questions = allQuestions(definition);
  const [picked, setPicked] = useState(questions[0]?.id ?? '');
  const q = questions.find((x) => x.id === picked) ?? questions[0];
  if (!q) return <p className="text-sm text-fg-muted">El formulario no tiene preguntas.</p>;
  const answered = rows.filter((r) => !isEmpty(r.answers?.[q.id]));

  return (
    <div className="space-y-4">
      <Select
        label="Pregunta"
        options={questions.map((x) => ({ value: x.id, label: x.title || 'Pregunta sin título' }))}
        value={q.id}
        onChange={setPicked}
      />
      <Card title={q.title || 'Pregunta sin título'} subtitle={`${answered.length} respuesta(s)`}>
        {answered.length === 0 ? (
          <p className="text-sm text-fg-muted">Nadie ha respondido a esta pregunta.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {answered.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              >
                <span className="text-sm text-fg-body whitespace-pre-wrap">
                  {formatAnswer(q, r.answers)}
                </span>
                <span className="shrink-0 text-xs text-fg-muted">
                  {[r.respondentEmail, fmt.date(r.createdAt)].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
