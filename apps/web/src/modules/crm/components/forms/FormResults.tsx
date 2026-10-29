import React, { useEffect, useState } from 'react';
import { Card, EmptyState, KpiCard, Skeleton, StackedBar } from '@openfactu/ui';
import { BarChart3 } from 'lucide-react';
import { formsApi } from '../../api';
import type { FieldResult } from '../../domain/forms';

/** Barra horizontal con su porcentaje, una por opción. */
const OptionBars: React.FC<{ counts: Record<string, number>; total: number }> = ({
  counts,
  total,
}) => (
  <ul className="space-y-2">
    {Object.entries(counts).map(([label, n]) => {
      const pct = total ? Math.round((n / total) * 100) : 0;
      return (
        <li key={label} className="grid grid-cols-[minmax(0,10rem)_1fr_3.5rem] gap-3 items-center">
          <span className="text-sm text-fg-body truncate">{label}</span>
          <span className="h-2 rounded-full bg-bg-muted overflow-hidden">
            <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
          </span>
          <span className="text-xs tabular-nums text-fg-muted text-right">
            {n} · {pct}%
          </span>
        </li>
      );
    })}
  </ul>
);

const NpsBlock: React.FC<{ r: FieldResult }> = ({ r }) => {
  const c = r.counts ?? {};
  const sum = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => c[String(from + i)] ?? 0).reduce(
      (a, b) => a + b,
      0,
    );
  const detractors = sum(0, 6);
  const passives = sum(7, 8);
  const promoters = sum(9, 10);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="NPS" value={r.nps ?? '—'} />
        <KpiCard label="Promotores (9–10)" value={promoters} />
        <KpiCard label="Pasivos (7–8)" value={passives} />
        <KpiCard label="Detractores (0–6)" value={detractors} />
      </div>
      {r.answered > 0 && (
        <StackedBar
          showLegend
          ariaLabel="Reparto de la recomendación"
          segments={[
            {
              key: 'det',
              label: 'Detractores',
              value: detractors,
              color: 'rgb(var(--k-danger-rgb))',
            },
            { key: 'pas', label: 'Pasivos', value: passives, color: 'rgb(var(--k-warning-rgb))' },
            {
              key: 'pro',
              label: 'Promotores',
              value: promoters,
              color: 'rgb(var(--k-success-rgb))',
            },
          ]}
        />
      )}
    </div>
  );
};

/** Resumen de respuestas por pregunta: recuentos, medias y NPS. */
export const FormResults: React.FC<{ formId: string }> = ({ formId }) => {
  const [data, setData] = useState<{ total: number; fields: FieldResult[] } | null>(null);
  useEffect(() => {
    formsApi
      .results(formId)
      .then(setData)
      .catch(() => setData({ total: 0, fields: [] }));
  }, [formId]);

  if (!data) return <Skeleton className="h-40 w-full" />;
  if (data.total === 0)
    return (
      <EmptyState
        icon={<BarChart3 size={18} />}
        title="Aún no hay respuestas"
        hint="Comparte el enlace o manda invitaciones para empezar a recibirlas."
      />
    );

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">{data.total} respuesta(s) en total.</p>
      {data.fields.map((r) => (
        <Card key={r.fieldId} title={r.label} subtitle={`${r.answered} respuesta(s)`}>
          {r.type === 'nps' ? (
            <NpsBlock r={r} />
          ) : r.counts ? (
            <div className="space-y-3">
              {r.average != null && (
                <p className="text-sm text-fg-body">
                  Media: <span className="font-semibold tabular-nums">{r.average}</span>
                </p>
              )}
              <OptionBars counts={r.counts} total={r.answered} />
            </div>
          ) : r.average != null ? (
            <p className="text-sm text-fg-body">
              Media: <span className="font-semibold tabular-nums">{r.average}</span>
            </p>
          ) : r.samples?.length ? (
            <ul className="space-y-2">
              {r.samples.map((s, i) => (
                <li key={i} className="text-sm text-fg-body border-l-2 border-border-default pl-3">
                  {s}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">Sin respuestas.</p>
          )}
        </Card>
      ))}
    </div>
  );
};
