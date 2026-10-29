import React from 'react';
import { Card, KpiCard, StackedBar } from '@openfactu/ui';
import type { QuestionSummary } from '@forms-engine';
import type { FormSummary } from '../../domain/types';

/** Barra horizontal con su porcentaje, una por opción. */
const Bars: React.FC<{
  counts: Array<{ key: string; label: string; count: number }>;
  total: number;
}> = ({ counts, total }) => (
  <ul className="space-y-2">
    {counts.map((c) => {
      const pct = total ? Math.round((c.count / total) * 100) : 0;
      return (
        <li key={c.key} className="grid grid-cols-[minmax(0,10rem)_1fr_4rem] items-center gap-3">
          <span className="truncate text-sm text-fg-body" title={c.label}>
            {c.label}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-bg-muted">
            <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
          </span>
          <span className="text-right text-xs tabular-nums text-fg-muted">
            {c.count} · {pct}%
          </span>
        </li>
      );
    })}
  </ul>
);

const Nps: React.FC<{ q: QuestionSummary }> = ({ q }) => {
  const n = (from: number, to: number) =>
    (q.counts ?? [])
      .filter((c) => Number(c.key) >= from && Number(c.key) <= to)
      .reduce((a, c) => a + c.count, 0);
  const [det, pas, pro] = [n(0, 6), n(7, 8), n(9, 10)];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="NPS" value={q.nps ?? '—'} />
        <KpiCard label="Promotores (9–10)" value={pro} />
        <KpiCard label="Pasivos (7–8)" value={pas} />
        <KpiCard label="Detractores (0–6)" value={det} />
      </div>
      {q.answered > 0 && (
        <StackedBar
          showLegend
          ariaLabel="Reparto de la recomendación"
          segments={[
            { key: 'det', label: 'Detractores', value: det, color: 'rgb(var(--k-danger-rgb))' },
            { key: 'pas', label: 'Pasivos', value: pas, color: 'rgb(var(--k-warning-rgb))' },
            { key: 'pro', label: 'Promotores', value: pro, color: 'rgb(var(--k-success-rgb))' },
          ]}
        />
      )}
    </div>
  );
};

const Texts: React.FC<{ texts: string[] }> = ({ texts }) => (
  <ul className="max-h-72 space-y-2 overflow-y-auto">
    {texts.map((t, i) => (
      <li
        key={i}
        className="rounded-xs bg-bg-muted px-3 py-2 text-sm text-fg-body whitespace-pre-wrap"
      >
        {t}
      </li>
    ))}
  </ul>
);

/** Lo que se pinta para una pregunta según lo que trae su resumen. */
export const QuestionResult: React.FC<{ q: QuestionSummary }> = ({ q }) => {
  if (q.answered === 0) return <p className="text-sm text-fg-muted">Sin respuestas.</p>;
  if (q.nps !== undefined) return <Nps q={q} />;
  return (
    <div className="space-y-3">
      {q.average != null && (
        <p className="text-sm text-fg-body">
          Media: <span className="font-semibold tabular-nums">{q.average}</span>
        </p>
      )}
      {q.counts && <Bars counts={q.counts} total={q.answered} />}
      {q.grid?.map((r) => (
        <div key={r.row} className="space-y-1">
          <div className="text-sm font-medium text-fg-default">{r.row}</div>
          <Bars
            counts={r.cells.map((c, i) => ({ key: String(i), label: c.label, count: c.count }))}
            total={q.answered}
          />
        </div>
      ))}
      {q.texts && q.texts.length > 0 && (
        <>
          {q.counts && (
            <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Respuestas en «Otro»
            </div>
          )}
          <Texts texts={q.texts} />
        </>
      )}
      {q.type === 'file' && (
        <p className="text-sm text-fg-muted">Los archivos se ven en cada respuesta individual.</p>
      )}
    </div>
  );
};

/** Resumen como el de Google: una tarjeta por pregunta. */
export const SummaryView: React.FC<{ summary: FormSummary }> = ({ summary }) => (
  <div className="space-y-4">
    {summary.quiz && (
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Nota media" value={summary.quiz.average ?? '—'} />
        <KpiCard label="Puntuación máxima" value={summary.quiz.maxScore ?? '—'} />
      </div>
    )}
    {summary.questions.map((q) => (
      <Card
        key={q.questionId}
        title={q.title || 'Pregunta sin título'}
        subtitle={`${q.answered} respuesta(s)`}
      >
        <QuestionResult q={q} />
      </Card>
    ))}
  </div>
);
